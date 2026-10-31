/**
 * Directory database, DIY tracker and the done-for-you submission service
 * against a real Postgres. Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { addWeeks, weekKeyFor } from "@/lib/weeks";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (e: { to: string; subject: string; text: string }) => {
    sent.push({ to: e.to, subject: e.subject, text: e.text });
  }),
  sendBatch: vi.fn(async (emails: unknown[]) => emails.length),
}));

/** Listing pages the link checker "fetches", by URL. */
const pages = new Map<string, { status: number; body: string }>();
vi.mock("@/lib/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net")>();
  return {
    ...actual,
    safeFetchText: vi.fn(async (url: string) => {
      const page = pages.get(url);
      if (!page) throw new Error("connect ECONNREFUSED");
      return { url, status: page.status, contentType: "text/html", body: page.body };
    }),
  };
});

class FakeProvider implements PaymentProvider {
  readonly id = "paystack" as const;
  verifyResult: VerifiedPayment | null = null;
  async createCheckout(req: { orderId: string }) {
    return { url: `https://pay.test/${req.orderId}`, providerRef: `ref-${req.orderId}` };
  }
  async verifyPayment(ref: string): Promise<VerifiedPayment> {
    return this.verifyResult ?? { status: "pending", providerRef: ref };
  }
  async refund() {
    return { providerRef: "rf" };
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

describe.skipIf(!TEST_DB)("directories and submissions (Postgres)", () => {
  const fake = new FakeProvider();
  let dbmod: typeof import("@/db");
  let directories: typeof import("@/lib/directories/service");
  let tracker: typeof import("@/lib/directories/tracker");
  let subs: typeof import("@/lib/submissions/service");
  let payments: typeof import("@/lib/payments/service");
  let products: typeof import("@/lib/products/service");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", fake);
    dbmod = await import("@/db");
    directories = await import("@/lib/directories/service");
    tracker = await import("@/lib/directories/tracker");
    subs = await import("@/lib/submissions/service");
    payments = await import("@/lib/payments/service");
    products = await import("@/lib/products/service");
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    sent.length = 0;
    pages.clear();
    await dbmod
      .db()
      .execute(
        sql`truncate products, orders, payment_events, refunds, submission_orders, submissions, link_checks, "user" cascade`,
      );
  });

  let seq = 0;
  async function makeUser() {
    const id = `d${++seq}`;
    await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values({ id, name: `User ${id}`, email: `${id}@x.test` });
    return id;
  }
  async function makeProduct(userId: string, domain: string) {
    return products.saveProduct(userId, {
      websiteUrl: `https://${domain}/`,
      name: domain,
      tagline: `${domain} does useful things`,
      description: "A".repeat(60),
      categories: ["ai"],
      pricingModel: "freemium",
    });
  }
  async function buy(sku: string, userId: string | null, metadata?: Record<string, unknown>) {
    const { orderId } = await payments.startCheckout({
      skuId: sku,
      provider: "paystack",
      email: "buyer@x.test",
      userId,
      metadata,
    });
    const o = await dbmod.db().query.orders.findFirst({ where: eq(dbmod.schema.orders.id, orderId) });
    fake.verifyResult = {
      status: "paid",
      providerRef: `ref-${orderId}`,
      orderId,
      amountCents: o!.amountCents,
      currency: "USD",
    };
    await payments.confirmPayment("paystack", `ref-${orderId}`);
    return orderId;
  }
  const kit = {
    productName: "Acme",
    websiteUrl: "https://acme.io",
    tagline: "Invoices that chase themselves",
    shortDescription: "Acme sends polite reminders so clients pay on time, every time, without awkward emails.",
    longDescription: "Acme connects to your invoicing tool and follows up on late invoices for you. ".repeat(3),
    categories: ["ai", "finance"],
    logoUrl: "",
    founderName: "Ada",
    contactEmail: "ada@acme.io",
    clientNotes: "",
    badgePreference: "none" as const,
    allowAccounts: true as const,
  };

  it("seeds the directory list and filters it", async () => {
    const all = await directories.listDirectories();
    expect(all.length).toBeGreaterThanOrEqual(100);
    const ai = await directories.listDirectories({ niche: "ai", noBadge: true });
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.every((d) => d.niche === "ai" && !d.badgeRequired)).toBe(true);
    const ph = await directories.getDirectory("product-hunt");
    expect(ph).toMatchObject({ guided: true, linkTypeClaimed: "nofollow" });
  });

  it("summarises the catalog for the submission-service page", async () => {
    const usable = (await directories.listDirectories()).filter((d) => !d.guided);
    const stats = await directories.catalogStats();
    expect(stats.active).toBe(usable.length);
    expect(stats.dr50).toBe(usable.filter((d) => (d.dr ?? 0) >= 50).length);
    const linkType = (d: (typeof usable)[number]) =>
      d.linkTypeObserved === "unknown" ? d.linkTypeClaimed : d.linkTypeObserved;
    expect(stats.dofollow).toBe(usable.filter((d) => linkType(d) === "dofollow").length);
    // The seed may leave DR unmeasured; then there's no median to show.
    const drs = usable.flatMap((d) => (d.dr === null ? [] : [d.dr]));
    if (drs.length === 0) expect(stats.medianDr).toBeNull();
    else {
      expect(stats.medianDr).toBeGreaterThanOrEqual(Math.min(...drs));
      expect(stats.medianDr).toBeLessThanOrEqual(Math.max(...drs));
    }
  });

  it("imports CSV: updates by slug or host, creates new rows, reports bad rows", async () => {
    const result = await directories.importDirectoriesCsv(
      [
        "name,url,slug,dr,niche,badge_required,notes",
        "Uneed,https://www.uneed.best,uneed,72,,,",
        ',https://www.saashub.com/,,81,devtools,no,"Free, but reviewed"',
        "New Board,https://newboard.example,,40,indie,yes,",
        "Broken,not-a-url,,,,,",
      ].join("\n"),
    );
    expect(result).toMatchObject({ created: 1, updated: 2 });
    expect(result.errors).toHaveLength(1);
    expect((await directories.getDirectory("uneed"))?.dr).toBe(72);
    expect(await directories.getDirectory("saashub")).toMatchObject({ dr: 81, submissionNotes: "Free, but reviewed" });
    expect(await directories.getDirectory("new-board")).toMatchObject({ badgeRequired: true, niche: "indie" });
  });

  it("tracks DIY submissions and verifies the live link automatically", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const p = await makeProduct(u, "maker.io");
    const dir = (await directories.getDirectory("saashub"))!;

    await expect(
      tracker.updateTracker(other, { productId: p.id, directoryId: dir.id, status: "submitted" }),
    ).rejects.toThrow("isn't one of your products");
    await expect(tracker.updateTracker(u, { productId: p.id, directoryId: dir.id, status: "live" })).rejects.toThrow(
      "Paste the URL",
    );

    const submitted = await tracker.updateTracker(u, { productId: p.id, directoryId: dir.id, status: "submitted" });
    expect(submitted.submittedAt).toBeInstanceOf(Date);

    pages.set("https://saashub.com/maker-io", {
      status: 200,
      body: `<a rel="nofollow" href="https://maker.io">x</a><a href="https://www.maker.io/?ref=saashub">Maker.io</a>`,
    });
    const live = await tracker.updateTracker(u, {
      productId: p.id,
      directoryId: dir.id,
      status: "live",
      liveUrl: "https://saashub.com/maker-io",
    });
    expect(live).toMatchObject({
      status: "live",
      linkVerdict: "dofollow",
      linkAnchor: "Maker.io",
      linkHttpStatus: 200,
    });

    // The directory changes the link: a re-check notices.
    pages.set("https://saashub.com/maker-io", { status: 200, body: `<a rel="ugc" href="https://maker.io">Maker</a>` });
    expect((await tracker.recheckTracker(u, live.id))?.linkVerdict).toBe("nofollow");
    pages.delete("https://saashub.com/maker-io");
    expect((await tracker.recheckTracker(u, live.id))?.linkVerdict).toBe("unreachable");
    const checks = await dbmod
      .db()
      .select()
      .from(dbmod.schema.linkChecks)
      .where(eq(dbmod.schema.linkChecks.submissionId, live.id));
    expect(checks.map((c) => c.verdict).sort()).toEqual(["dofollow", "nofollow", "unreachable"]);

    const rows = await tracker.trackerRows(u, p.id);
    expect(tracker.summarize(rows)).toMatchObject({ live: 1, dofollow: 0 });
  });

  it("runs a submission order: payment, intake, targets, ops, replacement, delivery", async () => {
    await buy("submission_starter", null);
    const order = (await dbmod.db().select().from(dbmod.schema.submissionOrders))[0];
    expect(order).toMatchObject({
      status: "awaiting_intake",
      package: "starter",
      targetCount: 40,
      email: "buyer@x.test",
    });
    const intakeMail = sent.find((e) => e.to === "buyer@x.test");
    expect(intakeMail?.text).toContain(`/orders/${order.intakeToken}`);

    await expect(subs.submitIntake(order.intakeToken, { ...kit, tagline: "short" })).rejects.toThrow();
    const queued = await subs.submitIntake(order.intakeToken, kit);
    expect(queued).toMatchObject({ status: "queued", productName: "Acme" });
    expect(queued.dueAt!.getTime()).toBeGreaterThan(Date.now() + 8 * 86_400_000);
    await expect(subs.submitIntake(order.intakeToken, kit)).rejects.toThrow("already have");

    let rows = await subs.orderRows(order.id);
    expect(rows).toHaveLength(40);
    // No guided, badge-gated or nofollow directories; AI-niche directories first.
    expect(rows.some((r) => r.d.guided || r.d.badgeRequired || r.d.linkTypeClaimed === "nofollow")).toBe(false);
    expect(rows.filter((r) => r.d.niche === "ai").length).toBeGreaterThan(5);

    // Ops: bulk submit, one goes live with a verified link, one is rejected and replaced.
    const [a, b, ...rest] = rows;
    expect(
      await subs.bulkUpdate(
        order.id,
        rest.slice(0, 5).map((r) => r.s.id),
        "submitted",
      ),
    ).toBe(5);
    expect(
      (await dbmod.db().query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.id, order.id) }))
        ?.status,
    ).toBe("in_progress");
    pages.set("https://dir.example/acme", { status: 200, body: `<a href="https://acme.io">Acme</a>` });
    const live = await subs.updateOrderSubmission(a.s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    expect(live.row).toMatchObject({ status: "live", linkVerdict: "dofollow" });
    const rejected = await subs.updateOrderSubmission(b.s.id, { status: "rejected", notes: "Editorial" });
    expect(rejected.replacement).not.toBeNull();
    expect(rejected.row.status).toBe("replaced");
    rows = await subs.orderRows(order.id);
    const summary = subs.summarizeOrder(
      order,
      rows.map((r) => r.s),
    );
    expect(summary).toMatchObject({ scheduled: 40, live: 1, dofollow: 1, inReview: 5 });

    await subs.updateOrderSubmission(rest[6].s.id, {
      status: "needs_action",
      actionNeeded: "Confirm your email with Foo",
    });
    sent.length = 0;
    expect(await subs.sendOrderDigests()).toEqual({ sent: 1 });
    expect(sent[0]).toMatchObject({ to: "ada@acme.io" });
    expect(sent[0].text).toContain("Confirm your email with Foo");
    expect(await subs.sendOrderDigests()).toEqual({ sent: 0 });

    const csv = subs.ordersCsv(rows);
    expect(csv.split("\n")).toHaveLength(41);
    expect(csv).toContain("https://dir.example/acme");

    await subs.deliverOrder(order.id);
    expect(sent.some((e) => e.subject.startsWith("Delivered: 1 live listings for Acme"))).toBe(true);
    await expect(subs.deliverOrder(order.id)).rejects.toThrow("Only active orders");

    await directories.refreshDirectoryStats();
    expect(
      await dbmod.db().query.directories.findFirst({ where: eq(dbmod.schema.directories.id, a.d.id) }),
    ).toMatchObject({
      liveCount: 1,
      linkTypeObserved: "dofollow",
    });
    expect(
      (await dbmod.db().query.directories.findFirst({ where: eq(dbmod.schema.directories.id, b.d.id) }))
        ?.acceptanceRate,
    ).toBe(0);
  });

  it("boosts an existing listing, bundles Starter with Spotlight, and refunds cancel orders", async () => {
    const u = await makeUser();
    const p = await makeProduct(u, "boost.io");
    await buy("submission_growth", u, { productId: p.id });
    const boost = await dbmod
      .db()
      .query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.productId, p.id) });
    expect(boost).toMatchObject({
      package: "growth",
      targetCount: 100,
      productName: "boost.io",
      websiteUrl: "https://boost.io/",
    });
    expect(boost?.categories).toEqual(["ai"]);
    expect((await subs.ordersForUser(u, `${u}@x.test`)).map((r) => r.o.id)).toEqual([boost!.id]);

    const q = await makeProduct(u, "spot.io");
    const before = sent.length;
    const spotlightOrder = await buy("launch_spotlight", u, {
      productId: q.id,
      weekKey: addWeeks(weekKeyFor(new Date()), 2),
    });
    const bundled = await dbmod
      .db()
      .query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.orderId, spotlightOrder) });
    expect(bundled).toMatchObject({ package: "starter", productName: "spot.io" });
    // One email each for the maker and the team, both carrying the bundled package.
    const mails = sent.slice(before);
    const staff = mails.filter((e) => e.to === "ops@debutyard.test");
    const maker = mails.filter((e) => e.to !== "ops@debutyard.test");
    expect(maker).toHaveLength(1);
    expect(maker[0].text).toContain(`/orders/${bundled!.intakeToken}`);
    expect(staff).toHaveLength(1);
    expect(staff[0].text).toContain(`/admin/submissions/${bundled!.id}`);

    await payments.refundOrder(spotlightOrder, "rejected");
    expect(
      (await dbmod.db().query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.id, bundled!.id) }))
        ?.status,
    ).toBe("cancelled");
    expect(await subs.orderByIntakeToken(bundled!.intakeToken)).toMatchObject({ status: "cancelled" });
  });
});
