/**
 * Monitoring extras against a real Postgres, with fetches, screenshots and
 * the SERP API faked: evidence on change, the weekly index check and the
 * directory liveness audit. Runs when TEST_DATABASE_URL is set.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerpProvider } from "@/lib/links/serp";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; text: string }) => {
    sent.push({ to: e.to, subject: e.subject, text: e.text });
  }),
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
    // The .test hosts don't resolve; only the Firecrawl fallback looks them up.
    assertPublicUrl: vi.fn(async (url: string) => new URL(url)),
  };
});

describe.skipIf(!TEST_DB)("monitoring (Postgres)", () => {
  let dbmod: typeof import("@/db");
  let links: typeof import("@/lib/links/service");
  let indexed: typeof import("@/lib/links/indexed");
  let audit: typeof import("@/lib/directories/audit");
  let evidence: typeof import("@/lib/evidence");
  const shots: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    await resetDatabase(TEST_DB!);
    dbmod = await import("@/db");
    links = await import("@/lib/links/service");
    indexed = await import("@/lib/links/indexed");
    audit = await import("@/lib/directories/audit");
    evidence = await import("@/lib/evidence");
    evidence.setEvidenceForTests(async (url, key) => {
      shots.push(url);
      return `https://cdn.test/${key}`;
    });
  });

  afterAll(async () => {
    evidence?.setEvidenceForTests(undefined);
    indexed?.setSerpProviderForTests(undefined);
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    pages.clear();
    sent.length = 0;
    shots.length = 0;
    await dbmod.db().execute(sql`truncate tracked_links, link_checks, "user" cascade`);
    await dbmod.db().insert(dbmod.schema.user).values({ id: "u", name: "U", email: "u@x.test" });
  });

  const addLink = async (url: string, verdict: "dofollow" | "nofollow" = "dofollow") => {
    const [row] = await dbmod
      .db()
      .insert(dbmod.schema.trackedLinks)
      .values({
        ownerUserId: "u",
        url,
        targetDomain: "acme.io",
        source: "manual",
        lastVerdict: verdict,
        lastCheckedAt: new Date(Date.now() - DAY),
        liveAt: new Date(Date.now() - 30 * DAY),
        nextCheckAt: new Date(Date.now() - 1000),
      })
      .returning();
    return row;
  };

  it("screenshots a listing only when Link Monitor sees a change", async () => {
    const changed = await addLink("https://dir.test/a");
    await addLink("https://dir.test/b");
    pages.set("https://dir.test/a", { status: 200, body: '<a rel="nofollow" href="https://acme.io">Acme</a>' });
    pages.set("https://dir.test/b", { status: 200, body: '<a href="https://acme.io">Acme</a>' });
    await links.monitorLinks(new Date());
    expect(shots).toEqual(["https://dir.test/a"]);
    const [check] = await dbmod
      .db()
      .select()
      .from(dbmod.schema.linkChecks)
      .where(eq(dbmod.schema.linkChecks.trackedLinkId, changed.id));
    expect(check.evidenceUrl).toMatch(/^https:\/\/cdn\.test\/evidence\//);
  });

  it("checks Google indexing weekly, and skips without a provider", async () => {
    indexed.setSerpProviderForTests(null);
    expect(await indexed.checkIndexed()).toEqual({ skipped: "no SERP provider configured" });

    const asked: string[] = [];
    const fake: SerpProvider = {
      id: "serpapi",
      async isIndexed(url) {
        asked.push(url);
        if (url.includes("/err")) throw new Error("quota");
        return url.endsWith("/a");
      },
    };
    indexed.setSerpProviderForTests(fake);
    const a = await addLink("https://dir.test/a");
    await addLink("https://dir.test/b", "nofollow");
    await addLink("https://dir.test/err");
    expect(await indexed.checkIndexed(new Date())).toEqual({ checked: 2, indexed: 1, failed: 1 });
    expect(
      (await dbmod.db().query.trackedLinks.findFirst({ where: eq(dbmod.schema.trackedLinks.id, a.id) }))?.indexed,
    ).toBe(true);

    asked.length = 0;
    await indexed.checkIndexed(new Date(Date.now() + 2 * DAY));
    expect(asked).toEqual(["https://dir.test/err"]);
    asked.length = 0;
    await indexed.checkIndexed(new Date(Date.now() + 8 * DAY));
    expect(asked.sort()).toEqual(["https://dir.test/a", "https://dir.test/b", "https://dir.test/err"]);
  });

  it("audits directory homepages and retires ones that stay down", async () => {
    const { db, schema } = dbmod;
    await db().execute(sql`truncate directories cascade`);
    const [up, down] = await db()
      .insert(schema.directories)
      .values([
        { slug: "up", name: "Up", url: "https://up.test" },
        { slug: "down", name: "Down", url: "https://down.test" },
      ])
      .returning();
    pages.set("https://up.test", { status: 200, body: "<h1>hi</h1>" });
    pages.set("https://down.test", { status: 503, body: "" });

    const t0 = Date.now();
    expect(await audit.auditDirectories(new Date(t0))).toEqual({ audited: 2, failed: 1, blocked: 0, deactivated: 0 });
    // Healthy ones wait a month; failing ones are retried after a few days.
    expect(await audit.auditDirectories(new Date(t0 + 4 * DAY))).toMatchObject({ audited: 1 });
    expect(await audit.auditDirectories(new Date(t0 + 8 * DAY))).toMatchObject({ audited: 1, deactivated: 1 });
    const row = (id: string) => db().query.directories.findFirst({ where: eq(schema.directories.id, id) });
    expect(await row(down.id)).toMatchObject({ isActive: false, auditFailures: 3, auditError: "HTTP 503" });
    expect(await row(up.id)).toMatchObject({ isActive: true, auditFailures: 0 });
    expect(sent.find((e) => e.subject.includes("deactivated"))?.text).toContain("Down: https://down.test (HTTP 503)");
    expect(await audit.auditDirectories(new Date(t0 + 31 * DAY))).toMatchObject({ audited: 1, failed: 0 });
  });

  it("never retires a directory for turning our bot away, and lets Firecrawl get through", async () => {
    const { db, schema } = dbmod;
    await db().execute(sql`truncate directories cascade`);
    const [walled, rescued] = await db()
      .insert(schema.directories)
      .values([
        // Two strikes from before blocked sites stopped counting.
        { slug: "walled", name: "Walled", url: "https://walled.test", auditFailures: 2, auditError: "HTTP 403" },
        { slug: "rescued", name: "Rescued", url: "https://rescued.test" },
      ])
      .returning();
    pages.set("https://walled.test", { status: 403, body: "Forbidden" });
    pages.set("https://rescued.test", { status: 429, body: "Slow down" });
    const row = (id: string) => db().query.directories.findFirst({ where: eq(schema.directories.id, id) });

    // Without a key, both stay active and neither is counted as a failure.
    expect(await audit.auditDirectories()).toEqual({ audited: 2, failed: 0, blocked: 2, deactivated: 0 });
    expect(await row(walled.id)).toMatchObject({
      isActive: true,
      auditFailures: 0,
      auditError: "Blocked (HTTP 403)",
    });
    expect(await row(rescued.id)).toMatchObject({ auditFailures: 0, auditError: "Blocked (HTTP 429)" });
    const mail = sent.find((e) => e.subject === "Directory audit: 2 directories blocked");
    expect(mail?.text).toContain("Walled: https://walled.test (HTTP 403)");
    expect(mail?.text).not.toContain("no longer picked for orders");

    // With one, Firecrawl gets through to the second and is turned away by the first.
    process.env.FIRECRAWL_API_KEY = "fc-test";
    (await import("@/env")).resetEnvForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const statusCode = JSON.parse(String(init.body)).url === "https://rescued.test" ? 200 : 403;
        return Response.json({ success: true, data: { rawHtml: "<h1>hi</h1>", metadata: { statusCode } } });
      }),
    );
    try {
      expect(await audit.auditDirectories(new Date(Date.now() + 31 * DAY))).toEqual({
        audited: 2,
        failed: 0,
        blocked: 1,
        deactivated: 0,
      });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.FIRECRAWL_API_KEY;
      (await import("@/env")).resetEnvForTests();
    }
    expect(await row(walled.id)).toMatchObject({ isActive: true, auditError: "Blocked (HTTP 403)" });
    expect(await row(rescued.id)).toMatchObject({ isActive: true, auditFailures: 0, auditError: null });
  });
});
