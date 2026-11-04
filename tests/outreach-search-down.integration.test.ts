/**
 * When Google blocks our searches, research stops for the run and no business
 * pays for it, against a real Postgres. Runs when TEST_DATABASE_URL is set.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

const researchProspect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outreach/research", () => ({ researchProspect, serpSearch: () => async () => [] }));

describe.skipIf(!TEST_DB)("outreach research while searches are down (Postgres)", () => {
  let dbmod: typeof import("@/db");
  let pipeline: typeof import("@/lib/outreach/pipeline");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.GEMINI_API_KEY = "test";
    process.env.AHREFS_API_KEY = "test";
    process.env.OUTREACH_SMTP_HOST = "smtp.test";
    process.env.OUTREACH_IMAP_HOST = "imap.test";
    process.env.OUTREACH_MAILBOXES = JSON.stringify([{ from: "Henry <henry@trydebutyard.com>", pass: "x" }]);
    (await import("@/env")).resetEnvForTests();
    await resetDatabase(TEST_DB!);
    dbmod = await import("@/db");
    pipeline = await import("@/lib/outreach/pipeline");
    await dbmod
      .db()
      .insert(dbmod.schema.outreachSettings)
      .values({ id: 1, mode: "dry_run" })
      .onConflictDoUpdate({ target: dbmod.schema.outreachSettings.id, set: { mode: "dry_run" } });
  });

  afterAll(async () => {
    for (const k of [
      "GEMINI_API_KEY",
      "AHREFS_API_KEY",
      "OUTREACH_SMTP_HOST",
      "OUTREACH_IMAP_HOST",
      "OUTREACH_MAILBOXES",
    ]) {
      delete process.env[k];
    }
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  it("stops at the first blocked business and counts no attempt against it", async () => {
    const { SearchDownError } = await import("@/lib/links/serp");
    researchProspect.mockRejectedValue(new SearchDownError("OpenSERP returned HTTP 429"));
    const { outreachProspects } = dbmod.schema;
    const rows = await dbmod
      .db()
      .insert(outreachProspects)
      .values(
        ["one", "two"].map((name) => ({
          domain: `${name}.example`,
          name,
          websiteUrl: `https://${name}.example`,
          sourceUrl: "https://directory.example",
          launchEvidence: "Listed today",
          status: "qualified" as const,
          email: `hello@${name}.example`,
        })),
      )
      .returning();

    const result = await pipeline.runResearch();
    expect(result).toMatchObject({ searchDown: "OpenSERP returned HTTP 429" });
    expect(researchProspect).toHaveBeenCalledTimes(1);

    for (const row of rows) {
      const after = await dbmod.db().query.outreachProspects.findFirst({ where: eq(outreachProspects.id, row.id) });
      expect(after).toMatchObject({ status: "qualified", attempts: 0 });
    }
  });
});
