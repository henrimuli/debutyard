import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { getProvider } from "@/lib/payments";
import { getSku, isAdPlan } from "@/lib/payments/skus";
import type { SubscriptionState } from "@/lib/payments/types";
import { can, entitled } from "./entitlements";
import { ALWAYS_FEATURED_SKUS, planForSku, quarterKey } from "./plans";

const { subscriptions, products, planCredits } = schema;
export type Subscription = typeof subscriptions.$inferSelect;

export class BillingError extends Error {}

const DAY = 86_400_000;
/** Dunning emails go out on these days after a renewal fails; the plan ends after the last. */
export const DUNNING_DAYS = [0, 3, 7] as const;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const url = (path: string) => new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
const date = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

async function mailUser(userId: string, subject: string, lines: string[]) {
  const u = await db().query.user.findFirst({ where: eq(schema.user.id, userId), columns: { email: true } });
  if (!u) return;
  await sendEmail({
    to: u.email,
    ...renderEmail({
      variant: "customer",
      label: "Billing",
      subject,
      reason: "you have a DebutYard plan",
      blocks: [
        { heading: subject },
        ...lines.filter(Boolean).map((text) => ({ text })),
        { button: "Manage your plan", href: url("/dashboard/billing") },
      ],
    }),
  });
}

const planName = (sub: Subscription) => planForSku(sub.sku)?.label ?? getSku(sub.sku)?.name ?? "plan";

const WELCOME: Record<string, string> = {
  link_monitor_100: "Add the pages that link to you on your Link Monitor page and we'll check them every week.",
  link_monitor_500: "Add the pages that link to you on your Link Monitor page and we'll check them every week.",
  maker_pro:
    "Your perks: a free Fast Track each quarter (pick it when you submit), Authority Score tracking, 100 monitored links, the Pro badge on your profile and listings, and featured slots bookable 4 extra weeks ahead.",
  always_featured:
    "Pick the listing to feature on your billing page. It shows in the homepage featured rail and rotates as a category sponsor while your plan is active.",
};

/**
 * Applies a status from a webhook or the daily sync, with its side effects:
 * welcome, renewal-failure (dunning day 0), cancellation and end-of-plan
 * emails. Cancelling keeps paid-up access until the period ends.
 */
export async function applySubscriptionState(
  sub: Subscription,
  next: SubscriptionState & { providerSubscriptionId?: string },
  now = new Date(),
): Promise<Subscription> {
  let status = next.status;
  const periodEnd = next.currentPeriodEnd ?? sub.currentPeriodEnd;
  if (status === "pending" && sub.status !== "pending") status = sub.status;
  // Cancelling is final for this subscription (subscribing again makes a new one), and keeps
  // paid-up access until the period ends.
  if (sub.status === "non_renewing" && (status === "active" || status === "past_due")) status = "non_renewing";
  if (status === "cancelled" && sub.status === "non_renewing" && periodEnd && periodEnd > now) status = "non_renewing";

  const [updated] = await db()
    .update(subscriptions)
    .set({
      status,
      providerSubscriptionId: next.providerSubscriptionId ?? sub.providerSubscriptionId,
      providerToken: next.providerToken ?? sub.providerToken,
      currentPeriodEnd: periodEnd,
      syncedAt: now,
      ...(status === "cancelled" && sub.status !== "cancelled" ? { cancelledAt: now } : {}),
      ...(status === "past_due" && sub.status !== "past_due" ? { pastDueAt: now, dunningStage: 0 } : {}),
      ...(status === "active" ? { pastDueAt: null, dunningStage: 0 } : {}),
    })
    .where(eq(subscriptions.id, sub.id))
    .returning();
  // Before the emails, so a failed send that retries this still moves the slot along.
  if (isAdPlan(updated.sku)) {
    const { syncRecurringBooking } = await import("@/lib/ads/service");
    await syncRecurringBooking(updated, now);
  }
  if (status === sub.status) return updated;

  const name = planName(updated);
  const ad = isAdPlan(updated.sku);
  const plan = planForSku(updated.sku);
  if (status === "active" && (sub.status === "pending" || sub.status === "cancelled")) {
    // A recurring slot's "Booked" email is the welcome.
    if (!ad)
      await mailUser(updated.userId, `Welcome to ${name}`, [
        `Your ${name} plan is active${periodEnd ? ` and renews on ${date(periodEnd)}` : ""}.`,
        plan ? (WELCOME[plan.id] ?? "") : "",
      ]);
  } else if (status === "active" && sub.status === "past_due") {
    await mailUser(updated.userId, `Your ${name} payment went through`, [
      "Thanks: your payment went through and your plan is active again.",
    ]);
  } else if (status === "past_due") {
    return (await dunningStep(updated, now)) ?? updated;
  } else if (status === "non_renewing") {
    await mailUser(updated.userId, `Your ${name} plan won't renew`, [
      ad
        ? `You've cancelled ${name}. Your ad keeps running for the time you've paid for, then the slot is released. You won't be charged again.`
        : `You've cancelled ${name}. You keep everything until ${date(periodEnd)}, and you won't be charged again.`,
      "Changed your mind? You can subscribe again from the pricing page at any time.",
    ]);
  } else if (status === "cancelled" && sub.status !== "pending") {
    await mailUser(updated.userId, `Your ${name} plan has ended`, [
      ad
        ? `Your ${name} plan has ended and its slot has been released. Your listing and its stats are still here.`
        : `Your ${name} plan has ended. Your links, listings and history are still here; the plan's features are off until you subscribe again.`,
    ]);
  }
  return updated;
}

/**
 * Sends the next dunning email if it's due (day 0, 3, 7 after the renewal
 * failed). After the last one the plan ends; the data stays. Each step is
 * claimed on `dunning_stage`, so it runs once.
 */
async function dunningStep(sub: Subscription, now: Date): Promise<Subscription | null> {
  if (sub.status !== "past_due" || !sub.pastDueAt) return null;
  const stage = sub.dunningStage;
  if (stage >= DUNNING_DAYS.length) return null;
  if (now.getTime() - sub.pastDueAt.getTime() < DUNNING_DAYS[stage] * DAY) return null;
  const last = stage === DUNNING_DAYS.length - 1;
  const [claimed] = await db()
    .update(subscriptions)
    .set({
      dunningStage: stage + 1,
      ...(last ? { status: "cancelled" as const, cancelledAt: now } : {}),
    })
    .where(
      and(eq(subscriptions.id, sub.id), eq(subscriptions.dunningStage, stage), eq(subscriptions.status, "past_due")),
    )
    .returning();
  if (!claimed) return null;

  const name = planName(sub);
  if (stage === 0) {
    await mailUser(sub.userId, `Your ${name} payment didn't go through`, [
      `We couldn't take the renewal payment for ${name}. Your provider will retry. To keep your plan, check your card or payment method with ${sub.provider === "paystack" ? "Paystack" : "PayPal"}.`,
      isAdPlan(sub.sku)
        ? `Your ad stops when the time you've paid for runs out. We'll hold your slot until ${date(new Date(sub.pastDueAt!.getTime() + DUNNING_DAYS[DUNNING_DAYS.length - 1] * DAY))}, then release it if the payment still fails.`
        : `Your plan stays on for now. If the payment still fails, it ends on ${date(new Date(sub.pastDueAt!.getTime() + DUNNING_DAYS[DUNNING_DAYS.length - 1] * DAY))}.`,
    ]);
  } else if (!last) {
    await mailUser(sub.userId, `Reminder: your ${name} payment is still failing`, [
      `The renewal payment for ${name} still hasn't gone through. Update your payment method so your plan doesn't end.`,
    ]);
  } else {
    await mailUser(sub.userId, `Your ${name} plan has ended`, [
      isAdPlan(sub.sku)
        ? `We couldn't take payment for ${name}, so the plan has ended and its slot has been released. Your listing and its stats are kept.`
        : `We couldn't take payment for ${name}, so the plan has ended. Your links, listings and history are kept: subscribe again any time to turn its features back on.`,
    ]);
  }
  return claimed;
}

/**
 * Daily: re-fetches subscriptions we haven't heard about for a day (missed
 * webhooks), ends non-renewing plans whose period is over, and moves dunning
 * along.
 */
export async function syncSubscriptions(now = new Date(), batch = 100) {
  const stale = await db()
    .select()
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, ["pending", "active", "non_renewing", "past_due"]),
        isNotNull(subscriptions.providerSubscriptionId),
        or(isNull(subscriptions.syncedAt), lt(subscriptions.syncedAt, ts(new Date(now.getTime() - DAY)))),
      ),
    )
    .orderBy(sql`${subscriptions.syncedAt} asc nulls first`)
    .limit(batch);
  let synced = 0;
  for (const sub of stale) {
    try {
      const state = await getProvider(sub.provider).getSubscription(sub.providerSubscriptionId!);
      await applySubscriptionState(sub, state, now);
      synced++;
    } catch (err) {
      console.error(`subscription sync ${sub.id}`, err);
    }
  }

  const ended = await db()
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(subscriptions.status, "non_renewing"), lte(subscriptions.currentPeriodEnd, ts(now))))
    .returning({ id: subscriptions.id });

  let dunning = 0;
  const pastDue = await db().select().from(subscriptions).where(eq(subscriptions.status, "past_due"));
  for (const sub of pastDue) if (await dunningStep(sub, now)) dunning++;
  return { synced, ended: ended.length, dunning };
}

/** The user's subscriptions, newest first (billing page). */
export async function subscriptionsFor(userId: string) {
  return db()
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "non_renewing", "past_due"])))
    .orderBy(desc(subscriptions.createdAt));
}

/** Paid one-time orders, as receipts. */
export async function receiptsFor(userId: string) {
  return db()
    .select()
    .from(schema.orders)
    .where(
      and(eq(schema.orders.userId, userId), inArray(schema.orders.status, ["paid", "refunded", "partially_refunded"])),
    )
    .orderBy(desc(schema.orders.paidAt))
    .limit(50);
}

/** Always Featured: picks which approved listing of the subscriber's to feature. */
export async function setFeaturedListing(userId: string, subscriptionId: string, productId: string | null) {
  const sub = await db().query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)),
  });
  if (!sub || planForSku(sub.sku)?.id !== "always_featured") throw new BillingError("Subscription not found.");
  if (productId) {
    const p = await db().query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.createdBy, userId)),
      columns: { status: true },
    });
    if (!p) throw new BillingError("Pick one of your listings.");
    if (p.status !== "approved") throw new BillingError("Only approved listings can be featured.");
  }
  await db().update(subscriptions).set({ featuredProductId: productId }).where(eq(subscriptions.id, sub.id));
}

/** Listings featured by an active Always Featured plan right now. */
export async function alwaysFeatured(now = new Date()) {
  return db()
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      tagline: products.tagline,
      logoUrl: products.logoUrl,
    })
    .from(subscriptions)
    .innerJoin(products, eq(products.id, subscriptions.featuredProductId))
    .where(
      and(
        inArray(subscriptions.sku, ALWAYS_FEATURED_SKUS),
        entitled(now),
        eq(products.status, "approved"),
        sql`${products.createdBy} = ${subscriptions.userId}`,
      ),
    )
    .orderBy(subscriptions.createdAt);
}

/** Has the user used this quarter's free Fast Track? */
export async function fastTrackCredit(userId: string, now = new Date()) {
  if (!(await can(userId, "free_fast_track", now))) return { eligible: false, available: false };
  const used = await db().query.planCredits.findFirst({
    where: and(
      eq(planCredits.userId, userId),
      eq(planCredits.kind, "fast_track"),
      eq(planCredits.periodKey, quarterKey(now)),
    ),
  });
  return { eligible: true, available: !used };
}

/**
 * Claims this quarter's free Fast Track for a product. The unique key on
 * (user, kind, quarter) makes the claim, so it can't be used twice.
 */
export async function claimFastTrackCredit(userId: string, productId: string, now = new Date()) {
  if (!(await can(userId, "free_fast_track", now))) throw new BillingError("Free Fast Track comes with Maker Pro.");
  const [row] = await db()
    .insert(planCredits)
    .values({ userId, kind: "fast_track", periodKey: quarterKey(now), targetId: productId })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new BillingError("You've used this quarter's free Fast Track.");
  return row;
}

/** Releases a claim if applying it failed. */
export async function releaseFastTrackCredit(id: string) {
  await db().delete(planCredits).where(eq(planCredits.id, id));
}

/**
 * Maker Pro: upgrades one of the user's listings to Fast Track with this
 * quarter's credit, no payment. Same effect as buying it.
 */
export async function redeemFastTrack(userId: string, productId: string, now = new Date()) {
  const { applyPaidTier, assertHasScreenshot } = await import("@/lib/products/service");
  const { tierRank, TIERS } = await import("@/lib/products/input");
  const notify = await import("@/lib/notifications");
  const p = await db().query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.createdBy, userId)),
  });
  if (!p) throw new BillingError("Listing not found.");
  if (p.status === "archived") throw new BillingError("This listing is archived.");
  if (tierRank(p.tier) >= tierRank("fast_track"))
    throw new BillingError(`This listing already has ${TIERS[p.tier].label}.`);
  await assertHasScreenshot(p);

  const credit = await claimFastTrackCredit(userId, productId, now);
  try {
    const updated = await applyPaidTier(productId, "fast_track", null);
    await notify.notifyPaidTierApplied(updated, `${TIERS.fast_track.label} (Maker Pro credit)`);
    if (p.status !== "pending" && updated.status === "pending") await notify.notifyProductSubmitted(updated);
    return updated;
  } catch (err) {
    await releaseFastTrackCredit(credit.id);
    throw err;
  }
}

/** Users (of the given ids) with the Pro badge right now. */
export async function proUserIds(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.userId, userIds),
        inArray(subscriptions.sku, ["sub_maker_pro_monthly", "sub_maker_pro_yearly"]),
        entitled(now),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}
