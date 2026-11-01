import "server-only";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { combine, planForSku, planRank, type Feature, type Limit, type Plan } from "./plans";

const { subscriptions } = schema;

/**
 * A subscription counts while it's active or non-renewing and its paid period
 * hasn't ended, and while past due (dunning ends it after 7 days).
 */
export const entitled = (now: Date) =>
  or(
    eq(subscriptions.status, "past_due"),
    and(
      inArray(subscriptions.status, ["active", "non_renewing"]),
      or(
        isNull(subscriptions.currentPeriodEnd),
        gt(subscriptions.currentPeriodEnd, sql`${now.toISOString()}::timestamptz`),
      ),
    ),
  );

/** The user's current plans. */
export async function plansFor(userId: string, now = new Date()): Promise<Plan[]> {
  const rows = await db()
    .select({ sku: subscriptions.sku })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), entitled(now)));
  return rows.map((r) => planForSku(r.sku)).filter((p): p is Plan => p !== null);
}

/** The user's highest plan, or null on the free tier. */
export async function planFor(userId: string, now = new Date()): Promise<Plan | null> {
  const plans = await plansFor(userId, now);
  return plans.sort((a, b) => planRank(b.id) - planRank(a.id))[0] ?? null;
}

export async function can(userId: string, feature: Feature, now = new Date()): Promise<boolean> {
  return combine(await plansFor(userId, now)).features.has(feature);
}

export async function limit(userId: string, what: Limit, now = new Date()): Promise<number> {
  return combine(await plansFor(userId, now)).limits[what];
}
