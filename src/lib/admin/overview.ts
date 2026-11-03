import "server-only";
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";

const DAY = 86_400_000;
const PAID = ["paid", "partially_refunded"] as const;
const num = (v: unknown) => Number(v ?? 0);

/** Everything the admin dashboard shows, in one round of parallel queries. */
export async function adminOverview(now = new Date()) {
  const {
    orders,
    refunds,
    products,
    submissionOrders,
    user,
    newsletterSubscribers,
    subscriptions,
    // affiliateReferrals, (affiliates are paused)
    adBookings,
    trackedLinks,
  } = schema;
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const hourAgo = new Date(now.getTime() - 3_600_000);

  const [
    revenue30,
    revenuePrev30,
    revenueAll,
    byKind,
    refunds30,
    stuck,
    review,
    orderStatuses,
    users,
    newUsers,
    subscribers,
    subs,
    // affiliateOwed, (affiliates are paused)
    activeAds,
    links,
    recentOrders,
  ] = await Promise.all([
    db()
      .select({ cents: sum(orders.amountCents), n: count() })
      .from(orders)
      .where(and(inArray(orders.status, PAID), gte(orders.paidAt, since30))),
    db()
      .select({ cents: sum(orders.amountCents) })
      .from(orders)
      .where(and(inArray(orders.status, PAID), gte(orders.paidAt, since60), lt(orders.paidAt, since30))),
    db()
      .select({ cents: sum(orders.amountCents) })
      .from(orders)
      .where(inArray(orders.status, PAID)),
    db()
      .select({ kind: orders.kind, cents: sum(orders.amountCents), n: count() })
      .from(orders)
      .where(and(inArray(orders.status, PAID), gte(orders.paidAt, since30)))
      .groupBy(orders.kind),
    db()
      .select({ cents: sum(refunds.amountCents) })
      .from(refunds)
      .where(and(eq(refunds.status, "processed"), gte(refunds.createdAt, since30))),
    // Checkouts left pending for over an hour: abandoned, or a webhook that never arrived.
    db()
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.status, "pending"), lt(orders.createdAt, hourAgo), gte(orders.createdAt, since7))),
    db()
      .select({ n: count(), oldest: sql<Date | null>`min(${products.submittedAt})` })
      .from(products)
      .where(eq(products.status, "pending")),
    db()
      .select({ status: submissionOrders.status, n: count() })
      .from(submissionOrders)
      .groupBy(submissionOrders.status),
    db().select({ n: count() }).from(user),
    db().select({ n: count() }).from(user).where(gte(user.createdAt, since7)),
    db().select({ n: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
    db()
      .select({ sku: subscriptions.sku, n: count() })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["active", "non_renewing", "past_due"]))
      .groupBy(subscriptions.sku),
    // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
    // db()
    //   .select({ cents: sum(affiliateReferrals.commissionCents) })
    //   .from(affiliateReferrals)
    //   .where(eq(affiliateReferrals.status, "approved")),
    db().select({ n: count() }).from(adBookings).where(eq(adBookings.status, "active")),
    db()
      .select({ verdict: trackedLinks.lastVerdict, n: count() })
      .from(trackedLinks)
      .where(eq(trackedLinks.active, true))
      .groupBy(trackedLinks.lastVerdict),
    db()
      .select({
        id: orders.id,
        email: orders.email,
        kind: orders.kind,
        amountCents: orders.amountCents,
        status: orders.status,
        provider: orders.provider,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(10),
  ]);

  const linkCounts = Object.fromEntries(links.map((l) => [l.verdict ?? "unchecked", l.n]));
  return {
    revenue: {
      last30Cents: num(revenue30[0]?.cents),
      prev30Cents: num(revenuePrev30[0]?.cents),
      allTimeCents: num(revenueAll[0]?.cents),
      paidOrders30: revenue30[0]?.n ?? 0,
      refunds30Cents: num(refunds30[0]?.cents),
      byKind: byKind.map((k) => ({ kind: k.kind, cents: num(k.cents), n: k.n })).sort((a, b) => b.cents - a.cents),
    },
    stuckCheckouts: stuck[0]?.n ?? 0,
    review: { pending: review[0]?.n ?? 0, oldest: review[0]?.oldest ? new Date(review[0].oldest) : null },
    submissionOrders: Object.fromEntries(orderStatuses.map((s) => [s.status, s.n])) as Record<string, number>,
    users: { total: users[0]?.n ?? 0, new7: newUsers[0]?.n ?? 0 },
    subscribers: subscribers[0]?.n ?? 0,
    subscriptions: subs.map((s) => ({ sku: s.sku, n: s.n })),
    // affiliateOwedCents: num(affiliateOwed[0]?.cents), (affiliates are paused)
    activeAds: activeAds[0]?.n ?? 0,
    links: {
      active: links.reduce((t, l) => t + l.n, 0),
      problems: (linkCounts.missing ?? 0) + (linkCounts.unreachable ?? 0) + (linkCounts.nofollow ?? 0),
    },
    recentOrders,
  };
}

export type CronStatus = {
  job: string;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  failed: string[];
  stale: boolean;
};

/** Latest run of each cron job; `stale` when a job that should run daily hasn't in 26 hours. */
export async function cronStatus(now = new Date()): Promise<CronStatus[]> {
  const { cronRuns } = schema;
  const latest = await db()
    .selectDistinctOn([cronRuns.job])
    .from(cronRuns)
    .orderBy(cronRuns.job, desc(cronRuns.startedAt));
  const byJob = new Map(latest.map((r) => [r.job, r]));
  return ["daily", "hourly", "outreach", "outreach-research", "outreach-send"].flatMap((job) => {
    const r = byJob.get(job);
    // The hourly jobs are optional (Vercel Pro only); only show them once they have run.
    if (!r && job !== "daily") return [];
    return [
      {
        job,
        lastStartedAt: r?.startedAt ?? null,
        lastFinishedAt: r?.finishedAt ?? null,
        failed: r?.failed ?? [],
        stale: !r || now.getTime() - r.startedAt.getTime() > (job === "daily" ? 26 : 3) * 3_600_000,
      },
    ];
  });
}

/** Keeps the last 90 days of cron history. */
export async function pruneCronRuns(now = new Date()) {
  await db()
    .delete(schema.cronRuns)
    .where(lt(schema.cronRuns.startedAt, new Date(now.getTime() - 90 * DAY)));
}
