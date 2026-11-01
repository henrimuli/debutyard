import "server-only";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { planForSku, planRank } from "@/lib/billing/plans";
import { getProvider } from "./index";
import { runFulfillment } from "./fulfillment";
import "./handlers";
import { CouponError, quote, type CouponRule } from "./pricing";
import { getSku, type OneTimeSku } from "./skus";
import type { ProviderId, VerifiedPayment, WebhookEvent } from "./types";

const { orders, coupons, paymentEvents, refunds, subscriptions, providerPlans } = schema;

export type Order = typeof orders.$inferSelect;

export class CheckoutError extends Error {}

function siteUrl(path: string) {
  return new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
}

/** Whether this buyer (by email or account) already paid for a debut. Refunded in full doesn't count. */
async function hasPaidDebut(email: string, userId: string | null): Promise<boolean> {
  const byEmail = sql`lower(${orders.email}) = ${email.trim().toLowerCase()}`;
  const who = userId ? or(byEmail, eq(orders.userId, userId)) : byEmail;
  const row = await db().query.orders.findFirst({
    where: and(eq(orders.kind, "launch"), or(eq(orders.status, "paid"), eq(orders.status, "partially_refunded")), who),
    columns: { id: true },
  });
  return Boolean(row);
}

/** Creates a pending order and returns the provider URL to send the buyer to. */
export async function startCheckout(input: {
  skuId: string;
  provider: ProviderId;
  email: string;
  userId?: string | null;
  couponCode?: string | null;
  metadata?: Record<string, unknown>;
  /** "dashboard": the provider returns the buyer to /dashboard/checkout/* instead of /checkout/*. */
  returnTo?: "dashboard";
}): Promise<{ orderId: string; url: string }> {
  const sku = getSku(input.skuId);
  if (!sku || sku.type !== "one_time") throw new CheckoutError("Unknown product.");

  const found = input.couponCode
    ? await db().query.coupons.findFirst({ where: eq(coupons.code, input.couponCode.trim().toUpperCase()) })
    : null;
  if (input.couponCode && !found) throw new CouponError("Unknown coupon code.");
  if (found?.firstPurchaseOnly && (await hasPaidDebut(input.email, input.userId ?? null))) {
    throw new CouponError("This coupon is for your first paid debut.");
  }
  const coupon: CouponRule | null = found ?? null;
  const price = quote(sku as OneTimeSku, coupon);

  const [order] = await db()
    .insert(orders)
    .values({
      userId: input.userId ?? null,
      email: input.email,
      kind: sku.kind,
      sku: sku.id,
      listAmountCents: price.listAmountCents,
      discountCents: price.discountCents,
      amountCents: price.amountCents,
      currency: "USD",
      couponId: price.couponId,
      provider: input.provider,
      metadata: input.metadata ?? {},
    })
    .returning();

  const provider = getProvider(input.provider);
  const base = input.returnTo === "dashboard" ? "/dashboard/checkout" : "/checkout";
  try {
    const session = await provider.createCheckout({
      orderId: order.id,
      email: input.email,
      amountCents: price.amountCents,
      currency: "USD",
      description: `DebutYard: ${sku.name}`,
      returnUrl: siteUrl(`${base}/return?provider=${input.provider}&order=${order.id}`),
      cancelUrl: siteUrl(`${base}/cancelled?order=${order.id}`),
    });
    await db().update(orders).set({ providerRef: session.providerRef }).where(eq(orders.id, order.id));
    return { orderId: order.id, url: session.url };
  } catch (err) {
    await db()
      .update(orders)
      .set({ status: "failed", failureReason: err instanceof Error ? err.message : "Checkout failed" })
      .where(eq(orders.id, order.id));
    throw err;
  }
}

/**
 * Applies a verified result to its order. Idempotent: the status change and
 * fulfilment happen once, so retries, the return page and webhooks can all call this.
 */
export async function applyVerifiedPayment(provider: ProviderId, result: VerifiedPayment): Promise<Order | null> {
  const order = await db().query.orders.findFirst({
    where: and(eq(orders.provider, provider), eq(orders.providerRef, result.providerRef)),
  });
  if (!order) return null;

  if (result.status === "pending") return order;

  if (result.status === "failed") {
    const [updated] = await db()
      .update(orders)
      .set({ status: "failed", failureReason: result.reason ?? "Payment failed" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning();
    return updated ?? order;
  }

  if (result.orderId && result.orderId !== order.id) {
    throw new Error(`Payment ${result.providerRef} belongs to order ${result.orderId}, not ${order.id}`);
  }
  if (result.amountCents !== order.amountCents || result.currency.toUpperCase() !== order.currency) {
    const [updated] = await db()
      .update(orders)
      .set({
        status: "failed",
        failureReason: `Amount mismatch: paid ${result.amountCents} ${result.currency}, expected ${order.amountCents} ${order.currency}`,
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning();
    return updated ?? order;
  }

  // A failed order can still become paid: buyers retry a declined card within the
  // same checkout, and a late payment can land after we marked a checkout abandoned.
  const [paid] = await db()
    .update(orders)
    .set({ status: "paid", paidAt: new Date(), providerCaptureId: result.captureId ?? null, failureReason: null })
    .where(and(eq(orders.id, order.id), or(eq(orders.status, "pending"), eq(orders.status, "failed"))))
    .returning();
  if (paid?.couponId) {
    await db()
      .update(coupons)
      .set({ redeemedCount: sql`${coupons.redeemedCount} + 1` })
      .where(eq(coupons.id, paid.couponId));
  }

  // Affiliate commission, once per order. Never blocks fulfilment.
  // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
  // if (paid) {
  //   try {
  //     const { recordReferral } = await import("@/lib/affiliates/service");
  //     await recordReferral(paid);
  //   } catch (err) {
  //     console.error("recording referral failed", err);
  //   }
  // }

  // Runs on first payment, and again on later calls (webhook retries, reconciliation)
  // if an earlier fulfilment attempt failed.
  return fulfil(paid ?? order);
}

/**
 * Claims the order by setting fulfilled_at, so concurrent callers (return page
 * and webhook) can't both run it; the claim is released if the handler fails.
 */
async function fulfil(order: Order): Promise<Order> {
  if (order.status !== "paid" || order.fulfilledAt) return order;
  const [claimed] = await db()
    .update(orders)
    .set({ fulfilledAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.status, "paid"), isNull(orders.fulfilledAt)))
    .returning();
  if (!claimed) return order;

  try {
    if (await runFulfillment(claimed)) return claimed;
    // No handler for this kind yet: leave it unfulfilled for a later phase to pick up.
    const [released] = await db().update(orders).set({ fulfilledAt: null }).where(eq(orders.id, order.id)).returning();
    return released;
  } catch (err) {
    await db().update(orders).set({ fulfilledAt: null }).where(eq(orders.id, order.id));
    throw err;
  }
}

/** Asks the provider for the payment's status (capturing PayPal orders) and applies it. */
export async function confirmPayment(provider: ProviderId, providerRef: string): Promise<Order | null> {
  const result = await getProvider(provider).verifyPayment(providerRef);
  return applyVerifiedPayment(provider, result);
}

/** Verifies, records and processes a webhook. Duplicate deliveries are ignored. */
export async function handleWebhook(provider: ProviderId, rawBody: string, headers: Headers): Promise<WebhookEvent> {
  const event = await getProvider(provider).parseWebhook(rawBody, headers);

  const [stored] = await db()
    .insert(paymentEvents)
    .values({ provider, eventId: event.eventId, type: event.type, payload: JSON.parse(rawBody) })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  if (!stored) return event; // Already received.

  try {
    await processEvent(provider, event);
    await db().update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, stored.id));
  } catch (err) {
    // Drop the row so the provider's retry (it re-sends on non-2xx) is processed again.
    await db().delete(paymentEvents).where(eq(paymentEvents.id, stored.id));
    throw err;
  }
  return event;
}

async function processEvent(provider: ProviderId, event: WebhookEvent) {
  switch (event.kind) {
    case "payment_succeeded":
      // Never trust the payload alone: re-verify with the provider.
      if (event.providerRef) await confirmPayment(provider, event.providerRef);
      return;
    case "payment_failed":
      if (event.providerRef) {
        await applyVerifiedPayment(provider, {
          status: "failed",
          providerRef: event.providerRef,
          reason: event.reason,
        });
      }
      return;
    case "refund_processed": {
      const order = await db().query.orders.findFirst({
        where: and(eq(orders.provider, provider), eq(orders.providerRef, event.providerRef)),
      });
      await db()
        .update(refunds)
        .set({ status: "processed" })
        .where(
          and(
            eq(refunds.status, "pending"),
            order
              ? or(eq(refunds.providerRef, event.providerRef), eq(refunds.orderId, order.id))
              : eq(refunds.providerRef, event.providerRef),
          ),
        );
      return;
    }
    case "subscription_updated":
      await applySubscriptionUpdate(provider, event);
      return;
    case "ignored":
      return;
  }
}

async function applySubscriptionUpdate(
  provider: ProviderId,
  event: Extract<WebhookEvent, { kind: "subscription_updated" }>,
) {
  let sub = event.providerSubscriptionId
    ? await db().query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.provider, provider),
          eq(subscriptions.providerSubscriptionId, event.providerSubscriptionId),
        ),
      })
    : undefined;

  if (!sub && event.ourSubscriptionId) {
    sub = await db().query.subscriptions.findFirst({ where: eq(subscriptions.id, event.ourSubscriptionId) });
  }

  if (!sub && event.customerEmail && event.planId) {
    // Paystack: match the newest pending subscription for this customer and plan.
    const rows = await db()
      .select({ sub: subscriptions })
      .from(subscriptions)
      .innerJoin(schema.user, eq(schema.user.id, subscriptions.userId))
      .where(
        and(
          eq(subscriptions.provider, provider),
          eq(subscriptions.providerPlanId, event.planId),
          eq(subscriptions.status, "pending"),
          eq(schema.user.email, event.customerEmail),
        ),
      )
      .orderBy(sql`${subscriptions.createdAt} desc`)
      .limit(1);
    sub = rows[0]?.sub;
  }

  if (!sub) return;
  const { applySubscriptionState } = await import("@/lib/billing/service");
  await applySubscriptionState(sub, {
    status: event.status,
    providerSubscriptionId: event.providerSubscriptionId,
    providerToken: event.providerToken,
    currentPeriodEnd: event.currentPeriodEnd,
  });
}

/** Refunds all or part of a paid order (money-back guarantee, admin refunds). */
export async function refundOrder(orderId: string, reason: string, amountCents?: number) {
  const order = await db().query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order || !order.providerRef) throw new Error("Order not found");
  if (order.status !== "paid" && order.status !== "partially_refunded") {
    throw new Error(`Order is ${order.status}, not refundable`);
  }

  const already = await db()
    .select({ total: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.orderId, orderId), or(eq(refunds.status, "pending"), eq(refunds.status, "processed"))));
  const remaining = order.amountCents - (already[0]?.total ?? 0);
  const amount = amountCents ?? remaining;
  if (amount <= 0 || amount > remaining) throw new Error(`Refund amount must be between 1 and ${remaining} cents`);

  const result = await getProvider(order.provider).refund({
    providerRef: order.providerRef,
    captureId: order.providerCaptureId,
    amountCents: amount,
    reason,
  });

  await db().insert(refunds).values({ orderId, amountCents: amount, reason, providerRef: result.providerRef });
  const full = amount === remaining;
  const [updated] = await db()
    .update(orders)
    .set({ status: full ? "refunded" : "partially_refunded", refundedAt: full ? new Date() : order.refundedAt })
    .where(eq(orders.id, orderId))
    .returning();
  // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
  // const { adjustReferralForRefund } = await import("@/lib/affiliates/service");
  // await adjustReferralForRefund(orderId, order.amountCents - remaining + amount, full);
  // A full refund also stops a submission order bought (or bundled) with it.
  if (full) {
    await db()
      .update(schema.submissionOrders)
      .set({ status: "cancelled" })
      .where(and(eq(schema.submissionOrders.orderId, orderId), ne(schema.submissionOrders.status, "delivered")));
  }
  // A fully refunded featured slot comes down and frees its inventory.
  if (full && order.kind === "featured") {
    await db().update(schema.adBookings).set({ status: "cancelled" }).where(eq(schema.adBookings.orderId, orderId));
  }
  return updated;
}

/** Starts a subscription checkout. Plans must exist (run `pnpm payments:sync-plans`). */
/** Upgrading is fine; a plan they already pay for, or one below it, would just charge them twice. */
async function assertCanBuyPlan(userId: string, skuId: string) {
  const buying = planForSku(skuId);
  if (!buying) return;
  const held = await db()
    .select({ sku: subscriptions.sku })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "past_due"])));
  const clash = held.map((s) => planForSku(s.sku)).find((p) => p && planRank(p.id) >= planRank(buying.id));
  if (!clash) return;
  throw new CheckoutError(
    clash.id === buying.id
      ? `You're already on ${clash.label}.`
      : `You're on ${clash.label}. Cancel it first to move down to ${buying.label}.`,
  );
}

export async function startSubscription(input: {
  skuId: string;
  provider: ProviderId;
  userId: string;
  email: string;
  /** "dashboard": the provider returns the buyer to /dashboard/checkout/* instead of /checkout/*. */
  returnTo?: "dashboard";
}) {
  const sku = getSku(input.skuId);
  if (!sku || sku.type !== "recurring") throw new CheckoutError("Unknown plan.");
  await assertCanBuyPlan(input.userId, sku.id);

  const plan = await db().query.providerPlans.findFirst({
    where: and(eq(providerPlans.sku, sku.id), eq(providerPlans.provider, input.provider)),
  });
  if (!plan) throw new CheckoutError(`Plan ${sku.id} is not set up on ${input.provider} yet.`);

  const [sub] = await db()
    .insert(subscriptions)
    .values({ userId: input.userId, sku: sku.id, provider: input.provider, providerPlanId: plan.planId })
    .returning();

  const base = input.returnTo === "dashboard" ? "/dashboard/checkout" : "/checkout";
  const session = await getProvider(input.provider).createSubscription({
    email: input.email,
    planId: plan.planId,
    subscriptionId: sub.id,
    amountCents: plan.amountCents,
    returnUrl: siteUrl(`${base}/return?provider=${input.provider}&subscription=${sub.id}`),
    cancelUrl: siteUrl(`${base}/cancelled?subscription=${sub.id}`),
  });
  if (session.providerSubscriptionId) {
    await db()
      .update(subscriptions)
      .set({ providerSubscriptionId: session.providerSubscriptionId })
      .where(eq(subscriptions.id, sub.id));
  }
  return { subscriptionId: sub.id, url: session.url };
}

export async function cancelSubscription(subscriptionId: string, userId: string) {
  const sub = await db().query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)),
  });
  if (!sub?.providerSubscriptionId) throw new Error("Subscription not found");
  if (sub.status === "cancelled" || sub.status === "non_renewing") return sub;
  await getProvider(sub.provider).cancelSubscription({
    providerSubscriptionId: sub.providerSubscriptionId,
    providerToken: sub.providerToken,
  });
  // No more charges; the plan keeps working until the paid period ends (both providers).
  const { applySubscriptionState } = await import("@/lib/billing/service");
  const [marked] = await db()
    .update(subscriptions)
    .set({ cancelledAt: new Date() })
    .where(eq(subscriptions.id, sub.id))
    .returning();
  return applySubscriptionState(marked, { status: sub.currentPeriodEnd ? "non_renewing" : "cancelled" });
}

/** Checkouts left unpaid this long are marked failed (abandoned). */
const ABANDON_AFTER_HOURS = 24;

/** Re-checks pending orders older than a few minutes, in case a webhook was missed. */
export async function reconcilePendingOrders(olderThanMinutes = 10, limit = 50) {
  await db()
    .update(orders)
    .set({ status: "failed", failureReason: "Checkout abandoned" })
    .where(
      and(
        eq(orders.status, "pending"),
        sql`${orders.createdAt} < now() - make_interval(hours => ${ABANDON_AFTER_HOURS})`,
      ),
    );

  const stale = await db()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        sql`${orders.providerRef} is not null`,
        sql`${orders.createdAt} < now() - make_interval(mins => ${olderThanMinutes})`,
      ),
    )
    .limit(limit);

  // Retry fulfilment for paid orders whose handler failed earlier.
  const unfulfilled = await db()
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), isNull(orders.fulfilledAt)))
    .limit(limit);
  for (const order of unfulfilled) {
    try {
      await fulfil(order);
    } catch (err) {
      console.error(`reconcile: fulfilment for order ${order.id}`, err);
    }
  }

  let updated = 0;
  for (const order of stale) {
    try {
      const after = await confirmPayment(order.provider, order.providerRef!);
      if (after && after.status !== "pending") updated++;
    } catch (err) {
      console.error(`reconcile: order ${order.id}`, err);
    }
  }
  return { checked: stale.length, updated };
}
