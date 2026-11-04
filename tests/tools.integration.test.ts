/**
 * The free dofollow and DR checkers against a real Postgres, with fetches and
 * the DR provider faked: verdicts, per-tool rate limits, the DR cache and the
 * MCP tools hiding check_dr without a provider. Runs when TEST_DATABASE_URL is set.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrProvider } from "@/lib/metrics/providers";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  sendBatch: vi.fn(async (emails: unknown[]) => emails.length),
}));

const pages = new Map<string, { status: number; body: string }>();
vi.mock("@/lib/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net")>();
  return {
    ...actual,
    safeFetchText: vi.fn(async (url: string) => {
      const page = pages.get(url);
      if (!page) throw new Error("connect ECONNREFUSED");
      return { url, status: page.status, contentType: "text/html", body: page.body };
    }),
  };
});

const drCalls: string[] = [];
const fakeDr: DrProvider = {
  async fetchDr(domain) {
    drCalls.push(domain);
    return { dr: 42 };
  },
};

describe.skipIf(!TEST_DB)("free tools (Postgres)", () => {
  let dbmod: typeof import("@/db");
  let tools: typeof import("@/lib/tools/service");
  let metrics: typeof import("@/lib/metrics/service");
  let mcp: typeof import("@/lib/api/mcp");
  const web = (ip: string) => ({ clientKey: ip, source: "web" as const });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    await resetDatabase(TEST_DB!);
    dbmod = await import("@/db");
    tools = await import("@/lib/tools/service");
    metrics = await import("@/lib/metrics/service");
    mcp = await import("@/lib/api/mcp");
  });

  afterAll(async () => {
    metrics?.setDrProviderForTests(undefined);
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    pages.clear();
    drCalls.length = 0;
    metrics.setDrProviderForTests(null);
    await dbmod.db().execute(sql`truncate tool_checks, domain_metrics`);
  });

  it("reports dofollow, nofollow, missing and unreachable, and rate limits per tool", async () => {
    pages.set("https://dir.test/a", { status: 200, body: '<a href="https://www.acme.io/">Acme</a>' });
    pages.set("https://dir.test/b", { status: 200, body: '<a rel="nofollow ugc" href="https://acme.io">Acme</a>' });
    pages.set("https://dir.test/c", { status: 200, body: "<p>nothing here</p>" });
    pages.set("https://dir.test/d", { status: 404, body: "" });

    expect(await tools.checkDofollow("dir.test/a", "https://acme.io/pricing", web("1.1.1.1"))).toMatchObject({
      pageUrl: "https://dir.test/a",
      domain: "acme.io",
      verdict: "dofollow",
      anchor: "Acme",
    });
    expect(await tools.checkDofollow("https://dir.test/b", "acme.io", web("1.1.1.1"))).toMatchObject({
      verdict: "nofollow",
      rel: "nofollow ugc",
    });
    expect((await tools.checkDofollow("https://dir.test/c", "acme.io", web("1.1.1.1"))).verdict).toBe("missing");
    const down = await tools.checkDofollow("https://dir.test/d", "acme.io", web("1.1.1.1"));
    expect(down).toMatchObject({ verdict: "unreachable", httpStatus: 404 });
    expect(down.explanation).toContain("404");

    await expect(tools.checkDofollow("https://dir.test/a", "localhost", web("1.1.1.1"))).rejects.toThrow("example.com");

    for (let i = 4; i < tools.TOOL_RUNS_PER_HOUR; i++) {
      await tools.checkDofollow("https://dir.test/a", "acme.io", web("1.1.1.1"));
    }
    await expect(tools.checkDofollow("https://dir.test/a", "acme.io", web("1.1.1.1"))).rejects.toMatchObject({
      rateLimited: true,
    });
    // Other callers, and other tools, have their own allowance.
    await tools.checkDofollow("https://dir.test/a", "acme.io", web("2.2.2.2"));
    metrics.setDrProviderForTests(fakeDr);
    expect((await tools.checkDr("acme.io", web("1.1.1.1"))).dr).toBe(42);
  });

  it("checks DR through the 7-day cache, and hides itself without a provider", async () => {
    await expect(tools.checkDr("acme.io", web("1.1.1.1"))).rejects.toThrow("isn't available");
    const names = () => (mcp.TOOLS.filter((t) => t.enabled?.() ?? true) as Array<{ name: string }>).map((t) => t.name);
    expect(names()).toContain("check_dofollow");
    expect(names()).not.toContain("check_dr");

    metrics.setDrProviderForTests(fakeDr);
    expect(names()).toContain("check_dr");
    expect(await tools.checkDr("https://www.acme.io/x", web("1.1.1.1"))).toMatchObject({
      domain: "acme.io",
      dr: 42,
      provider: "ahrefs",
      attribution: { text: "Domain Rating by Ahrefs", url: "https://ahrefs.com/" },
    });
    await tools.checkDr("acme.io", web("1.1.1.1"));
    expect(drCalls).toEqual(["acme.io"]);
  });

  it("limits signed-out visitors per IP, hourly and daily, and says how many checks are left", async () => {
    metrics.setDrProviderForTests(fakeDr);
    const first = await tools.checkDr("acme.io", web("3.3.3.3"));
    expect(first.remaining).toEqual({ hour: 4, day: 14 });
    for (let i = 0; i < 4; i++) await tools.checkDr("acme.io", web("3.3.3.3"));
    await expect(tools.checkDr("acme.io", web("3.3.3.3"))).rejects.toMatchObject({
      rateLimited: true,
      message: expect.stringMatching(/this hour.*Signed-in accounts get more/),
    });

    // Fifteen spread over earlier hours use up the day.
    const now = Date.now();
    for (const hoursAgo of [5, 3, 1.5]) {
      for (let i = 0; i < 5; i++) await tools.checkDr("acme.io", web("6.6.6.6"), new Date(now - hoursAgo * 3600_000));
    }
    await expect(tools.checkDr("acme.io", web("6.6.6.6"))).rejects.toThrow(/for today\. Try again in 19 hours/);
  });

  it("counts signed-in checks against both the account and the IP", async () => {
    metrics.setDrProviderForTests(fakeDr);
    await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values([
        { id: "dr-u1", name: "One", email: "one@dr.test" },
        { id: "dr-u2", name: "Two", email: "two@dr.test" },
      ]);
    const as = (userId: string, ip: string) => ({ clientKey: ip, userId, source: "web" as const });
    for (let i = 0; i < 15; i++) await tools.checkDr("acme.io", as("dr-u1", "4.4.4.4"));
    // A second account on the same IP doesn't get a fresh allowance…
    await expect(tools.checkDr("acme.io", as("dr-u2", "4.4.4.4"))).rejects.toMatchObject({ rateLimited: true });
    // …and the first account can't move to another IP either.
    await expect(tools.checkDr("acme.io", as("dr-u1", "5.5.5.5"))).rejects.toMatchObject({ rateLimited: true });
    expect((await tools.checkDr("acme.io", as("dr-u2", "5.5.5.5"))).remaining).toEqual({ hour: 14, day: 39 });
  });

  it("caps provider lookups site-wide without spending the caller's allowance", async () => {
    metrics.setDrProviderForTests(fakeDr);
    const env = await import("@/env");
    const [{ n }] = await dbmod
      .db()
      .select({ n: sql<number>`count(*)::int` })
      .from(dbmod.schema.toolChecks)
      .where(sql`${dbmod.schema.toolChecks.tool} = 'dr_lookup'`);
    process.env.DR_DAILY_PROVIDER_CAP = String(n + 1);
    env.resetEnvForTests();
    try {
      await tools.checkDr("fresh-one.io", web("7.7.7.7"));
      await expect(tools.checkDr("fresh-two.io", web("7.7.7.7"))).rejects.toThrow("limit for today");
      expect(drCalls).not.toContain("fresh-two.io");
      // Cached domains still work, and the refused lookup didn't count against the visitor.
      expect((await tools.checkDr("fresh-one.io", web("7.7.7.7"))).remaining).toEqual({ hour: 3, day: 13 });
    } finally {
      delete process.env.DR_DAILY_PROVIDER_CAP;
      env.resetEnvForTests();
    }
  });

  it("needs an API token for the check over the API and MCP", async () => {
    metrics.setDrProviderForTests(fakeDr);
    const ops = await import("@/lib/api/operations");
    await expect(
      ops.domainRating({ domain: "acme.io" }, { clientKey: "8.8.8.8", user: null, source: "api" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
