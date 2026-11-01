import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const paymentProvider = pgEnum("payment_provider", ["paystack", "paypal"]);

export const orderKind = pgEnum("order_kind", ["launch", "relaunch", "featured", "submission", "subscription"]);

export const orderStatus = pgEnum("order_status", ["pending", "paid", "failed", "refunded", "partially_refunded"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "pending",
  "active",
  "non_renewing",
  "past_due",
  "cancelled",
]);

export const refundStatus = pgEnum("refund_status", ["pending", "processed", "failed"]);

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  percentOff: integer("percent_off"),
  amountOffCents: integer("amount_off_cents"),
  /** SKU ids this coupon applies to; empty array means all one-time SKUs. */
  appliesToSkus: text("applies_to_skus").array().notNull().default([]),
  maxRedemptions: integer("max_redemptions"),
  /** Only for a buyer's first paid debut (no earlier paid launch order for their email or account). */
  firstPurchaseOnly: boolean("first_purchase_only").notNull().default(false),
  redeemedCount: integer("redeemed_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    kind: orderKind("kind").notNull(),
    sku: text("sku").notNull(),
    /** Price before discount, in USD cents. */
    listAmountCents: integer("list_amount_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    /** Amount actually charged, in cents of `currency`. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    couponId: uuid("coupon_id").references(() => coupons.id),
    provider: paymentProvider("provider").notNull(),
    /** Paystack transaction reference or PayPal order id. */
    providerRef: text("provider_ref"),
    /** PayPal capture id (needed for refunds). */
    providerCaptureId: text("provider_capture_id"),
    status: orderStatus("status").notNull().default("pending"),
    /** Free-form context, e.g. { productId } for a launch or { slotId } for a featured slot. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("orders_provider_ref_idx").on(t.provider, t.providerRef),
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
  ],
);

/** Every webhook we receive, keyed for idempotency. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: paymentProvider("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("payment_events_provider_event_idx").on(t.provider, t.eventId)],
);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  providerRef: text("provider_ref"),
  status: refundStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    provider: paymentProvider("provider").notNull(),
    /** Paystack subscription_code or PayPal subscription id. */
    providerSubscriptionId: text("provider_subscription_id"),
    /** Paystack email_token, required to disable a subscription. */
    providerToken: text("provider_token"),
    providerPlanId: text("provider_plan_id").notNull(),
    status: subscriptionStatus("status").notNull().default("pending"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** When the subscription went past due; dunning emails count from here. */
    pastDueAt: timestamp("past_due_at", { withTimezone: true }),
    /** Dunning emails sent for the current past-due spell (day 0, 3, 7). */
    dunningStage: integer("dunning_stage").notNull().default(0),
    /** Last time status was confirmed with the provider (webhook or sync). */
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_sub_idx").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_user_id_idx").on(t.userId),
  ],
);

/** Plan ids created on each provider for our recurring SKUs (see scripts/sync-plans.ts). */
export const providerPlans = pgTable(
  "provider_plans",
  {
    sku: text("sku").notNull(),
    provider: paymentProvider("provider").notNull(),
    planId: text("plan_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_plans_sku_provider_idx").on(t.sku, t.provider)],
);

/**
 * Plan perks used per period, e.g. Maker Pro's free Fast Track each quarter.
 * The unique key is the claim, so a perk can't be used twice in a period.
 */
export const planCredits = pgTable(
  "plan_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** e.g. "2026-Q4". */
    periodKey: text("period_key").notNull(),
    /** What it was used on (a product id for Fast Track). */
    targetId: text("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_credits_user_kind_period_idx").on(t.userId, t.kind, t.periodKey)],
);
