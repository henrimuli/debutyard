/**
 * Subscriptions and entitlements against a real Postgres with a fake
 * provider: purchase → active → perks, dunning, cancellation, sync and
 * plan upgrades. Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, SubscriptionState, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { weekKeyFor } from "@/lib/weeks";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; text: string }) => {
    sent.push({ to: e.to, subject: e.subject, text: e.text });
  }),
  sendBatch: vi.fn(async (emails: unknown[]) => emails.length),
}));

class FakeProvider implements PaymentProvider {
  readonly id = "paystack" as const;
  nextEvent: WebhookEvent | null = null;
  state: SubscriptionState = { status: "active" };
  cancelled: string[] = [];
  async createCheckout(req: { orderId: string }) {
    return { url: `https://pay.test/${req.orderId}`, providerRef: `ref-${req.orderId}` };
  }
  async verifyPayment(ref: string): Promise<VerifiedPayment> {
    return { status: "pending", providerRef: ref };
  }
  async refund() {
    return { providerRef: "rf" };
  }
  async createPlan() {
    return { planId: "PLN" };
  }
  async createSubscription(req: { subscriptionId: string }) {
    return { url: `https://pay.test/sub/${req.subscriptionId}`, providerSubscriptionId: `SUB-${req.subscriptionId}` };
  }
  async cancelSubscription(args: { providerSubscriptionId: string }) {
    this.cancelled.push(args.providerSubscriptionId);
  }
  async getSubscription() {
    return this.state;
  }
  async parseWebhook(): Promise<WebhookEvent> {
    if (!this.nextEvent) throw new Error("no event queued");
    return this.nextEvent;
  }
}

describe.skipIf(!TEST_DB)("subscriptions and entitlements (Postgres)", () => {
  const fake = new FakeProvider();
  let dbmod: typeof import("@/db");
  let payments: typeof import("@/lib/payments/service");
  let billing: typeof import("@/lib/billing/service");
  let ent: typeof import("@/lib/billing/entitlements");
  let products: typeof import("@/lib/products/service");
  let ads: typeof import("@/lib/ads/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", fake);
    dbmod = await import("@/db");
    payments = await import("@/lib/payments/service");
    billing = await import("@/lib/billing/service");
    ent = await import("@/lib/billing/entitlements");
    products = await import("@/lib/products/service");
    ads = await import("@/lib/ads/service");
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    sent.length = 0;
    fake.state = { status: "active" };
    await dbmod
      .db()
      .execute(
        sql`truncate products, orders, payment_events, subscriptions, provider_plans, plan_credits, "user" cascade`,
      );
    await dbmod
      .db()
      .insert(dbmod.schema.providerPlans)
      .values(
        ["sub_maker_pro_monthly", "sub_maker_unlimited_monthly", "sub_ad_leaderboard_week"].map((sku) => ({
          sku,
          provider: "paystack" as const,
          planId: `PLN_${sku}`,
          amountCents: 900,
        })),
      );
  });

  let seq = 0;
  async function makeUser() {
    const id = `b${++seq}`;
    await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values({ id, name: `User ${id}`, email: `${id}@x.test` });
    return id;
  }
  async function approvedProduct(userId: string, domain: string) {
    const p = await products.saveProduct(userId, {
      websiteUrl: `https://${domain}/`,
      name: domain,
      tagline: `${domain} does useful things`,
      description: "A".repeat(60),
      categories: ["ai"],
      pricingModel: "freemium",
    });
    await products.ensureWeek(weekKeyFor(new Date()));
    await dbmod
      .db()
      .update(dbmod.schema.products)
      .set({ status: "approved", launchWeekKey: weekKeyFor(new Date()), approvedAt: new Date() })
      .where(eq(dbmod.schema.products.id, p.id));
    return p;
  }
  /** Checkout, then the provider's "subscription active" webhook. */
  async function subscribe(userId: string, sku: string, periodEnd = new Date(Date.now() + 30 * DAY)) {
    const { subscriptionId, url } = await payments.startSubscription({
      skuId: sku,
      provider: "paystack",
      userId,
      email: `${userId}@x.test`,
    });
    expect(url).toContain(subscriptionId);
    fake.nextEvent = {
      eventId: `subscription.create:${subscriptionId}`,
      type: "subscription.create",
      kind: "subscription_updated",
      providerSubscriptionId: `SUB-${subscriptionId}`,
      status: "active",
      providerToken: "tok",
      currentPeriodEnd: periodEnd,
    };
    await payments.handleWebhook("paystack", "{}", new Headers());
    return (await dbmod.db().query.subscriptions.findFirst({
      where: eq(dbmod.schema.subscriptions.id, subscriptionId),
    }))!;
  }
  const subRow = async (id: string) =>
    (await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, id) }))!;
  async function event(sub: { id: string }, status: "active" | "past_due" | "cancelled" | "non_renewing") {
    fake.nextEvent = {
      eventId: `evt:${sub.id}:${status}:${Math.random()}`,
      type: "test",
      kind: "subscription_updated",
      providerSubscriptionId: `SUB-${sub.id}`,
      status,
    };
    await payments.handleWebhook("paystack", "{}", new Headers());
    return (await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, sub.id) }))!;
  }

  describe("recurring ad slots", () => {
    const bookRecurring = (userId: string, productId: string, extra: { weekKey?: string; recurring?: boolean } = {}) =>
      ads.bookSlot({
        userId,
        email: `${userId}@x.test`,
        placement: "leaderboard",
        duration: "week",
        productId,
        categorySlug: null,
        weekKey: ads.bookableWeeks()[0],
        provider: "paystack",
        recurring: true,
        ...extra,
      });
    const bookingRow = async (id: string) =>
      (await dbmod.db().query.adBookings.findFirst({ where: eq(dbmod.schema.adBookings.id, id) }))!;
    const paid = async (subscriptionId: string, nextCharge: Date) => {
      fake.nextEvent = {
        eventId: `paid:${subscriptionId}:${nextCharge.getTime()}`,
        type: "test",
        kind: "subscription_updated",
        providerSubscriptionId: `SUB-${subscriptionId}`,
        status: "active",
        providerToken: "tok",
        currentPeriodEnd: nextCharge,
      };
      await payments.handleWebhook("paystack", "{}", new Headers());
    };
    const lastWeekLeft = async () => (await ads.availability("leaderboard", null)).at(-1)!.remaining;

    it("renews, holds every later week, and frees the slot when the plan ends", async () => {
      const u = await makeUser();
      const p = await approvedProduct(u, "recurring.io");
      await expect(bookRecurring(u, p.id, { weekKey: ads.bookableWeeks()[1] })).rejects.toThrow("start next week");

      const { bookingId } = await bookRecurring(u, p.id);
      const held = await bookingRow(bookingId);
      expect(held).toMatchObject({ status: "held", sku: "sub_ad_leaderboard_week" });
      expect(held.subscriptionId).toBeTruthy();
      const subId = held.subscriptionId!;
      expect(await lastWeekLeft()).toBe(2);

      // The first payment activates it, with the Booked email in place of a welcome.
      const week = 7 * DAY;
      const firstCharge = new Date(Date.now() + week);
      await paid(subId, firstCharge);
      const active = await bookingRow(bookingId);
      expect(active.status).toBe("active");
      expect(active.paidEndsAt.getTime()).toBeGreaterThan(firstCharge.getTime());
      expect(sent.some((e) => e.subject.startsWith("Booked:"))).toBe(true);
      expect(sent.some((e) => e.subject.startsWith("Welcome"))).toBe(false);

      // Each payment moves the end on, and hearing about one twice changes nothing.
      const nextCharge = new Date(firstCharge.getTime() + week);
      await paid(subId, nextCharge);
      const renewed = await bookingRow(bookingId);
      expect(renewed.paidEndsAt.getTime()).toBe(active.paidEndsAt.getTime() + week);
      expect(renewed.endsAt).toEqual(renewed.paidEndsAt);
      await billing.applySubscriptionState(await subRow(subId), {
        status: "active",
        currentPeriodEnd: firstCharge,
      });
      expect((await bookingRow(bookingId)).paidEndsAt).toEqual(renewed.paidEndsAt);

      // A failed payment: the ad stops when its paid time runs out, the slot stays held.
      await event({ id: subId }, "past_due");
      const after = new Date(renewed.paidEndsAt.getTime() + 3600_000);
      expect(await ads.liveAds("leaderboard", { now: after })).toEqual([]);
      expect(await ads.settleBookings(after)).toMatchObject({ completed: 0, extended: 0 });
      expect((await bookingRow(bookingId)).status).toBe("active");
      expect(await lastWeekLeft()).toBe(2);

      // The plan ends: the booking completes without CPC extensions, and the slot is free.
      await event({ id: subId }, "cancelled");
      expect(await lastWeekLeft()).toBe(3);
      expect(await ads.settleBookings(after)).toMatchObject({ completed: 1, extended: 0 });
      expect((await bookingRow(bookingId)).status).toBe("completed");
    });

    it("keeps the paid time after cancelling, then releases the slot", async () => {
      const u = await makeUser();
      const p = await approvedProduct(u, "cancels.io");
      const { bookingId } = await bookRecurring(u, p.id);
      const subId = (await bookingRow(bookingId)).subscriptionId!;
      await paid(subId, new Date(Date.now() + 7 * DAY));
      const before = await bookingRow(bookingId);

      await payments.cancelSubscription(subId, u);
      expect(await subRow(subId)).toMatchObject({ status: "non_renewing" });
      const during = new Date(before.paidEndsAt.getTime() - 3600_000);
      expect((await ads.liveAds("leaderboard", { now: during })).map((a) => a.bookingId)).toEqual([bookingId]);
      expect(await lastWeekLeft()).toBe(3);
      expect(await ads.settleBookings(new Date(before.paidEndsAt.getTime() + 3600_000))).toMatchObject({
        completed: 1,
      });
    });

    it("refuses a recurring slot when a later week is full", async () => {
      const u = await makeUser();
      const p = await approvedProduct(u, "full.io");
      const weekKey = ads.bookableWeeks()[3];
      for (let i = 0; i < 3; i++) await bookRecurring(u, p.id, { weekKey, recurring: false });
      await expect(bookRecurring(u, p.id)).rejects.toThrow("can't renew every week");
    });

    it("stops charging when the listing is taken down", async () => {
      const u = await makeUser();
      const p = await approvedProduct(u, "archived.io");
      const { bookingId } = await bookRecurring(u, p.id);
      const subId = (await bookingRow(bookingId)).subscriptionId!;
      await paid(subId, new Date(Date.now() + 7 * DAY));
      await dbmod
        .db()
        .update(dbmod.schema.products)
        .set({ status: "archived" })
        .where(eq(dbmod.schema.products.id, p.id));
      await ads.settleBookings();
      expect(fake.cancelled).toContain(`SUB-${subId}`);
      expect(await subRow(subId)).toMatchObject({ status: "non_renewing" });
    });
  });

  it("purchase → active → Maker Pro perks", async () => {
    const u = await makeUser();
    expect(await ent.planFor(u)).toBeNull();
    expect(await ent.limit(u, "links")).toBe(10);

    const sub = await subscribe(u, "sub_maker_pro_monthly");
    expect(sub).toMatchObject({ status: "active", providerToken: "tok" });
    expect(sent.find((e) => e.subject === "Welcome to Maker Pro")?.text).toContain("free Fast Track");
    expect((await ent.planFor(u))?.id).toBe("maker_pro");
    expect(await ent.can(u, "dr_tracking")).toBe(true);
    expect(await ent.limit(u, "links")).toBe(100);
    expect((await billing.proUserIds([u, "nobody"])).has(u)).toBe(true);
    // Featured slots: 4 more weeks to book.
    expect(await ads.extraWeeksFor(u)).toBe(4);
    expect(ads.bookableWeeks(new Date(), 4)).toHaveLength(ads.bookableWeeks().length + 4);

    // One free Fast Track per quarter, no payment.
    const p = await products.saveProduct(u, {
      websiteUrl: "https://pro.io/",
      name: "pro.io",
      tagline: "pro.io does useful things",
      description: "A".repeat(60),
      categories: ["ai"],
      pricingModel: "freemium",
      screenshots: ["https://pro.io/shot.png"],
    });
    expect(await billing.fastTrackCredit(u)).toEqual({ eligible: true, available: true, remaining: 1, allowed: 1 });
    const upgraded = await billing.redeemFastTrack(u, p.id);
    expect(upgraded).toMatchObject({ tier: "fast_track", status: "pending" });
    expect(await billing.fastTrackCredit(u)).toEqual({ eligible: true, available: false, remaining: 0, allowed: 1 });
    const q = await products.saveProduct(u, {
      websiteUrl: "https://pro2.io/",
      name: "pro2.io",
      tagline: "pro2.io does useful things",
      description: "A".repeat(60),
      categories: ["ai"],
      pricingModel: "freemium",
      screenshots: ["https://pro2.io/shot.png"],
    });
    await expect(billing.redeemFastTrack(u, q.id)).rejects.toThrow("used this quarter");
    // Next quarter it's back.
    const nextQuarter = new Date(Date.now() + 100 * DAY);
    await dbmod
      .db()
      .update(dbmod.schema.subscriptions)
      .set({ currentPeriodEnd: new Date(nextQuarter.getTime() + 30 * DAY) });
    expect(await billing.fastTrackCredit(u, nextQuarter)).toMatchObject({ eligible: true, available: true });

    // Without Pro there's no credit.
    const free = await makeUser();
    expect(await billing.fastTrackCredit(free)).toMatchObject({ eligible: false, available: false });
    await expect(billing.redeemFastTrack(free, q.id)).rejects.toThrow();
  });

  it("past_due → dunning on day 0, 3 and 7 → the plan ends, data kept", async () => {
    const u = await makeUser();
    const sub = await subscribe(u, "sub_maker_pro_monthly");
    await dbmod.db().insert(dbmod.schema.trackedLinks).values({
      ownerUserId: u,
      url: "https://dir.example/p",
      targetDomain: "maker.io",
      source: "manual",
    });
    sent.length = 0;

    // The provider agrees when the daily sync asks.
    fake.state = { status: "past_due" };
    const due = await event(sub, "past_due");
    expect(due).toMatchObject({ status: "past_due", dunningStage: 1 });
    expect(sent.map((e) => e.subject)).toEqual(["Your Maker Pro payment didn't go through"]);
    // Still entitled while dunning runs.
    expect(await ent.limit(u, "links")).toBe(100);

    const t0 = due.pastDueAt!;
    const at = (days: number) => new Date(t0.getTime() + days * DAY + 60_000);
    sent.length = 0;
    expect((await billing.syncSubscriptions(at(1))).dunning).toBe(0);
    expect((await billing.syncSubscriptions(at(3))).dunning).toBe(1);
    expect(sent.map((e) => e.subject)).toEqual(["Reminder: your Maker Pro payment is still failing"]);
    expect((await billing.syncSubscriptions(at(4))).dunning).toBe(0);
    sent.length = 0;
    expect((await billing.syncSubscriptions(at(7))).dunning).toBe(1);
    expect(sent.map((e) => e.subject)).toEqual(["Your Maker Pro plan has ended"]);
    const ended = await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, sub.id) });
    expect(ended).toMatchObject({ status: "cancelled", dunningStage: 3 });
    expect(await ent.limit(u, "links")).toBe(10);
    expect(await dbmod.db().select().from(dbmod.schema.trackedLinks)).toHaveLength(1);
    expect((await billing.syncSubscriptions(at(8))).dunning).toBe(0);
  });

  it("a payment that recovers during dunning keeps the plan", async () => {
    const u = await makeUser();
    const sub = await subscribe(u, "sub_maker_pro_monthly");
    await event(sub, "past_due");
    sent.length = 0;
    const back = await event(sub, "active");
    expect(back).toMatchObject({ status: "active", pastDueAt: null, dunningStage: 0 });
    expect(sent.map((e) => e.subject)).toEqual(["Your Maker Pro payment went through"]);
  });

  it("cancel → non_renewing until the period ends, even if the provider says cancelled", async () => {
    const u = await makeUser();
    const periodEnd = new Date(Date.now() + 10 * DAY);
    const sub = await subscribe(u, "sub_maker_pro_monthly", periodEnd);
    sent.length = 0;
    await payments.cancelSubscription(sub.id, u);
    expect(fake.cancelled).toContain(`SUB-${sub.id}`);
    let row = (await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, sub.id) }))!;
    expect(row.status).toBe("non_renewing");
    expect(sent.map((e) => e.subject)).toEqual(["Your Maker Pro plan won't renew"]);
    expect(await ent.can(u, "pro_badge")).toBe(true);
    // Cancelling twice does nothing.
    await payments.cancelSubscription(sub.id, u);
    expect(sent).toHaveLength(1);

    row = await event(sub, "cancelled");
    expect(row.status).toBe("non_renewing");
    // A stale "active" from the provider doesn't undo the cancellation.
    row = await event(sub, "active");
    expect(row.status).toBe("non_renewing");
    fake.state = { status: "cancelled" };

    const after = new Date(periodEnd.getTime() + 60_000);
    expect(await ent.can(u, "pro_badge", after)).toBe(false);
    await billing.syncSubscriptions(after);
    row = (await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, sub.id) }))!;
    expect(row.status).toBe("cancelled");
    expect(sent.at(-1)?.subject).toBe("Your Maker Pro plan has ended");
  });

  it("ends non-renewing plans at period end even without hearing from the provider", async () => {
    const u = await makeUser();
    const periodEnd = new Date(Date.now() + 5 * DAY);
    const sub = await subscribe(u, "sub_maker_pro_monthly", periodEnd);
    await payments.cancelSubscription(sub.id, u);
    // No provider id to re-fetch with, so only the period end applies.
    await dbmod
      .db()
      .update(dbmod.schema.subscriptions)
      .set({ providerSubscriptionId: null })
      .where(eq(dbmod.schema.subscriptions.id, sub.id));
    expect((await billing.syncSubscriptions(new Date(periodEnd.getTime() + 60_000))).ended).toBe(1);
  });

  it("re-fetches subscriptions we haven't heard about in a day", async () => {
    const u = await makeUser();
    const sub = await subscribe(u, "sub_maker_pro_monthly");
    expect((await billing.syncSubscriptions()).synced).toBe(0);
    fake.state = { status: "past_due" };
    sent.length = 0;
    const res = await billing.syncSubscriptions(new Date(Date.now() + DAY + 60_000));
    expect(res).toMatchObject({ synced: 1 });
    const row = await dbmod.db().query.subscriptions.findFirst({ where: eq(dbmod.schema.subscriptions.id, sub.id) });
    expect(row?.status).toBe("past_due");
    expect(sent[0].subject).toContain("didn't go through");
  });

  it("Maker Unlimited gets 3 free Fast Tracks a quarter, numbered per quarter", async () => {
    const u = await makeUser();
    await subscribe(u, "sub_maker_unlimited_monthly");
    expect(await ent.limit(u, "links")).toBe(10_000);
    expect(await ads.extraWeeksFor(u)).toBe(8);
    expect((await billing.proUserIds([u])).has(u)).toBe(true);
    expect(await billing.fastTrackCredit(u)).toEqual({ eligible: true, available: true, remaining: 3, allowed: 3 });
    const claims = [
      await billing.claimFastTrackCredit(u, crypto.randomUUID()),
      await billing.claimFastTrackCredit(u, crypto.randomUUID()),
      await billing.claimFastTrackCredit(u, crypto.randomUUID()),
    ];
    expect(new Set(claims.map((c) => c.periodKey)).size).toBe(3);
    expect(await billing.fastTrackCredit(u)).toEqual({ eligible: true, available: false, remaining: 0, allowed: 3 });
    await expect(billing.claimFastTrackCredit(u, crypto.randomUUID())).rejects.toThrow("used this quarter");
  });

  it("upgrading ends the lower plan when the new one is paid, quietly and with no refund", async () => {
    const u = await makeUser();
    const pro = await subscribe(u, "sub_maker_pro_monthly");
    sent.length = 0;
    await subscribe(u, "sub_maker_unlimited_monthly", new Date(Date.now() + 365 * DAY));
    expect(fake.cancelled).toContain(pro.providerSubscriptionId);
    expect(await subRow(pro.id)).toMatchObject({ status: "non_renewing" });
    expect((await ent.planFor(u))?.id).toBe("maker_unlimited");
    expect(sent.map((e) => e.subject)).toEqual(["Welcome to Maker Unlimited"]);
    expect(sent[0].text).toContain("Your Maker Pro plan has been cancelled");

    // When Pro's time runs out and the provider says so, there's nothing to tell them.
    sent.length = 0;
    const after = new Date(pro.currentPeriodEnd!.getTime() + DAY);
    await billing.applySubscriptionState((await subRow(pro.id))!, { status: "cancelled" }, after);
    expect(sent).toEqual([]);
  });

  it("won't sell a plan they already pay for, or a lower one until they cancel", async () => {
    const u = await makeUser();
    const unlimited = await subscribe(u, "sub_maker_unlimited_monthly");
    const buy = (skuId: string) =>
      payments.startSubscription({ skuId, provider: "paystack", userId: u, email: "u@x.test" });
    await expect(buy("sub_maker_unlimited_monthly")).rejects.toThrow("already on Maker Unlimited");
    await expect(buy("sub_maker_pro_monthly")).rejects.toThrow("Cancel it first");

    await payments.cancelSubscription(unlimited.id, u);
    await expect(buy("sub_maker_pro_monthly")).resolves.toMatchObject({ subscriptionId: expect.any(String) });
  });

  it("limits listings by plan, counting everything but archived", async () => {
    const u = await makeUser();
    const listing = (domain: string) =>
      products.saveProduct(u, {
        websiteUrl: `https://${domain}/`,
        name: domain,
        tagline: `${domain} does useful things`,
        description: "A".repeat(60),
        categories: ["ai"],
        pricingModel: "freemium",
        screenshots: [`https://${domain}/shot.png`],
      });
    await listing("one.io");
    expect(await products.listingLimitReached(u)).toBeNull();
    const two = await listing("two.io");
    expect(await products.listingLimitReached(u)).toContain("Your plan covers 2 listings");
    await dbmod
      .db()
      .update(dbmod.schema.products)
      .set({ status: "archived" })
      .where(eq(dbmod.schema.products.id, two.id));
    expect(await products.listingLimitReached(u)).toBeNull();
  });
});
