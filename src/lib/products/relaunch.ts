import "server-only";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db, queryRows, schema } from "@/db";
import { FEATURED_DAYS, featuredEndsAt, featuredStartsAt } from "@/lib/board/featured";
import { notifyRerunStarted, notifyRunEnded, type RunStats } from "@/lib/notifications";
import { getSku } from "@/lib/payments/skus";

const { products, featuredReruns, productOrders, orders } = schema;
const DAY_MS = 86_400_000;

/**
 * More featured time for a paid debut, at each tier's own length. Spotlight has no
 * offer: its spots are limited, so one may not be free when the maker comes back.
 */
const RELAUNCH_SKUS = { fast_track: "relaunch_fast_track", pro: "relaunch_pro", premium: "relaunch_premium" } as const;
type RelaunchTier = keyof typeof RELAUNCH_SKUS;

export type RelaunchOffer = { sku: string; days: number; amountCents: number };

/** What this tier can buy, if anything. Pure. */
export function relaunchOffer(tier: string): RelaunchOffer | null {
  if (!(tier in RELAUNCH_SKUS)) return null;
  const sku = RELAUNCH_SKUS[tier as RelaunchTier];
  return { sku, days: FEATURED_DAYS[tier as RelaunchTier], amountCents: getSku(sku)!.amountCents };
}

/** How long a relaunch order runs, whatever tier the listing is on by the time it's paid. Pure. */
export function relaunchDaysForSku(sku: string): number | null {
  const tier = (Object.keys(RELAUNCH_SKUS) as RelaunchTier[]).find((t) => RELAUNCH_SKUS[t] === sku);
  return tier ? FEATURED_DAYS[tier] : null;
}

/**
 * Whether a listing's paid debut still stands. A refund from the admin leaves the
 * tier as it was, so a debut refunded in full is checked for here: we shouldn't
 * promise those makers the paid benefits. A tier staff gave with no order stands.
 */
export async function paidDebutStands(productId: string): Promise<boolean> {
  const rows = await db()
    .select({ status: orders.status })
    .from(productOrders)
    .innerJoin(orders, eq(orders.id, productOrders.orderId))
    .where(and(eq(productOrders.productId, productId), eq(orders.kind, "launch")));
  const refunded = rows.some((r) => r.status === "refunded");
  return !refunded || rows.some((r) => r.status === "paid" || r.status === "partially_refunded");
}

async function latestRerun(productId: string) {
  return db().query.featuredReruns.findFirst({
    where: eq(featuredReruns.productId, productId),
    orderBy: desc(featuredReruns.endsAt),
  });
}

/**
 * The relaunch page's view of a maker's own listing: the offer, and when it's
 * still featured until, which rules out buying more for now. Null if it has no offer.
 */
export async function relaunchFor(userId: string, productId: string, now = new Date()) {
  const product = await db().query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.createdBy, userId)),
  });
  if (!product || product.status !== "approved" || !product.launchWeekKey) return null;
  const offer = relaunchOffer(product.tier);
  const ends = featuredEndsAt(product.tier, product.launchWeekKey, product.approvedAt);
  if (!offer || !ends || !(await paidDebutStands(product.id))) return null;
  const rerun = await latestRerun(product.id);
  const until = rerun && rerun.endsAt > ends ? rerun.endsAt : ends;
  return { product, offer, featuredUntil: until > now ? until : null };
}

/**
 * Fulfils a paid relaunch order. The run starts now, or after whatever is still
 * running if two payments crossed, so nobody pays for overlapping days. The order's
 * unique row means a repeated payment webhook can't add time twice.
 */
export async function startRerun(order: typeof schema.orders.$inferSelect, now = new Date()) {
  const productId = typeof order.metadata.productId === "string" ? order.metadata.productId : null;
  const days = relaunchDaysForSku(order.sku);
  if (!productId || !days) throw new Error(`Relaunch order ${order.id} is missing its product or length`);
  const product = await db().query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error(`Relaunch order ${order.id} names a listing that's gone`);

  const ends = product.launchWeekKey ? featuredEndsAt(product.tier, product.launchWeekKey, product.approvedAt) : null;
  const rerun = await latestRerun(productId);
  const startsAt = new Date(Math.max(now.getTime(), ends?.getTime() ?? 0, rerun?.endsAt.getTime() ?? 0));
  const [row] = await db()
    .insert(featuredReruns)
    .values({
      productId,
      orderId: order.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + days * DAY_MS),
    })
    .onConflictDoNothing({ target: featuredReruns.orderId })
    .returning();
  if (row) await notifyRerunStarted(product, row, order.amountCents);
}

/** How a run did. Views and clicks are the run's; applause and comments are the listing's totals, as on its page. */
async function runStats(productId: string, from: Date, to: Date, withAward: boolean): Promise<RunStats> {
  const [row] = (await queryRows(sql`
    select
      (select count(*)::int from product_events e where e.product_id = ${productId} and e.kind = 'view'
         and e.created_at >= ${from.toISOString()}::timestamptz and e.created_at < ${to.toISOString()}::timestamptz) as views,
      (select count(*)::int from product_events e where e.product_id = ${productId} and e.kind = 'outbound_click'
         and e.created_at >= ${from.toISOString()}::timestamptz and e.created_at < ${to.toISOString()}::timestamptz) as clicks,
      (select count(*)::int from applause a where a.product_id = ${productId}) as applause,
      (select count(*)::int from comments c where c.product_id = ${productId} and c.status = 'visible') as comments,
      (select min(w.place)::int from awards w where w.product_id = ${productId} and w.scope = 'week') as place
  `)) as unknown as Array<{ views: number; clicks: number; applause: number; comments: number; place: number | null }>;
  return { ...row, place: withAward ? row.place : null };
}

/** Only runs that ended this recently get an email, so launching this doesn't email every past debut. */
const LOOKBACK_MS = 14 * DAY_MS;

/**
 * Daily: emails makers whose paid debut or relaunch has finished, with how it did
 * and what they can do next. Each row is claimed first, so a run only ever gets one
 * email. A run with another queued right behind it isn't over yet, so it stays quiet.
 */
export async function sendRunEndEmails(now = new Date()) {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  let sent = 0;

  const debuts = await db()
    .select()
    .from(products)
    .where(
      and(
        eq(products.status, "approved"),
        sql`${products.tier} <> 'free'`,
        sql`${products.launchWeekKey} is not null`,
        isNull(products.runEndedEmailAt),
      ),
    );
  for (const p of debuts) {
    const ends = featuredEndsAt(p.tier, p.launchWeekKey!, p.approvedAt);
    if (!ends || ends > now || ends <= since || !(await paidDebutStands(p.id))) continue;
    const [claimed] = await db()
      .update(products)
      .set({ runEndedEmailAt: now })
      .where(and(eq(products.id, p.id), isNull(products.runEndedEmailAt)))
      .returning({ id: products.id });
    if (!claimed || ((await latestRerun(p.id))?.endsAt ?? ends) > ends) continue;
    const starts = featuredStartsAt(p.launchWeekKey!, p.approvedAt);
    try {
      await notifyRunEnded(p, {
        rerun: false,
        days: FEATURED_DAYS[p.tier as keyof typeof FEATURED_DAYS],
        endedAt: ends,
        stats: await runStats(p.id, starts, ends, true),
        offer: relaunchOffer(p.tier),
      });
      sent++;
    } catch (err) {
      console.error(`run end email failed for ${p.id}`, err);
    }
  }

  const reruns = await db()
    .select({ r: featuredReruns, p: products })
    .from(featuredReruns)
    .innerJoin(products, eq(products.id, featuredReruns.productId))
    .where(
      and(
        isNull(featuredReruns.endedEmailAt),
        lte(featuredReruns.endsAt, now),
        gt(featuredReruns.endsAt, since),
        eq(products.status, "approved"),
      ),
    );
  for (const { r, p } of reruns) {
    const [claimed] = await db()
      .update(featuredReruns)
      .set({ endedEmailAt: now })
      .where(and(eq(featuredReruns.id, r.id), isNull(featuredReruns.endedEmailAt)))
      .returning({ id: featuredReruns.id });
    if (!claimed || (await latestRerun(p.id))!.endsAt > r.endsAt) continue;
    try {
      await notifyRunEnded(p, {
        rerun: true,
        days: Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / DAY_MS),
        endedAt: r.endsAt,
        stats: await runStats(p.id, r.startsAt, r.endsAt, false),
        offer: relaunchOffer(p.tier),
      });
      sent++;
    } catch (err) {
      console.error(`rerun end email failed for ${r.id}`, err);
    }
  }
  return { sent };
}
