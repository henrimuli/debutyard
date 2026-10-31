/**
 * Launch board flows against a real Postgres: listings, scheduling, paid tiers,
 * moderation refunds, applause, ranking and the weekly rollover.
 * Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { addWeeks, weekBounds, weekKeyFor } from "@/lib/weeks";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

const sent: Array<{ to: string; subject: string; text?: string; headers?: Record<string, string> }> = [];
const batches: string[] = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (email: { to: string; subject: string; text: string }) => {
    sent.push({ to: email.to, subject: email.subject, text: email.text });
  }),
  sendBatch: vi.fn(
    async (emails: Array<{ to: string; subject: string; headers?: Record<string, string> }>, key: string) => {
      batches.push(key);
      for (const e of emails) sent.push({ to: e.to, subject: e.subject, headers: e.headers });
      return emails.length;
    },
  ),
}));

/** Readiness checks fetch this page instead of the network. */
const fakePage = { body: "", status: 200 };
vi.mock("@/lib/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net")>();
  return {
    ...actual,
    safeFetchText: vi.fn(async (url: string) => {
      if (url.includes("down.test")) throw new Error("connect ECONNREFUSED");
      return { url, status: fakePage.status, contentType: "text/html", body: fakePage.body };
    }),
  };
});

class FakeProvider implements PaymentProvider {
  readonly id = "paystack" as const;
  verifyResult: VerifiedPayment | null = null;
  refunds: number[] = [];
  async createCheckout(req: { orderId: string }) {
    return { url: `https://pay.test/${req.orderId}`, providerRef: `ref-${req.orderId}` };
  }
  async verifyPayment(ref: string): Promise<VerifiedPayment> {
    return this.verifyResult ?? { status: "pending", providerRef: ref };
  }
  async refund(args: { amountCents: number }) {
    this.refunds.push(args.amountCents);
    return { providerRef: `rf-${this.refunds.length}` };
  }
  async createPlan() {
    return { planId: "PLN" };
  }
  async createSubscription() {
    return { url: "https://pay.test/sub" };
  }
  async cancelSubscription() {}
  async getSubscription() {
    return { status: "active" as const };
  }
  async parseWebhook(): Promise<WebhookEvent> {
    throw new Error("unused");
  }
}

describe.skipIf(!TEST_DB)("launch board (Postgres)", () => {
  const fake = new FakeProvider();
  let dbmod: typeof import("@/db");
  let products: typeof import("@/lib/products/service");
  let moderation: typeof import("@/lib/products/moderation");
  let payments: typeof import("@/lib/payments/service");
  let engagement: typeof import("@/lib/board/engagement");
  let queries: typeof import("@/lib/board/queries");
  let rollover: typeof import("@/lib/board/rollover");
  let dashboard: typeof import("@/lib/products/dashboard");
  let newsletter: typeof import("@/lib/newsletter/service");
  let blog: typeof import("@/lib/blog/service");
  let ads: typeof import("@/lib/ads/service");

  const now = new Date();
  const thisWeek = weekKeyFor(now);
  const nextWeek = addWeeks(thisWeek, 1);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", fake);
    dbmod = await import("@/db");
    products = await import("@/lib/products/service");
    moderation = await import("@/lib/products/moderation");
    payments = await import("@/lib/payments/service");
    engagement = await import("@/lib/board/engagement");
    queries = await import("@/lib/board/queries");
    rollover = await import("@/lib/board/rollover");
    dashboard = await import("@/lib/products/dashboard");
    newsletter = await import("@/lib/newsletter/service");
    blog = await import("@/lib/blog/service");
    ads = await import("@/lib/ads/service");
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    sent.length = 0;
    batches.length = 0;
    fake.verifyResult = null;
    fake.refunds = [];
    await dbmod.db().execute(
      sql`truncate products, launch_weeks, applause, comments, awards, orders, payment_events, refunds, closed_periods,
          newsletter_subscribers, newsletter_issues, posts, ad_bookings, readiness_checks, api_tokens, "user" cascade`,
    );
  });

  let userSeq = 0;
  async function makeUser(ageHours = 1000) {
    const id = `u${++userSeq}`;
    await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values({ id, name: `User ${id}`, email: `${id}@x.test`, createdAt: new Date(Date.now() - ageHours * 3600_000) });
    return id;
  }

  const input = (domain: string, name = domain) => ({
    websiteUrl: `https://${domain}/`,
    name,
    tagline: `${name} does useful things`,
    description: "A".repeat(60),
    categories: ["productivity"],
    pricingModel: "freemium" as const,
    screenshots: [`https://${domain}/shot.png`],
  });

  /** Marks a listing's badge as found, as a successful check would. */
  async function badgeFound(productId: string) {
    await dbmod
      .db()
      .update(dbmod.schema.badgeVerifications)
      .set({ status: "verified", method: "html", lastCheckedAt: new Date(), lastSeenAt: new Date() })
      .where(eq(dbmod.schema.badgeVerifications.productId, productId));
  }

  /** Creates an approved listing in a given week, bypassing review. */
  async function liveProduct(userId: string, domain: string, week = thisWeek) {
    const p = await products.saveProduct(userId, input(domain));
    await products.ensureWeek(week);
    await dbmod
      .db()
      .update(dbmod.schema.products)
      .set({ status: "approved", launchWeekKey: week, approvedAt: new Date() })
      .where(eq(dbmod.schema.products.id, p.id));
    return p;
  }

  it("creates listings with categories and a badge token, and blocks duplicate domains", async () => {
    const u = await makeUser();
    const p = await products.saveProduct(u, input("acme.app", "Acme"));
    expect(p).toMatchObject({ slug: "acme", status: "draft", tier: "free", domain: "acme.app" });
    const badge = await dbmod.db().query.badgeVerifications.findFirst({
      where: eq(dbmod.schema.badgeVerifications.productId, p.id),
    });
    expect(badge?.dnsToken).toMatch(/^[0-9a-f]{24}$/);

    await expect(products.submitForReview(p.id, u)).rejects.toThrow(/need the DebutYard badge/);
    await badgeFound(p.id);
    expect((await products.submitForReview(p.id, u)).status).toBe("pending");
    const other = await makeUser();
    await expect(products.saveProduct(other, input("www.acme.app", "Acme 2"))).rejects.toThrow(/already listed/);
  });

  it("needs a screenshot before a draft goes into review", async () => {
    const u = await makeUser();
    // API drafts leave screenshots out.
    const p = await products.saveProduct(u, { ...input("noshot.io"), screenshots: undefined });
    await badgeFound(p.id);
    await expect(products.submitForReview(p.id, u)).rejects.toThrow(/at least one screenshot/);
    await products.saveProduct(u, input("noshot.io"), p.id);
    expect((await products.submitForReview(p.id, u)).status).toBe("pending");
  });

  it("limits makers to two waiting free debuts", async () => {
    const u = await makeUser();
    for (const d of ["a.io", "b.io"]) {
      const p = await products.saveProduct(u, input(d));
      await badgeFound(p.id);
      await products.submitForReview(p.id, u);
    }
    const third = await products.saveProduct(u, input("c.io"));
    await badgeFound(third.id);
    await expect(products.submitForReview(third.id, u)).rejects.toThrow(/2 free debuts/);
  });

  it("lets owners and admins submit free debuts without the badge or the cap, leaving the badge unverified", async () => {
    const u = await makeUser();
    const ids: string[] = [];
    for (const d of ["staff-a.io", "staff-b.io", "staff-c.io"]) {
      const p = await products.saveProduct(u, input(d));
      expect((await products.submitForReview(p.id, u, { override: true })).status).toBe("pending");
      ids.push(p.id);
    }
    const badge = await dbmod.db().query.badgeVerifications.findFirst({
      where: eq(dbmod.schema.badgeVerifications.productId, ids[2]),
    });
    expect(badge?.status).toBe("unverified");
    // Without the override the same maker is held to both rules.
    const fourth = await products.saveProduct(u, input("staff-d.io"));
    await expect(products.submitForReview(fourth.id, u)).rejects.toThrow(/2 free debuts/);
  });

  it("schedules free approvals into the next week with room", async () => {
    const u = await makeUser();
    await products.ensureWeek(nextWeek);
    await dbmod
      .db()
      .update(dbmod.schema.launchWeeks)
      .set({ freeCapacity: 1 })
      .where(eq(dbmod.schema.launchWeeks.key, nextWeek));

    const first = await products.saveProduct(u, input("one.io"));
    await badgeFound(first.id);
    await products.submitForReview(first.id, u);
    expect((await moderation.approve(first.id)).launchWeekKey).toBe(nextWeek);

    const u2 = await makeUser();
    const second = await products.saveProduct(u2, input("two.io"));
    await badgeFound(second.id);
    await products.submitForReview(second.id, u2);
    expect((await moderation.approve(second.id)).launchWeekKey).toBe(addWeeks(nextWeek, 1));
    expect(sent.some((e) => e.subject.includes("is approved"))).toBe(true);
  });

  it("applies a paid tier after payment and books the requested week", async () => {
    const u = await makeUser();
    const p = await products.saveProduct(u, input("paid.io"));
    const wanted = addWeeks(thisWeek, 3);

    const { orderId } = await payments.startCheckout({
      skuId: "launch_pro",
      provider: "paystack",
      email: `${u}@x.test`,
      userId: u,
      metadata: { productId: p.id, weekKey: wanted },
    });
    await dbmod.db().insert(dbmod.schema.productOrders).values({ orderId, productId: p.id });
    fake.verifyResult = { status: "paid", providerRef: `ref-${orderId}`, orderId, amountCents: 3900, currency: "USD" };
    const order = await payments.confirmPayment("paystack", `ref-${orderId}`);
    expect(order?.fulfilledAt).toBeInstanceOf(Date);

    const after = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.id, p.id) });
    expect(after).toMatchObject({ tier: "pro", status: "pending", requestedWeekKey: wanted });
    expect((await moderation.approve(p.id)).launchWeekKey).toBe(wanted);
  });

  it("puts paid debuts live on approval, skipping the Monday queue", async () => {
    const u = await makeUser();
    const p = await products.saveProduct(u, input("instant.io"));
    const { orderId } = await payments.startCheckout({
      skuId: "launch_fast_track",
      provider: "paystack",
      email: `${u}@x.test`,
      userId: u,
      metadata: { productId: p.id, weekKey: null },
    });
    await dbmod.db().insert(dbmod.schema.productOrders).values({ orderId, productId: p.id });
    fake.verifyResult = { status: "paid", providerRef: `ref-${orderId}`, orderId, amountCents: 1500, currency: "USD" };
    await payments.confirmPayment("paystack", `ref-${orderId}`);

    expect((await moderation.approve(p.id)).launchWeekKey).toBe(thisWeek);
    const live = await dbmod
      .db()
      .select({ id: dbmod.schema.products.id })
      .from(dbmod.schema.products)
      .where(and(eq(dbmod.schema.products.id, p.id), products.isLiveCondition()));
    expect(live).toHaveLength(1);
  });

  it("refunds paid listings when they're rejected (money-back guarantee)", async () => {
    const u = await makeUser();
    const p = await products.saveProduct(u, input("refund.io"));
    const { orderId } = await payments.startCheckout({
      skuId: "launch_fast_track",
      provider: "paystack",
      email: `${u}@x.test`,
      userId: u,
      metadata: { productId: p.id, weekKey: null },
    });
    await dbmod.db().insert(dbmod.schema.productOrders).values({ orderId, productId: p.id });
    fake.verifyResult = { status: "paid", providerRef: `ref-${orderId}`, orderId, amountCents: 1500, currency: "USD" };
    await payments.confirmPayment("paystack", `ref-${orderId}`);

    const rejected = await moderation.reject(p.id, "Website doesn't load");
    expect(rejected.status).toBe("rejected");
    expect(fake.refunds).toEqual([1500]);
    const after = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.id, p.id) });
    expect(after?.tier).toBe("free");
    expect(sent.some((e) => e.subject.startsWith("About your DebutYard submission"))).toBe(true);
  });

  it("only allows applause on live products, weights new accounts, and toggles", async () => {
    const maker = await makeUser();
    const upcoming = await liveProduct(maker, "soon.io", nextWeek);
    const applauder = await makeUser(1); // brand-new account
    await expect(
      engagement.toggleApplause({ userId: applauder, productId: upcoming.id, ip: "1.2.3.4", userAgent: "x" }),
    ).rejects.toThrow(/isn't live/);

    const live = await liveProduct(maker, "live.io");
    expect(
      await engagement.toggleApplause({ userId: applauder, productId: live.id, ip: "1.2.3.4", userAgent: "x" }),
    ).toEqual({
      applauded: true,
      applause: 1,
    });
    const [clap] = await dbmod.db().select().from(dbmod.schema.applause);
    expect(clap).toMatchObject({ weight: 0.25, flagReason: "new account" });
    expect(clap.ipHash).not.toContain("1.2.3.4");

    expect(
      await engagement.toggleApplause({ userId: applauder, productId: live.id, ip: null, userAgent: null }),
    ).toEqual({
      applauded: false,
      applause: 0,
    });
  });

  it("ranks the week by weighted applause plus substantive comments", async () => {
    const maker = await makeUser();
    const a = await liveProduct(maker, "alpha.io");
    const maker2 = await makeUser();
    const b = await liveProduct(maker2, "beta.io");

    const veteran = await makeUser();
    const newbie1 = await makeUser(1);
    const newbie2 = await makeUser(1);
    await engagement.toggleApplause({ userId: veteran, productId: a.id, ip: "9.9.9.1", userAgent: null });
    await engagement.toggleApplause({ userId: newbie1, productId: b.id, ip: "9.9.9.2", userAgent: null });
    await engagement.toggleApplause({ userId: newbie2, productId: b.id, ip: "9.9.9.3", userAgent: null });
    // b has more raw applause (2 vs 1) but new accounts weigh 0.25 each → 0.5 < 1.
    let board = await queries.weekBoard(thisWeek, veteran);
    expect(board.map((x) => [x.slug, x.applause, x.score])).toEqual([
      ["alpha-io", 1, 1],
      ["beta-io", 2, 0.5],
    ]);
    expect(board[0].applaudedByMe).toBe(true);

    // Two substantive comments (+0.5 each) put b ahead; the maker's own comment doesn't count.
    await engagement.addComment({
      userId: veteran,
      productId: b.id,
      body: "Really like the onboarding, how do you handle exports?",
    });
    await engagement.addComment({
      userId: newbie1,
      productId: b.id,
      body: "Tried it today, the sync is genuinely fast. Nice work!",
    });
    await engagement.addComment({
      userId: maker2,
      productId: b.id,
      body: "Thanks all! Exports are coming next month, stay tuned.",
    });
    board = await queries.weekBoard(thisWeek);
    expect(board[0]).toMatchObject({ slug: "beta-io", score: 1.5, comments: 3 });
  });

  it("keeps applauding after the debut week without changing that week's ranking", async () => {
    const lastWeek = addWeeks(thisWeek, -1);
    const inLastWeek = new Date(weekBounds(lastWeek).startsAt.getTime() + 3600_000);
    // Tied on debut-week applause; first goes first because it was approved earlier.
    const first = await liveProduct(await makeUser(), "first.io", lastWeek);
    const second = await liveProduct(await makeUser(), "second.io", lastWeek);
    const early = await makeUser();
    const early2 = await makeUser();
    await dbmod
      .db()
      .insert(dbmod.schema.applause)
      .values([
        { productId: first.id, userId: early, weight: 1, createdAt: inLastWeek },
        { productId: second.id, userId: early2, weight: 1, createdAt: inLastWeek },
      ]);

    // New users find second.io weeks later and applaud it: all-time only.
    const late = [await makeUser(), await makeUser()];
    for (const [i, u] of late.entries()) {
      expect(
        await engagement.toggleApplause({ userId: u, productId: second.id, ip: `8.8.8.${i}`, userAgent: null }),
      ).toMatchObject({ applauded: true });
    }
    const board = await queries.weekBoard(lastWeek, early2);
    expect(board.map((x) => [x.slug, x.rank, x.score, x.debutApplause, x.applause])).toEqual([
      ["first-io", 1, 1, 1, 1],
      ["second-io", 2, 1, 1, 3],
    ]);
    expect(board.find((x) => x.slug === "second-io")?.applauseFinal).toBe(true);

    // A debut-week clap is final; a later one can still be taken back.
    await expect(
      engagement.toggleApplause({ userId: early2, productId: second.id, ip: null, userAgent: null }),
    ).rejects.toThrow(/final/);
    expect(
      await engagement.toggleApplause({ userId: late[0], productId: second.id, ip: null, userAgent: null }),
    ).toEqual({ applauded: false, applause: 2 });

    const featured = await queries.applauseForSlugs(["second-io", "first-io", "missing"], late[1]);
    expect(featured.get("second-io")).toMatchObject({ applause: 2, applaudedByMe: true, applauseFinal: false });
    expect(featured.get("first-io")).toMatchObject({ applause: 1, applaudedByMe: false });
    expect(featured.has("missing")).toBe(false);
  });

  it("closes ended weeks once: awards the top 3 with applause and makes them winners", async () => {
    const lastWeek = addWeeks(thisWeek, -1);
    const applauders = [await makeUser(), await makeUser(), await makeUser()];
    const ids: string[] = [];
    for (const [i, d] of ["w1.io", "w2.io", "w3.io", "w4.io", "w5.io"].entries()) {
      const m = await makeUser();
      const p = await liveProduct(m, d, lastWeek);
      ids.push(p.id);
      // w1 gets 3 applause, w2 2, w3 1, w4 1, w5 none — cast inside last week.
      const n = [3, 2, 1, 1, 0][i];
      for (let v = 0; v < n; v++) {
        await dbmod
          .db()
          .insert(dbmod.schema.applause)
          .values({ productId: p.id, userId: applauders[v], weight: 1, createdAt: weekBounds(lastWeek).startsAt });
      }
    }

    const closed = await rollover.closeEndedWeeks();
    expect(closed).toEqual([{ week: lastWeek, winners: ["w1-io", "w2-io", "w3-io"] }]);
    const awards = await dbmod.db().select().from(dbmod.schema.awards).orderBy(dbmod.schema.awards.place);
    expect(awards.map((a) => [a.place, a.productId])).toEqual([
      [1, ids[0]],
      [2, ids[1]],
      [3, ids[2]],
    ]);
    const winnerEmails = sent.filter((e) => e.subject.includes("Debut of the Week")).length;
    expect(winnerEmails).toBe(3);

    // Idempotent: a second run awards nothing and sends nothing.
    expect(await rollover.closeEndedWeeks()).toEqual([]);
    expect(sent.filter((e) => e.subject.includes("Debut of the Week")).length).toBe(3);
    const w1 = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.id, ids[0]) });
    expect(w1?.isWinner).toBe(true);
  });

  it("caps Spotlight at three at any time, waitlists makers and features paid debuts", async () => {
    const P = dbmod.schema.products;
    const spotlight = await import("@/lib/products/spotlight");
    const setTo = (id: string, patch: Partial<typeof P.$inferInsert>) =>
      dbmod.db().update(P).set(patch).where(eq(P.id, id));

    // Waiting for review, and live inside its 30 days: both hold a spot.
    const pending = await products.saveProduct(await makeUser(), input("s1.io"));
    await setTo(pending.id, { tier: "spotlight", status: "pending" });
    const live = await liveProduct(await makeUser(), "s2.io");
    await setTo(live.id, { tier: "spotlight" });
    // Its 30 days are over: the spot is free again.
    const oldWeek = addWeeks(thisWeek, -7);
    await products.ensureWeek(oldWeek);
    const expired = await liveProduct(await makeUser(), "s3.io");
    await setTo(expired.id, { tier: "spotlight", launchWeekKey: oldWeek, approvedAt: weekBounds(oldWeek).startsAt });
    expect(await spotlight.spotlightSpotsTaken()).toBe(2);
    expect(await spotlight.spotlightAvailable()).toBe(true);

    const third = await products.saveProduct(await makeUser(), input("s4.io"));
    await setTo(third.id, { tier: "spotlight", status: "pending" });
    expect(await spotlight.spotlightAvailable()).toBe(false);
    // The listing being bought for doesn't count against itself.
    expect(await spotlight.spotlightAvailable(third.id)).toBe(true);

    // Full: a maker joins the waitlist (twice is fine) and hears nothing yet.
    const waiting = await makeUser();
    const want = await products.saveProduct(waiting, input("want.io"));
    await spotlight.joinSpotlightWaitlist(waiting, want.id);
    await spotlight.joinSpotlightWaitlist(waiting, want.id);
    expect(await spotlight.onSpotlightWaitlist(waiting)).toBe(true);
    expect(await spotlight.notifySpotlightWaitlist()).toBe(0);

    // A spot opens: everyone waiting is emailed once.
    await setTo(third.id, { status: "rejected" });
    expect(await spotlight.notifySpotlightWaitlist()).toBe(1);
    expect(sent.filter((e) => e.subject === "A Spotlight spot just opened")).toHaveLength(1);
    expect(await spotlight.notifySpotlightWaitlist()).toBe(0);
    expect(await spotlight.onSpotlightWaitlist(waiting)).toBe(false);

    // The live Spotlight is in the Spotlight only, never also in the featured cards.
    const m = await makeUser();
    const pro = await liveProduct(m, "featured.io");
    await setTo(pro.id, { tier: "pro" });
    const { cardMediaForSlugs, featuredNow } = await import("@/lib/board/featured");
    expect((await featuredNow()).map((f) => [f.slug, f.hero])).toEqual([
      ["s2-io", true],
      ["featured-io", false],
    ]);
    expect((await cardMediaForSlugs(["featured-io"])).get("featured-io")).toEqual({
      imageUrl: "https://featured.io/shot.png",
      websiteUrl: "https://featured.io/",
    });
  });

  it("hides unlaunched products from the public but lets the maker preview", async () => {
    const maker = await makeUser();
    const p = await liveProduct(maker, "later.io", nextWeek);
    expect(await queries.getProductPage(p.slug, null)).toBeNull();
    expect(await queries.getProductPage(p.slug, { id: maker, staff: false })).toMatchObject({ live: false });
    const live = await liveProduct(maker, "now.io");
    expect(await queries.getProductPage(live.slug, null)).toMatchObject({ live: true, weekRank: 1 });
  });

  it("returns dashboard stats for a maker's listings", async () => {
    const maker = await makeUser();
    const p = await liveProduct(maker, "stats.io");
    await dbmod
      .db()
      .insert(dbmod.schema.productEvents)
      .values([
        { productId: p.id, kind: "view" },
        { productId: p.id, kind: "view" },
        { productId: p.id, kind: "outbound_click" },
      ]);
    const [row] = await dashboard.dashboardProducts(maker);
    expect(row.stats).toMatchObject({ views_30d: 2, clicks_30d: 1, applause: 0 });
  });

  async function applaudAt(productId: string, userId: string, at: Date) {
    await dbmod.db().insert(dbmod.schema.applause).values({ productId, userId, weight: 1, createdAt: at });
  }

  it("scores each product on its own debut week and awards ended months once", async () => {
    // September 2026 = W37..W40 (weeks whose Monday falls in September).
    const [w37, w38] = ["2026-W37", "2026-W38"];
    const applauders = [await makeUser(), await makeUser(), await makeUser()];
    const a = await liveProduct(await makeUser(), "sep-a.io", w37);
    const b = await liveProduct(await makeUser(), "sep-b.io", w38);
    const c = await liveProduct(await makeUser(), "sep-c.io", w38);
    const inWeek = (w: string) => new Date(weekBounds(w).startsAt.getTime() + 3600_000);
    await applaudAt(a.id, applauders[0], inWeek(w37));
    await applaudAt(a.id, applauders[1], inWeek(w37));
    for (const v of applauders) await applaudAt(b.id, v, inWeek(w38));
    // Applause after a product's debut week show on the page but don't score.
    for (const v of applauders) await applaudAt(c.id, v, inWeek("2026-W39"));

    const board = await queries.boardForWeeks([w37, w38]);
    expect(board.map((p) => [p.slug, p.applause, p.score, p.weekKey])).toEqual([
      ["sep-b-io", 3, 3, w38],
      ["sep-a-io", 2, 2, w37],
      ["sep-c-io", 3, 0, w38],
    ]);

    const now = new Date("2026-10-26T01:00:00Z");
    await rollover.closeEndedPeriods(now);
    const monthAwards = await dbmod.db().query.awards.findMany({
      where: eq(dbmod.schema.awards.scope, "month"),
      orderBy: (aw, { asc }) => asc(aw.place),
    });
    expect(monthAwards.map((aw) => [aw.periodKey, aw.place, aw.productId])).toEqual([
      ["2026-09", 1, b.id],
      ["2026-09", 2, a.id],
    ]);
    expect(sent.filter((e) => e.subject.includes("Debut of the Month")).length).toBe(2);
    // The year isn't over, so no yearly awards yet; a re-run changes nothing.
    await rollover.closeEndedPeriods(now);
    expect(await dbmod.db().select().from(dbmod.schema.awards)).toHaveLength(2);
  });

  it("runs newsletter double opt-in, sends the digest once per week, and unsubscribes", async () => {
    expect(await newsletter.subscribe(" Reader@X.test ", "footer")).toBe("confirm_sent");
    expect(await newsletter.subscribe("reader@x.test")).toBe("recently_sent");
    const confirm = sent.find((e) => e.to === "reader@x.test");
    const token = confirm?.text?.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(await newsletter.confirmSubscription("nope")).toBe(false);
    expect(await newsletter.confirmSubscription(token!)).toBe(true);
    expect(await newsletter.subscribe("reader@x.test")).toBe("already_subscribed");
    await newsletter.subscribe("pending@x.test");

    // Nothing to send until last week has closed.
    expect(await newsletter.sendWeeklyDigest(now)).toEqual({ skipped: "week not closed" });

    const lastWeek = addWeeks(thisWeek, -1);
    const applauder = await makeUser();
    const w = await liveProduct(await makeUser(), "digest-win.io", lastWeek);
    await applaudAt(w.id, applauder, weekBounds(lastWeek).startsAt);
    await liveProduct(await makeUser(), "digest-new.io", thisWeek);
    await rollover.closeEndedWeeks();

    sent.length = 0;
    expect(await newsletter.sendWeeklyDigest(now)).toEqual({ week: lastWeek, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("reader@x.test");
    expect(sent[0].subject).toContain("digest-win.io wins");
    expect(sent[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(batches).toEqual([`digest-${lastWeek}`]);

    expect(await newsletter.sendWeeklyDigest(now)).toEqual({ skipped: "already sent or in progress" });
    expect(await newsletter.unsubscribe(token!)).toBe(true);
    expect(await newsletter.subscriberCounts()).toEqual({ active: 0, pending: 1, unsubscribed: 1 });
  });

  it("saves, publishes and hides blog posts", async () => {
    const pub = await import("@/lib/blog/public");
    const author = await makeUser();
    const a = await blog.createPost({ title: "Launch tips", authorId: author });
    const b = await blog.createPost({ title: "Launch tips", authorId: author });
    expect([a.slug, b.slug]).toEqual(["launch-tips", "launch-tips-2"]);

    const category = await blog.createCategory("Guides");
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world." }] }] };
    const fields = { content_json: doc, seo_description: "Tips for launching.", category_id: category.id };
    await blog.saveDraft(a.id, author, { baseVersion: 1, fields });
    // A stale autosave is refused rather than overwriting the newer copy.
    await expect(blog.saveDraft(a.id, author, { baseVersion: 1, fields: {} })).rejects.toMatchObject({ status: 409 });

    expect(await pub.getPublishedPost("launch-tips")).toBeNull();
    await expect(blog.publishPost(b.id, author)).rejects.toMatchObject({
      data: { blockers: expect.arrayContaining(["The article is empty."]) },
    });
    await blog.publishPost(a.id, author);
    const live = await pub.getPublishedPost("launch-tips");
    expect(live?.excerpt).toBe("Hello world.");
    expect(live?.authors.map((x) => x.name)).toEqual([`User ${author}`]);
    expect((await pub.listPublishedPosts()).posts.map((p) => p.slug)).toEqual(["launch-tips"]);

    await blog.unpublishPost(a.id);
    expect((await pub.listPublishedPosts()).total).toBe(0);
  });

  it("drafts one recap per closed week with maker text escaped", async () => {
    const lastWeek = addWeeks(thisWeek, -1);
    expect(await blog.draftWeeklyRecap(now)).toEqual({ skipped: "week not closed" });

    const applauder = await makeUser();
    const p = await products.saveProduct(await makeUser(), {
      ...input("recap-a.io", "Evil [x](javascript:alert(1))"),
    });
    await products.ensureWeek(lastWeek);
    await dbmod
      .db()
      .update(dbmod.schema.products)
      .set({ status: "approved", launchWeekKey: lastWeek, approvedAt: new Date() })
      .where(eq(dbmod.schema.products.id, p.id));
    await liveProduct(await makeUser(), "recap-b.io", lastWeek);
    await applaudAt(p.id, applauder, weekBounds(lastWeek).startsAt);
    await rollover.closeEndedWeeks();

    const res = await blog.draftWeeklyRecap(now);
    expect(res).toHaveProperty("drafted");
    expect(await blog.draftWeeklyRecap(now)).toEqual({ skipped: "already drafted" });

    const [post] = await dbmod.db().select().from(dbmod.schema.posts);
    expect(post).toMatchObject({ kind: "recap", weekKey: lastWeek, status: "draft" });
    // The recap lands in the editor's working copy; check it renders the way it would publish.
    const doc = (await blog.getStaffPost(post.id))!.fields.content_json;
    const { renderPostContent } = await import("@/lib/blog/render");
    const { html, toc } = renderPostContent(doc);
    expect(toc.map((t) => t.text)).toEqual(expect.arrayContaining(["Debut of the Week", "Also debuting"]));
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("Evil [x](javascript:alert(1))");
    expect(sent.some((e) => e.subject.startsWith("Recap draft ready"))).toBe(true);
  });

  async function pay(orderUrl: string, cents: number) {
    const orderId = orderUrl.split("/").pop()!;
    fake.verifyResult = { status: "paid", providerRef: `ref-${orderId}`, orderId, amountCents: cents, currency: "USD" };
    return payments.confirmPayment("paystack", `ref-${orderId}`);
  }

  it("books capped featured slots, activates them on payment and serves them", async () => {
    const u = await makeUser();
    const p = await liveProduct(u, "sponsor.io");
    const other = await makeUser();
    const q = await liveProduct(other, "sponsor2.io");
    const week = addWeeks(thisWeek, 1);
    const book = (userId: string, productId: string, extra: Partial<Parameters<typeof ads.bookSlot>[0]> = {}) =>
      ads.bookSlot({
        userId,
        email: `${userId}@x.test`,
        placement: "home_top",
        duration: "week",
        productId,
        categorySlug: null,
        weekKey: week,
        provider: "paystack",
        ...extra,
      });

    await expect(book(other, p.id)).rejects.toThrow("Pick one of your listings");
    await expect(book(u, p.id, { weekKey: addWeeks(thisWeek, 20) })).rejects.toThrow("Pick a week");
    await expect(book(u, p.id, { weekKey: thisWeek })).rejects.toThrow("Pick a week");

    // Top sponsor is one at a time: an unpaid hold blocks the week too.
    const first = await book(u, p.id);
    await expect(book(other, q.id)).rejects.toThrow("sold out");
    expect((await ads.availability("home_top", null)).find((w) => w.key === week)?.remaining).toBe(0);
    // A month booking can't cover a sold-out week.
    await book(u, p.id, { weekKey: addWeeks(week, 2) });
    await expect(book(other, q.id, { weekKey: addWeeks(week, 1), duration: "month" })).rejects.toThrow(
      `${addWeeks(week, 2).replace(/^(\d{4})-W0?(\d+)$/, "Week $2, $1")} is sold out`,
    );

    const order = await pay(first.url, 5900);
    expect(order?.fulfilledAt).toBeInstanceOf(Date);
    const booking = await dbmod
      .db()
      .query.adBookings.findFirst({ where: eq(dbmod.schema.adBookings.id, first.bookingId) });
    expect(booking).toMatchObject({ status: "active", heldUntil: null });
    expect(sent.some((e) => e.to === `${u}@x.test` && e.subject.startsWith("Booked:"))).toBe(true);

    const during = new Date(weekBounds(week).startsAt.getTime() + 3600_000);
    expect(await ads.liveAds("home_top", { now })).toEqual([]);
    const [live] = await ads.liveAds("home_top", { now: during });
    expect(live).toMatchObject({ bookingId: first.bookingId, slug: p.slug, href: `/api/ads/${first.bookingId}/click` });

    await ads.recordImpressions([first.bookingId]);
    expect(await ads.recordClick(first.bookingId, true)).toBe("https://sponsor.io/?ref=debutyard");
    expect(await ads.recordClick(first.bookingId, false)).toBe("https://sponsor.io/?ref=debutyard");
    const counted = await dbmod
      .db()
      .query.adBookings.findFirst({ where: eq(dbmod.schema.adBookings.id, first.bookingId) });
    expect([counted?.impressions, counted?.clicks]).toEqual([1, 1]);

    // A full refund takes the slot down and frees the week.
    await payments.refundOrder(order!.id, "changed plans");
    expect(await ads.liveAds("home_top", { now: during })).toEqual([]);
    expect((await ads.availability("home_top", null)).find((w) => w.key === week)?.remaining).toBe(1);
  });

  it("extends slots under the CPC guarantee, then reports and completes", async () => {
    const u = await makeUser();
    const p = await liveProduct(u, "cpc.io");
    const { bookingId, url } = await ads.bookSlot({
      userId: u,
      email: `${u}@x.test`,
      placement: "leaderboard",
      duration: "week",
      productId: p.id,
      categorySlug: null,
      weekKey: addWeeks(thisWeek, 1),
      provider: "paystack",
    });
    await pay(url, 1500);
    const end = weekBounds(addWeeks(thisWeek, 1)).endsAt;
    const after = new Date(end.getTime() + 60_000);

    // 3 clicks on $15 = $5/click: runs another week free.
    await dbmod
      .db()
      .update(dbmod.schema.adBookings)
      .set({ clicks: 3 })
      .where(eq(dbmod.schema.adBookings.id, bookingId));
    expect(await ads.settleBookings(after)).toEqual({ extended: 1, completed: 0 });
    let b = await dbmod.db().query.adBookings.findFirst({ where: eq(dbmod.schema.adBookings.id, bookingId) });
    expect(b?.endsAt.getTime()).toBe(end.getTime() + 7 * 86_400_000);
    expect(b?.paidEndsAt.getTime()).toBe(end.getTime());
    // Extensions don't use inventory: the next week still has all 3 leaderboard slots.
    expect(
      (await ads.availability("leaderboard", null, now)).find((w) => w.key === addWeeks(thisWeek, 2))?.remaining,
    ).toBe(3);

    // 15 clicks = $1/click: done, with a report.
    await dbmod
      .db()
      .update(dbmod.schema.adBookings)
      .set({ clicks: 15 })
      .where(eq(dbmod.schema.adBookings.id, bookingId));
    const later = new Date(end.getTime() + 8 * 86_400_000);
    expect(await ads.settleBookings(later)).toEqual({ extended: 0, completed: 1 });
    b = await dbmod.db().query.adBookings.findFirst({ where: eq(dbmod.schema.adBookings.id, bookingId) });
    expect(b?.status).toBe("completed");
    expect(sent.some((e) => e.subject === "Your Leaderboard slot results: 15 clicks")).toBe(true);
    expect(await ads.settleBookings(later)).toEqual({ extended: 0, completed: 0 });
  });

  it("puts a booked newsletter sponsor in that week's digest", async () => {
    const u = await makeUser();
    const p = await liveProduct(u, "news-sponsor.io");
    const next = addWeeks(thisWeek, 1);
    const { bookingId, url } = await ads.bookSlot({
      userId: u,
      email: `${u}@x.test`,
      placement: "newsletter",
      duration: "week",
      productId: p.id,
      categorySlug: null,
      weekKey: next,
      provider: "paystack",
    });
    await pay(url, 4900);
    const digest = await newsletter.buildDigest(thisWeek);
    expect(digest.sponsor).toMatchObject({ bookingId, name: p.name });
    expect(digest.sponsor?.url).toBe(`https://debutyard.test/api/ads/${bookingId}/click`);
    expect((await newsletter.buildDigest(addWeeks(thisWeek, -1))).sponsor).toBeNull();
  });

  it("checks launch readiness, flags duplicates, and rate limits per caller", async () => {
    const { checkReadiness, CHECKS_PER_HOUR } = await import("@/lib/readiness/service");
    fakePage.body = `<title>Acme | invoices that chase themselves</title>
      <meta name="description" content="Acme sends polite, automatic reminders so your clients pay on time.">
      <meta property="og:image" content="/og.png"><link rel="icon" href="/i.png">`;
    const report = await checkReadiness("acme.io", { clientKey: "1.2.3.4", source: "web" });
    expect(report).toMatchObject({ url: "https://acme.io/", domain: "acme.io", ready: true });
    expect(report.checks.find((c) => c.id === "badge")?.status).toBe("warn");
    expect(report.suggested?.name).toBe("Acme");
    expect(report.nextWeeks.paid[0].key).toBe(thisWeek);

    await liveProduct(await makeUser(), "listed.io");
    const dup = await checkReadiness("https://listed.io", { clientKey: "1.2.3.4", source: "web" });
    expect(dup.ready).toBe(false);
    expect(dup.checks.find((c) => c.id === "unique")?.status).toBe("fail");

    const down = await checkReadiness("https://down.test", { clientKey: "1.2.3.4", source: "web" });
    expect(down.checks.find((c) => c.id === "reachable")?.status).toBe("fail");

    for (let i = 3; i < CHECKS_PER_HOUR; i++) await checkReadiness("acme.io", { clientKey: "1.2.3.4", source: "web" });
    await expect(checkReadiness("acme.io", { clientKey: "1.2.3.4", source: "web" })).rejects.toThrow("an hour");
    // Other callers aren't affected.
    await checkReadiness("acme.io", { clientKey: "5.6.7.8", source: "web" });
  });

  it("serves the REST API with token auth, and agents can only draft", async () => {
    const tokens = await import("@/lib/api/tokens");
    const u = await makeUser();
    await liveProduct(await makeUser(), "searchable.io", thisWeek);
    const { token, id } = await tokens.createToken(u, "CLI");
    const auth = { Authorization: `Bearer ${token}` };

    const search = await import("@/app/api/v1/products/route");
    const res = await search.GET(new Request("https://debutyard.test/api/v1/products?q=searchable"));
    expect((await res.json()).data.map((p: { slug: string }) => p.slug)).toEqual(["searchable-io"]);

    const submissions = await import("@/app/api/v1/submissions/route");
    const draft = (body: unknown, headers: Record<string, string> = auth) =>
      submissions.POST(
        new Request("https://debutyard.test/api/v1/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        }),
      );
    expect((await draft(input("agent.io"), {})).status).toBe(401);
    expect((await draft(input("agent.io"), { Authorization: "Bearer dy_not-a-real-token-at-all" })).status).toBe(401);
    expect((await draft({ ...input("agent.io"), categories: ["nope"] })).status).toBe(400);
    const ok = await draft(input("agent.io"));
    expect(ok.status).toBe(200);
    const created = (await ok.json()).data;
    expect(created).toMatchObject({ status: "draft", slug: "agent-io" });
    expect(created.nextStep).toContain(`/dashboard/products/${created.id}`);
    const row = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.id, created.id) });
    expect(row).toMatchObject({ createdVia: "api", createdBy: u, status: "draft" });

    const mine = await import("@/app/api/v1/me/products/route");
    const list = await (
      await mine.GET(new Request("https://debutyard.test/api/v1/me/products", { headers: auth }))
    ).json();
    expect(list.data.map((p: { slug: string }) => p.slug)).toEqual(["agent-io"]);

    await tokens.revokeToken(u, id);
    expect((await draft(input("agent2.io"))).status).toBe(401);
  });

  it("speaks MCP: initialize, list tools, call tools", async () => {
    const tokens = await import("@/lib/api/tokens");
    const route = await import("@/app/api/mcp/route");
    const u = await makeUser();
    const { token } = await tokens.createToken(u, "Agent");
    let seq = 0;
    const rpc = async (method: string, params?: unknown, headers: Record<string, string> = {}) => {
      const res = await route.POST(
        new Request("https://debutyard.test/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
        }),
      );
      return res.json();
    };

    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    });
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "debutyard" } });
    const note = await route.POST(
      new Request("https://debutyard.test/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
    );
    expect(note.status).toBe(202);

    const tools = (await rpc("tools/list")).result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      "search_products",
      "get_product",
      "list_categories",
      "list_launch_directories",
      "check_launch_readiness",
      "check_dofollow",
      "submit_product",
      "get_my_launches",
      "get_my_links",
    ]);
    const submitTool = tools.find((t: { name: string }) => t.name === "submit_product");
    expect(submitTool.inputSchema.required).toEqual(
      expect.arrayContaining(["websiteUrl", "name", "tagline", "description", "categories", "pricingModel"]),
    );

    const anon = await rpc("tools/call", { name: "submit_product", arguments: input("mcp.io") });
    expect(anon.result.isError).toBe(true);
    expect(anon.result.content[0].text).toContain("API token");

    const bad = await rpc(
      "tools/call",
      { name: "submit_product", arguments: { name: "x" } },
      { Authorization: `Bearer ${token}` },
    );
    expect(bad.result.isError).toBe(true);

    const made = await rpc(
      "tools/call",
      { name: "submit_product", arguments: input("mcp.io") },
      { Authorization: `Bearer ${token}` },
    );
    expect(made.result.structuredContent).toMatchObject({ slug: "mcp-io", status: "draft" });
    const row = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.slug, "mcp-io") });
    expect(row?.createdVia).toBe("mcp");

    const mine = await rpc(
      "tools/call",
      { name: "get_my_launches", arguments: {} },
      { Authorization: `Bearer ${token}` },
    );
    expect(mine.result.structuredContent.items).toHaveLength(1);
    expect((await rpc("tools/call", { name: "nope" })).error.code).toBe(-32602);
    expect((await rpc("resources/list")).error.code).toBe(-32601);
    expect(route.GET().status).toBe(405);
  });
});
