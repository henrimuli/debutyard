/**
 * Payment service against a real Postgres. Runs when TEST_DATABASE_URL is set
 * (CI starts a Postgres service); skipped otherwise. The database is wiped.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";

const TEST_DB = process.env.TEST_DATABASE_URL;

const sent: Array<{ to: string; subject: string }> = [];
let failNextEmail = false;
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (email: { to: string; subject: string }) => {
    if (failNextEmail) {
      failNextEmail = false;
      throw new Error("Resend is down");
    }
    sent.push({ to: email.to, subject: email.subject });
  }),
}));

class FakeProvider implements PaymentProvider {
  readonly id = "paystack" as const;
  verifyResult: VerifiedPayment | null = null;
  nextEvent: WebhookEvent | null = null;
  refunds: Array<{ providerRef: string; amountCents: number }> = [];
  async createCheckout(req: { orderId: string }) {
    return { url: `https://pay.test/${req.orderId}`, providerRef: `ref-${req.orderId}` };
  }
  async verifyPayment(ref: string): Promise<VerifiedPayment> {
    return this.verifyResult ?? { status: "pending", providerRef: ref };
  }
  async refund(args: { providerRef: string; amountCents: number }) {
    this.refunds.push(args);
    return { providerRef: `rf-${this.refunds.length}` };
  }
  async createPlan() {
    return { planId: "PLN_1" };
  }
  async createSubscription() {
    return { url: "https://pay.test/sub" };
  }
  async cancelSubscription() {}
  async getSubscription() {
    return { status: "active" as const };
  }
  async parseWebhook(): Promise<WebhookEvent> {
    if (!this.nextEvent) throw new Error("no event queued");
    return this.nextEvent;
  }
}

describe.skipIf(!TEST_DB)("payment service (Postgres)", () => {
  const fake = new FakeProvider();
  let svc: typeof import("@/lib/payments/service");
  let dbmod: typeof import("@/db");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";

    const admin = postgres(TEST_DB!, { max: 1, onnotice: () => {} });
    await admin.unsafe(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
    await migrate(drizzle(admin), { migrationsFolder: "supabase/migrations" });
    await admin.end();

    const payments = await import("@/lib/payments");
    payments.setProviderForTests("paystack", fake);
    svc = await import("@/lib/payments/service");
    dbmod = await import("@/db");
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    sent.length = 0;
    fake.verifyResult = null;
    fake.nextEvent = null;
    fake.refunds = [];
    await dbmod
      .db()
      .execute(sql`truncate orders, payment_events, refunds, coupons, subscriptions, provider_plans, "user" cascade`);
  });

  const paid = (orderId: string, amountCents: number): VerifiedPayment => ({
    status: "paid",
    providerRef: `ref-${orderId}`,
    orderId,
    amountCents,
    currency: "USD",
  });

  async function order(id: string) {
    const { orders } = dbmod.schema;
    return (await dbmod.db().select().from(orders).where(eq(orders.id, id)))[0];
  }

  it("creates a pending order with the coupon applied", async () => {
    await dbmod.db().insert(dbmod.schema.coupons).values({ code: "LAUNCH20", percentOff: 20 });
    const { orderId, url } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "buyer@example.com",
      couponCode: "launch20",
    });
    expect(url).toBe(`https://pay.test/${orderId}`);
    expect(await order(orderId)).toMatchObject({
      status: "pending",
      kind: "submission",
      listAmountCents: 9900,
      discountCents: 1980,
      amountCents: 7920,
      providerRef: `ref-${orderId}`,
    });
  });

  it("limits a first-purchase coupon to buyers without a paid debut", async () => {
    await dbmod.db().insert(dbmod.schema.coupons).values({ code: "KIT15", percentOff: 15, firstPurchaseOnly: true });
    const fresh = await svc.startCheckout({
      skuId: "launch_pro",
      provider: "paystack",
      email: "new@x.com",
      couponCode: "KIT15",
    });
    expect(await order(fresh.orderId)).toMatchObject({ listAmountCents: 3900, discountCents: 585, amountCents: 3315 });

    await dbmod.db().insert(dbmod.schema.orders).values({
      email: "Old@X.com",
      kind: "launch",
      sku: "launch_fast_track",
      listAmountCents: 1500,
      amountCents: 1500,
      currency: "USD",
      provider: "paystack",
      status: "paid",
    });
    await expect(
      svc.startCheckout({ skuId: "launch_pro", provider: "paystack", email: "old@x.com", couponCode: "KIT15" }),
    ).rejects.toThrow("first paid debut");
  });

  it("marks paid, redeems the coupon and fulfils exactly once", async () => {
    const [coupon] = await dbmod.db().insert(dbmod.schema.coupons).values({ code: "HALF", percentOff: 50 }).returning();
    const { orderId } = await svc.startCheckout({
      skuId: "submission_growth",
      provider: "paystack",
      email: "b@x.com",
      couponCode: "HALF",
    });

    fake.verifyResult = paid(orderId, 8950);
    const first = await svc.confirmPayment("paystack", `ref-${orderId}`);
    expect(first).toMatchObject({ status: "paid" });
    expect(first?.fulfilledAt).toBeInstanceOf(Date);
    expect(sent.map((e) => e.to).sort()).toEqual(["b@x.com", "ops@debutyard.test"]);

    // Return page and webhook both confirming: no second fulfilment or redemption.
    await svc.confirmPayment("paystack", `ref-${orderId}`);
    expect(sent).toHaveLength(2);
    const [c] = await dbmod.db().select().from(dbmod.schema.coupons).where(eq(dbmod.schema.coupons.id, coupon.id));
    expect(c.redeemedCount).toBe(1);
  });

  it("refuses to fulfil when the paid amount doesn't match", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    fake.verifyResult = paid(orderId, 100);
    const result = await svc.confirmPayment("paystack", `ref-${orderId}`);
    expect(result).toMatchObject({ status: "failed" });
    expect(result?.failureReason).toMatch(/Amount mismatch/);
    expect(sent).toHaveLength(0);
  });

  it("retries fulfilment after a failure", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    fake.verifyResult = paid(orderId, 9900);
    failNextEmail = true;
    await expect(svc.confirmPayment("paystack", `ref-${orderId}`)).rejects.toThrow("Resend is down");
    expect(await order(orderId)).toMatchObject({ status: "paid", fulfilledAt: null });

    await svc.confirmPayment("paystack", `ref-${orderId}`);
    expect((await order(orderId)).fulfilledAt).toBeInstanceOf(Date);
  });

  it("lets a declined order become paid when the buyer retries", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    fake.verifyResult = { status: "failed", providerRef: `ref-${orderId}`, reason: "Declined" };
    expect(await svc.confirmPayment("paystack", `ref-${orderId}`)).toMatchObject({ status: "failed" });
    fake.verifyResult = paid(orderId, 9900);
    expect(await svc.confirmPayment("paystack", `ref-${orderId}`)).toMatchObject({
      status: "paid",
      failureReason: null,
    });
  });

  it("processes each webhook event once", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    fake.verifyResult = paid(orderId, 9900);
    fake.nextEvent = {
      eventId: "evt-1",
      type: "charge.success",
      kind: "payment_succeeded",
      providerRef: `ref-${orderId}`,
    };

    await svc.handleWebhook("paystack", JSON.stringify({ event: "charge.success" }), new Headers());
    await svc.handleWebhook("paystack", JSON.stringify({ event: "charge.success" }), new Headers());

    const events = await dbmod.db().select().from(dbmod.schema.paymentEvents);
    expect(events).toHaveLength(1);
    expect(events[0].processedAt).toBeInstanceOf(Date);
    expect(sent).toHaveLength(2);
  });

  it("refunds partially, then fully, and blocks over-refunds", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    fake.verifyResult = paid(orderId, 9900);
    await svc.confirmPayment("paystack", `ref-${orderId}`);

    expect(await svc.refundOrder(orderId, "Two directories rejected", 1000)).toMatchObject({
      status: "partially_refunded",
    });
    await expect(svc.refundOrder(orderId, "too much", 9000)).rejects.toThrow(/between 1 and 8900/);
    expect(await svc.refundOrder(orderId, "Money-back guarantee")).toMatchObject({ status: "refunded" });
    expect(fake.refunds.map((r) => r.amountCents)).toEqual([1000, 8900]);
  });

  it("marks long-abandoned checkouts as failed", async () => {
    const { orderId } = await svc.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "b@x.com",
    });
    await dbmod
      .db()
      .update(dbmod.schema.orders)
      .set({ createdAt: new Date(Date.now() - 25 * 3600 * 1000) })
      .where(eq(dbmod.schema.orders.id, orderId));
    await svc.reconcilePendingOrders();
    expect(await order(orderId)).toMatchObject({ status: "failed", failureReason: "Checkout abandoned" });
  });

  it("matches Paystack subscription events by customer email and plan", async () => {
    const { user, subscriptions } = dbmod.schema;
    await dbmod.db().insert(user).values({ id: "u1", name: "Ann", email: "ann@x.com" });
    const [sub] = await dbmod
      .db()
      .insert(subscriptions)
      .values({ userId: "u1", sku: "sub_maker_pro_monthly", provider: "paystack", providerPlanId: "PLN_1" })
      .returning();

    fake.nextEvent = {
      eventId: "subscription.create:SUB_1:active",
      type: "subscription.create",
      kind: "subscription_updated",
      providerSubscriptionId: "SUB_1",
      status: "active",
      providerToken: "tok",
      customerEmail: "ann@x.com",
      planId: "PLN_1",
    };
    await svc.handleWebhook("paystack", "{}", new Headers());

    const [after] = await dbmod.db().select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(after).toMatchObject({ status: "active", providerSubscriptionId: "SUB_1", providerToken: "tok" });
  });

  it("enables row-level security on every table (Supabase Data API)", async () => {
    const rows = await dbmod.db().execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const tables = rows.rows;
    expect(tables.length).toBeGreaterThan(5);
    expect(tables.filter((t) => !t.relrowsecurity).map((t) => t.relname)).toEqual([]);
  });
});
