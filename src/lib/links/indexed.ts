import "server-only";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { createSerpProvider, type SerpProvider } from "./serp";

/** Retired for now, and hidden from every page. Flip this, and put the figures back on the dashboards, to bring it back. */
const INDEX_CHECK_ON = false;

const { trackedLinks, submissions } = schema;

/** Weekly, so we don't ask Google more than we need to. */
export const INDEX_CHECK_EVERY_DAYS = 7;
const DAY = 86_400_000;

let override: SerpProvider | null | undefined;

export function serpProvider(): SerpProvider | null {
  if (override !== undefined) return override;
  const { WORKER_URL, WORKER_SECRET } = env();
  return INDEX_CHECK_ON && WORKER_URL && WORKER_SECRET ? createSerpProvider(WORKER_URL, WORKER_SECRET) : null;
}

export const indexCheckEnabled = () => serpProvider() !== null;

/** Test-only: `null` disables the check, `undefined` restores the env provider. */
export function setSerpProviderForTests(p: SerpProvider | null | undefined) {
  override = p;
}

/** Daily cron: checks live links not checked in the last week, oldest first. */
export async function checkIndexed(now = new Date(), batch = 50) {
  const provider = serpProvider();
  if (!provider) return { skipped: "no SERP provider configured" };
  const cutoff = new Date(now.getTime() - INDEX_CHECK_EVERY_DAYS * DAY).toISOString();
  const due = await db()
    .select({ id: trackedLinks.id, url: trackedLinks.url })
    .from(trackedLinks)
    .where(
      and(
        eq(trackedLinks.active, true),
        inArray(trackedLinks.lastVerdict, ["dofollow", "nofollow"]),
        or(isNull(trackedLinks.indexedCheckedAt), lt(trackedLinks.indexedCheckedAt, sql`${cutoff}::timestamptz`)),
      ),
    )
    .orderBy(sql`${trackedLinks.indexedCheckedAt} asc nulls first`, asc(trackedLinks.createdAt))
    .limit(batch);
  let indexed = 0;
  let failed = 0;
  for (const link of due) {
    try {
      const yes = await provider.isIndexed(link.url);
      await db().update(trackedLinks).set({ indexed: yes, indexedCheckedAt: now }).where(eq(trackedLinks.id, link.id));
      if (yes) indexed++;
    } catch (err) {
      failed++;
      console.error("index check failed", link.url, err);
    }
  }
  return { checked: due.length - failed, indexed, failed };
}

/** "41 of 52 live listings indexed" for an order's dashboard. */
export async function orderIndexStats(orderId: string) {
  const [row] = await db()
    .select({
      checked: sql<number>`count(*) filter (where ${trackedLinks.indexed} is not null)::int`,
      indexed: sql<number>`count(*) filter (where ${trackedLinks.indexed})::int`,
    })
    .from(trackedLinks)
    .innerJoin(submissions, eq(submissions.id, trackedLinks.submissionId))
    .where(and(eq(submissions.submissionOrderId, orderId), eq(trackedLinks.active, true)));
  return row ?? { checked: 0, indexed: 0 };
}
