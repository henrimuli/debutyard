import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { categories, products } from "./board";
import { orders, subscriptions } from "./payments";

export const adPlacement = pgEnum("ad_placement", [
  "leaderboard",
  "home_rail",
  "home_top",
  "home_sidebar",
  "category",
  "newsletter",
]);
export const bookingStatus = pgEnum("booking_status", ["held", "active", "completed", "cancelled"]);

/**
 * A paid featured slot. `held` reserves inventory while the buyer pays;
 * paying makes it `active`. Inventory counts `startsAt..paidEndsAt`; serving
 * uses `startsAt..endsAt`, which the CPC guarantee can push past the paid end.
 * A recurring slot is one booking with a subscription: each renewal moves its end,
 * and while the subscription lives it holds inventory for every later week too.
 */
export const adBookings = pgTable(
  "ad_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placement: adPlacement("placement").notNull(),
    /** Category sponsor only. */
    categorySlug: text("category_slug").references(() => categories.slug),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    /** First booked week (for newsletter: the week whose Monday issue it sponsors). */
    weekKey: text("week_key").notNull(),
    weeks: integer("weeks").notNull().default(1),
    status: bookingStatus("status").notNull().default("held"),
    heldUntil: timestamp("held_until", { withTimezone: true }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    paidEndsAt: timestamp("paid_ends_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Free weeks added by the CPC guarantee. */
    extensions: integer("extensions").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ad_bookings_window_idx").on(t.placement, t.startsAt, t.endsAt),
    index("ad_bookings_user_idx").on(t.userId),
  ],
);
