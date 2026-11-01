import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { site } from "@/config/site";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { cancelSubscription, startCheckout, startSubscription } from "@/lib/payments/service";
import { formatUsd } from "@/lib/payments/skus";
import type { ProviderId } from "@/lib/payments/types";
import { limit } from "@/lib/billing/entitlements";
import { MAX_EXTRA_BOOKING_WEEKS } from "@/lib/billing/plans";
import { withRef } from "@/lib/board/links";
import { addWeeks, formatWeekLabel, formatWeekRange, upcomingWeekKeys, weekBounds, weekKeyFor } from "@/lib/weeks";
import {
  BOOKING_HORIZON_WEEKS,
  cpcCents,
  HOLD_MINUTES,
  paidEndForNextCharge,
  PLACEMENTS,
  remainingByWeek,
  shouldExtend,
  WEEKS_PER,
  type Duration,
  type Placement,
} from "./placements";

const { adBookings, products, orders, subscriptions } = schema;
export type Booking = typeof adBookings.$inferSelect;

export class BookingError extends Error {}

const WEEK_MS = 7 * 86_400_000;

/** Bookings that use inventory: paid ones and unexpired holds. */
const holdsInventory = (now: Date) =>
  or(eq(adBookings.status, "active"), and(eq(adBookings.status, "held"), gt(adBookings.heldUntil, now)));

const sameSlot = (placement: Placement, categorySlug: string | null) =>
  and(
    eq(adBookings.placement, placement),
    placement === "category" && categorySlug ? eq(adBookings.categorySlug, categorySlug) : sql`true`,
  );

/** While its subscription is in one of these, a recurring booking keeps its slot. */
const RENEWING = ["pending", "active", "past_due"] as const;
/** Past any week on the calendar. */
const FOREVER = new Date(8.64e15);

/** Bookings using this slot between two dates. A recurring one that's still renewing uses every week from its start. */
async function slotUsage(
  q: Pick<ReturnType<typeof db>, "select">,
  placement: Placement,
  categorySlug: string | null,
  now: Date,
  from: Date,
  to: Date,
) {
  const rows = await q
    .select({
      startsAt: adBookings.startsAt,
      paidEndsAt: adBookings.paidEndsAt,
      renewing: sql<boolean>`coalesce(${inArray(subscriptions.status, [...RENEWING])}, false)`,
    })
    .from(adBookings)
    .leftJoin(subscriptions, eq(subscriptions.id, adBookings.subscriptionId))
    .where(
      and(
        sameSlot(placement, categorySlug),
        holdsInventory(now),
        lt(adBookings.startsAt, to),
        or(gt(adBookings.paidEndsAt, from), inArray(subscriptions.status, [...RENEWING])),
      ),
    );
  return rows.map((r) => ({ startsAt: r.startsAt, paidEndsAt: r.renewing ? FOREVER : r.paidEndsAt }));
}

/**
 * Weeks that can be booked: whole weeks from next Monday on, so nobody pays
 * for a week that's half over. For newsletters the week is the issue that
 * goes out on its Monday. Maker plans book further ahead.
 */
export function bookableWeeks(now = new Date(), extraWeeks = 0): string[] {
  return upcomingWeekKeys(now, BOOKING_HORIZON_WEEKS + extraWeeks);
}

/** Extra weeks of booking horizon for this user's plan. */
export async function extraWeeksFor(userId: string, now = new Date()) {
  return limit(userId, "extraBookingWeeks", now);
}

export async function availability(
  placement: Placement,
  categorySlug: string | null,
  now = new Date(),
  extraWeeks = 0,
) {
  const keys = bookableWeeks(now, extraWeeks);
  const weeks = keys.map((key) => ({ key, ...weekBounds(key) }));
  const from = weeks[0].startsAt;
  const to = weeks[weeks.length - 1].endsAt;
  const live = await slotUsage(db(), placement, categorySlug, now, from, to);
  const remaining = remainingByWeek(weeks, live, PLACEMENTS[placement].cap);
  return weeks.map((w) => ({
    key: w.key,
    label: formatWeekLabel(w.key),
    range: formatWeekRange(w.key),
    remaining: remaining[w.key],
  }));
}

export type BookInput = {
  userId: string;
  email: string;
  placement: Placement;
  duration: Duration;
  productId: string;
  categorySlug: string | null;
  weekKey: string;
  provider: ProviderId;
  couponCode?: string | null;
  /** "dashboard": the provider returns the buyer to the dashboard after checkout. */
  returnTo?: "dashboard";
  /** Renews until cancelled, keeping the slot. Starts next week and needs every later week free. */
  recurring?: boolean;
};

/** Reserves the slot (serialised per placement) and starts checkout. */
export async function bookSlot(input: BookInput, now = new Date()): Promise<{ bookingId: string; url: string }> {
  const config = PLACEMENTS[input.placement];
  const skuId = input.recurring ? config.recurring?.[input.duration] : config.skus[input.duration];
  if (!skuId) throw new BookingError("That duration isn't available for this placement.");
  if (!bookableWeeks(now, await extraWeeksFor(input.userId, now)).includes(input.weekKey)) {
    throw new BookingError("Pick a week from the calendar.");
  }
  if (input.recurring && input.weekKey !== bookableWeeks(now)[0]) {
    throw new BookingError("Recurring slots start next week.");
  }
  if (input.placement === "category" && !input.categorySlug) throw new BookingError("Pick a category to sponsor.");
  const categorySlug = input.placement === "category" ? input.categorySlug : null;

  const product = await db().query.products.findFirst({
    where: and(eq(products.id, input.productId), eq(products.createdBy, input.userId)),
    columns: { id: true, status: true },
  });
  if (!product) throw new BookingError("Pick one of your listings to promote.");
  if (product.status !== "approved") throw new BookingError("Only approved listings can be promoted.");
  if (categorySlug && !(await db().query.categories.findFirst({ where: eq(schema.categories.slug, categorySlug) }))) {
    throw new BookingError("Unknown category.");
  }

  const weeks = WEEKS_PER[input.duration];
  const startsAt = weekBounds(input.weekKey).startsAt;
  const paidEndsAt = new Date(startsAt.getTime() + weeks * WEEK_MS);

  const booking = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ads:${input.placement}:${categorySlug ?? ""}`}))`);
    // A recurring slot needs every week anyone could book, the longest calendar included.
    const covered = Array.from(
      { length: input.recurring ? BOOKING_HORIZON_WEEKS + MAX_EXTRA_BOOKING_WEEKS : weeks },
      (_, i) => {
        const key = addWeeks(input.weekKey, i);
        return { key, ...weekBounds(key) };
      },
    );
    const overlapping = await slotUsage(
      tx,
      input.placement,
      categorySlug,
      now,
      startsAt,
      covered[covered.length - 1].endsAt,
    );
    const remaining = remainingByWeek(covered, overlapping, config.cap);
    const full = covered.find((w) => remaining[w.key] === 0);
    if (full) {
      throw new BookingError(
        `${formatWeekLabel(full.key)} is sold out for this placement${input.recurring ? ", so it can't renew every week. Book it one-time instead." : "."}`,
      );
    }

    const [row] = await tx
      .insert(adBookings)
      .values({
        placement: input.placement,
        categorySlug,
        productId: input.productId,
        userId: input.userId,
        sku: skuId,
        weekKey: input.weekKey,
        weeks,
        status: "held",
        heldUntil: new Date(now.getTime() + HOLD_MINUTES * 60_000),
        startsAt,
        paidEndsAt,
        endsAt: paidEndsAt,
      })
      .returning();
    return row;
  });

  try {
    if (input.recurring) {
      const { subscriptionId, url } = await startSubscription({
        skuId,
        provider: input.provider,
        userId: input.userId,
        email: input.email,
        returnTo: input.returnTo,
      });
      await db().update(adBookings).set({ subscriptionId }).where(eq(adBookings.id, booking.id));
      return { bookingId: booking.id, url };
    }
    const { orderId, url } = await startCheckout({
      skuId,
      provider: input.provider,
      email: input.email,
      userId: input.userId,
      couponCode: input.couponCode ?? null,
      metadata: { bookingId: booking.id },
      returnTo: input.returnTo,
    });
    await db().update(adBookings).set({ orderId }).where(eq(adBookings.id, booking.id));
    return { bookingId: booking.id, url };
  } catch (err) {
    await db().update(adBookings).set({ status: "cancelled" }).where(eq(adBookings.id, booking.id));
    throw err;
  }
}

/**
 * Payment fulfilment: the hold becomes an active booking. A payment that lands
 * after its hold lapsed still activates (we honour paid orders) and the team
 * is told in case that overfills the week.
 */
export async function activateBooking(bookingId: string, now = new Date()) {
  const before = await db().query.adBookings.findFirst({ where: eq(adBookings.id, bookingId) });
  if (!before) throw new Error(`Booking ${bookingId} not found`);
  if (before.status === "active" || before.status === "completed") return before;
  const lapsed = before.status === "cancelled" || (before.heldUntil !== null && before.heldUntil <= now);
  const [row] = await db()
    .update(adBookings)
    .set({ status: "active", heldUntil: null })
    .where(eq(adBookings.id, bookingId))
    .returning();

  const product = await db().query.products.findFirst({ where: eq(products.id, row.productId) });
  const label = PLACEMENTS[row.placement].label;
  const when = row.subscriptionId
    ? `From ${formatWeekLabel(row.weekKey)}, renewing until you cancel`
    : row.weeks > 1
      ? `${formatWeekLabel(row.weekKey)} for ${row.weeks} weeks`
      : formatWeekLabel(row.weekKey);
  const owner = row.userId ? await db().query.user.findFirst({ where: eq(schema.user.id, row.userId) }) : null;
  if (owner) {
    const dash = new URL("/dashboard", env().NEXT_PUBLIC_SITE_URL).toString();
    const name = product?.name ?? "your listing";
    await sendEmail({
      to: owner.email,
      ...renderEmail({
        variant: "customer",
        label: "Advertising",
        subject: `Booked: ${label} for ${name}`,
        reason: `you booked a ${label} on DebutYard`,
        blocks: [
          { heading: `Your ${label} is booked` },
          {
            facts: [
              ["Placement", label],
              ["Listing", name],
              ["Runs", when],
            ],
          },
          { text: "Impressions and clicks show on your dashboard as they come in." },
          { button: "Open your dashboard", href: dash },
        ],
      }),
    });
  }
  if (lapsed) {
    await sendEmail({
      to: env().ADMIN_EMAIL ?? site.supportEmail,
      ...renderEmail({
        variant: "staff",
        label: "Ads",
        subject: `Check inventory: late payment for ${label} (${formatWeekLabel(row.weekKey)})`,
        trigger: "Sent when an ad is paid for after its hold lapsed.",
        blocks: [
          { heading: "Check ad inventory" },
          {
            text: "This booking was paid after its hold lapsed and is now active. Check the week isn't over capacity.",
          },
          {
            facts: [
              ["Booking", row.id],
              ["Placement", label],
              ["Week", formatWeekLabel(row.weekKey)],
            ],
          },
          { button: "Open ads", href: new URL("/admin/ads", env().NEXT_PUBLIC_SITE_URL).toString() },
        ],
      }),
    });
  }
  return row;
}

/**
 * A recurring slot's subscription changed. Its first payment activates the booking, and
 * each later one moves the booking's end. Works from the next charge date, not from
 * counting charges, so webhooks and the daily sync can both call it any number of times.
 */
export async function syncRecurringBooking(
  sub: { id: string; status: string; currentPeriodEnd: Date | null },
  now = new Date(),
) {
  if (sub.status !== "active") return;
  const booking = await db().query.adBookings.findFirst({ where: eq(adBookings.subscriptionId, sub.id) });
  if (!booking || booking.status === "completed") return;
  await activateBooking(booking.id, now);
  if (!sub.currentPeriodEnd) return;
  const paidEnd = paidEndForNextCharge(sub.currentPeriodEnd);
  await db()
    .update(adBookings)
    .set({ paidEndsAt: paidEnd, endsAt: paidEnd })
    .where(and(eq(adBookings.id, booking.id), lt(adBookings.paidEndsAt, paidEnd)));
}

export type AdItem = {
  bookingId: string | null;
  placement: Placement;
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  /** Click-through URL (tracked for bookings). */
  href: string;
};

/** Active bookings showing right now in a placement. */
export async function liveAds(
  placement: Placement,
  opts: { categorySlug?: string; now?: Date } = {},
): Promise<AdItem[]> {
  const now = opts.now ?? new Date();
  const rows = await db()
    .select({
      id: adBookings.id,
      placement: adBookings.placement,
      slug: products.slug,
      name: products.name,
      tagline: products.tagline,
      logoUrl: products.logoUrl,
    })
    .from(adBookings)
    .innerJoin(products, eq(products.id, adBookings.productId))
    .where(
      and(
        eq(adBookings.placement, placement),
        opts.categorySlug ? eq(adBookings.categorySlug, opts.categorySlug) : sql`true`,
        eq(adBookings.status, "active"),
        lte(adBookings.startsAt, now),
        gt(adBookings.endsAt, now),
        eq(products.status, "approved"),
      ),
    )
    .orderBy(adBookings.createdAt);
  return rows.map((r) => ({
    bookingId: r.id,
    placement: r.placement,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    logoUrl: r.logoUrl,
    href: `/api/ads/${r.id}/click`,
  }));
}

/** Newsletter sponsor for the issue sent on `weekKey`'s Monday. */
export async function newsletterSponsor(weekKey: string) {
  const { startsAt } = weekBounds(weekKey);
  const [ad] = await liveAds("newsletter", { now: new Date(startsAt.getTime() + 60_000) });
  if (!ad?.bookingId) return null;
  return {
    bookingId: ad.bookingId,
    name: ad.name,
    tagline: ad.tagline,
    logoUrl: ad.logoUrl,
    url: new URL(ad.href, env().NEXT_PUBLIC_SITE_URL).toString(),
  };
}

/** A sent issue counts each delivered email as one impression for its sponsor. */
export async function addImpressions(bookingId: string, n: number) {
  if (n <= 0) return;
  await db()
    .update(adBookings)
    .set({ impressions: sql`${adBookings.impressions} + ${n}` })
    .where(eq(adBookings.id, bookingId));
}

const BOTS = /bot|crawler|spider|preview|fetch|curl|wget|headless/i;
export const isBot = (ua: string | null) => BOTS.test(ua ?? "");

export async function recordImpressions(ids: string[]) {
  if (ids.length === 0) return;
  await db()
    .update(adBookings)
    .set({ impressions: sql`${adBookings.impressions} + 1` })
    .where(and(inArray(adBookings.id, ids), eq(adBookings.status, "active")));
}

/** Counts a click and returns where to send the visitor. */
export async function recordClick(bookingId: string, count: boolean): Promise<string | null> {
  const [row] = count
    ? await db()
        .update(adBookings)
        .set({ clicks: sql`${adBookings.clicks} + 1` })
        .where(eq(adBookings.id, bookingId))
        .returning({ productId: adBookings.productId })
    : await db().select({ productId: adBookings.productId }).from(adBookings).where(eq(adBookings.id, bookingId));
  if (!row) return null;
  const p = await db().query.products.findFirst({
    where: eq(products.id, row.productId),
    columns: { websiteUrl: true },
  });
  return p ? withRef(p.websiteUrl) : null;
}

/**
 * Daily: ends slots whose time is up. Under the CPC guarantee a slot still
 * costing over $1 a click runs another week for free; otherwise it completes
 * and the buyer gets a performance report. Also releases lapsed holds. A recurring
 * slot only completes once its subscription has ended, and stops charging if its
 * listing is taken down.
 */
export async function settleBookings(now = new Date()) {
  await db()
    .update(adBookings)
    .set({ status: "cancelled" })
    .where(and(eq(adBookings.status, "held"), lt(adBookings.heldUntil, new Date(now.getTime() - 24 * 3600_000))));

  const takenDown = await db()
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(adBookings)
    .innerJoin(products, eq(products.id, adBookings.productId))
    .innerJoin(subscriptions, eq(subscriptions.id, adBookings.subscriptionId))
    .where(
      and(
        inArray(adBookings.status, ["held", "active"]),
        inArray(products.status, ["rejected", "archived"]),
        inArray(subscriptions.status, ["active", "past_due"]),
      ),
    );
  for (const sub of takenDown) {
    await cancelSubscription(sub.id, sub.userId).catch((err) => console.error(`ad plan cancel ${sub.id}`, err));
  }

  const due = await db()
    .select({ b: adBookings, paidCents: orders.amountCents, productName: products.name })
    .from(adBookings)
    .innerJoin(products, eq(products.id, adBookings.productId))
    .leftJoin(orders, eq(orders.id, adBookings.orderId))
    .leftJoin(subscriptions, eq(subscriptions.id, adBookings.subscriptionId))
    .where(
      and(
        eq(adBookings.status, "active"),
        lte(adBookings.endsAt, now),
        isNull(adBookings.settledAt),
        or(isNull(subscriptions.id), notInArray(subscriptions.status, [...RENEWING])),
      ),
    );

  const result = { extended: 0, completed: 0 };
  for (const { b, paidCents, productName } of due) {
    const paid = paidCents ?? 0;
    if (shouldExtend({ placement: b.placement, paidCents: paid, clicks: b.clicks, extensions: b.extensions })) {
      await db()
        .update(adBookings)
        .set({ endsAt: new Date(b.endsAt.getTime() + WEEK_MS), extensions: b.extensions + 1 })
        .where(and(eq(adBookings.id, b.id), eq(adBookings.endsAt, b.endsAt)));
      result.extended++;
      continue;
    }
    const [done] = await db()
      .update(adBookings)
      .set({ status: "completed", settledAt: now })
      .where(and(eq(adBookings.id, b.id), isNull(adBookings.settledAt)))
      .returning();
    if (!done) continue;
    result.completed++;
    const owner = b.userId ? await db().query.user.findFirst({ where: eq(schema.user.id, b.userId) }) : null;
    if (owner)
      await sendReport(owner.email, done, productName, paid).catch((err) => console.error("ad report failed", err));
  }
  return result;
}

async function sendReport(to: string, b: Booking, productName: string, paidCents: number) {
  const label = PLACEMENTS[b.placement].label;
  const cpc = cpcCents(paidCents, b.clicks);
  const facts: Array<[string, string]> = [
    ["Impressions", String(b.impressions)],
    ["Clicks", String(b.clicks)],
  ];
  if (cpc !== null && paidCents > 0) facts.push(["Cost per click", formatUsd(cpc)]);
  await sendEmail({
    to,
    ...renderEmail({
      variant: "customer",
      label: "Advertising",
      subject: `Your ${label} results: ${b.clicks} click${b.clicks === 1 ? "" : "s"}`,
      reason: `you booked a ${label} on DebutYard`,
      blocks: [
        { heading: `Your ${label} results` },
        { text: `Your ${label} for ${productName} has finished.` },
        { facts },
        ...(b.extensions > 0
          ? [
              {
                callout: "CPC guarantee",
                text: `Our CPC guarantee kept it up ${b.extensions} extra week${b.extensions === 1 ? "" : "s"} for free.`,
              },
            ]
          : []),
        { button: "Book again", href: new URL("/advertise", env().NEXT_PUBLIC_SITE_URL).toString() },
      ],
    }),
  });
}

export async function bookingsForUser(userId: string) {
  return db()
    .select({ b: adBookings, productName: products.name, paidCents: orders.amountCents })
    .from(adBookings)
    .innerJoin(products, eq(products.id, adBookings.productId))
    .leftJoin(orders, eq(orders.id, adBookings.orderId))
    .where(and(eq(adBookings.userId, userId), inArray(adBookings.status, ["active", "completed"])))
    .orderBy(desc(adBookings.startsAt));
}

/** The user's recurring slots with their subscriptions (billing page). */
export async function recurringSlots(userId: string) {
  return db()
    .select({ b: adBookings, productName: products.name, sub: subscriptions })
    .from(adBookings)
    .innerJoin(subscriptions, eq(subscriptions.id, adBookings.subscriptionId))
    .innerJoin(products, eq(products.id, adBookings.productId))
    .where(and(eq(adBookings.userId, userId), inArray(subscriptions.status, ["active", "non_renewing", "past_due"])))
    .orderBy(desc(adBookings.startsAt));
}

export async function allBookings(now = new Date()) {
  const from = weekBounds(addWeeks(weekKeyFor(now), -4)).startsAt;
  return db()
    .select({ b: adBookings, productName: products.name, paidCents: orders.amountCents, email: orders.email })
    .from(adBookings)
    .innerJoin(products, eq(products.id, adBookings.productId))
    .leftJoin(orders, eq(orders.id, adBookings.orderId))
    .where(and(gt(adBookings.endsAt, from), inArray(adBookings.status, ["held", "active", "completed"])))
    .orderBy(adBookings.startsAt);
}
