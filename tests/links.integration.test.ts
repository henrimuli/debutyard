/**
 * Link Monitor against a real Postgres: tracked links from the tracker and
 * orders, the schedule, change alerts, plan limits and the end of included
 * monitoring. Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
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

const follow = (domain: string) => ({ status: 200, body: `<a href="https://${domain}/">${domain}</a>` });
const nofollow = (domain: string) => ({ status: 200, body: `<a rel="nofollow" href="https://${domain}/">x</a>` });

describe.skipIf(!TEST_DB)("Link Monitor (Postgres)", () => {
  const fake = new FakeProvider();
  let dbmod: typeof import("@/db");
  let directories: typeof import("@/lib/directories/service");
  let tracker: typeof import("@/lib/directories/tracker");
  let subs: typeof import("@/lib/submissions/service");
  let payments: typeof import("@/lib/payments/service");
  let products: typeof import("@/lib/products/service");
  let links: typeof import("@/lib/links/service");

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
    links = await import("@/lib/links/service");
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
        sql`truncate products, orders, payment_events, submission_orders, submissions, link_checks, tracked_links, subscriptions, "user" cascade`,
      );
  });

  let seq = 0;
  async function makeUser() {
    const id = `l${++seq}`;
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
  async function subscribe(userId: string, sku: string, periodEnd: Date, status: "active" | "non_renewing" = "active") {
    await dbmod
      .db()
      .insert(dbmod.schema.subscriptions)
      .values({
        userId,
        sku,
        provider: "paystack",
        providerSubscriptionId: `SUB-${userId}-${sku}`,
        providerPlanId: "PLN",
        status,
        currentPeriodEnd: periodEnd,
      });
  }
  async function buyOrder(userId: string | null) {
    const { orderId } = await payments.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "buyer@x.test",
      userId,
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
    const order = (await dbmod
      .db()
      .query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.orderId, orderId) }))!;
    await subs.submitIntake(order.intakeToken, {
      productName: "Acme",
      websiteUrl: "https://acme.io",
      tagline: "Invoices that chase themselves",
      shortDescription: "Acme sends polite reminders so clients pay on time, every time, without awkward emails.",
      longDescription: "Acme connects to your invoicing tool and follows up on late invoices for you. ".repeat(3),
      categories: ["ai"],
      logoUrl: "",
      founderName: "Ada",
      contactEmail: "ada@acme.io",
      clientNotes: "",
      badgePreference: "none",
      allowAccounts: true,
    });
    return { order, rows: await subs.orderRows(order.id) };
  }
  const linkFor = (submissionId: string) =>
    dbmod.db().query.trackedLinks.findFirst({ where: eq(dbmod.schema.trackedLinks.submissionId, submissionId) });

  it("tracks tracker links as they go live and drops them when they don't", async () => {
    const u = await makeUser();
    const p = await makeProduct(u, "maker.io");
    const dir = (await directories.getDirectory("saashub"))!;
    pages.set("https://saashub.com/maker", follow("maker.io"));
    const row = await tracker.updateTracker(u, {
      productId: p.id,
      directoryId: dir.id,
      status: "live",
      liveUrl: "https://saashub.com/maker",
    });
    expect(await linkFor(row.id)).toMatchObject({
      ownerUserId: u,
      source: "tracker",
      targetDomain: "maker.io",
      lastVerdict: "dofollow",
      active: true,
    });
    expect((await links.linkUsage(u)).monitored).toBe(1);

    await tracker.updateTracker(u, { productId: p.id, directoryId: dir.id, status: "rejected" });
    expect((await linkFor(row.id))?.active).toBe(false);
    await tracker.updateTracker(u, {
      productId: p.id,
      directoryId: dir.id,
      status: "live",
      liveUrl: "https://saashub.com/maker",
    });
    expect((await linkFor(row.id))?.active).toBe(true);
  });

  it("tracks order links for the buyer, or their contact email without an account", async () => {
    const { rows } = await buyOrder(null);
    pages.set("https://dir.example/acme", follow("acme.io"));
    await subs.updateOrderSubmission(rows[0].s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    expect(await linkFor(rows[0].s.id)).toMatchObject({
      ownerUserId: null,
      alertEmail: "ada@acme.io",
      source: "order",
      targetDomain: "acme.io",
      lastVerdict: "dofollow",
    });

    const u = await makeUser();
    const mine = await buyOrder(u);
    await subs.updateOrderSubmission(mine.rows[0].s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    expect(await linkFor(mine.rows[0].s.id)).toMatchObject({ ownerUserId: u, source: "order" });
    expect((await links.linksForUser(u)).map((r) => r.directory)).toEqual([mine.rows[0].d.name]);
  });

  it("checks daily for two weeks, then weekly", async () => {
    const u = await makeUser();
    pages.set("https://a.example/x", follow("maker.io"));
    const t0 = new Date();
    const link = await links.addManualLink(u, { url: "https://a.example/x", domain: "maker.io" }, t0);
    expect(link.lastVerdict).toBe("dofollow");
    expect(link.nextCheckAt.getTime() - t0.getTime()).toBe(DAY);

    // Not due yet: nothing checked.
    expect(await links.monitorLinks(new Date(t0.getTime() + DAY / 2))).toMatchObject({ checked: 0 });
    const d1 = new Date(t0.getTime() + DAY);
    expect(await links.monitorLinks(d1)).toMatchObject({ checked: 1, alerts: 0 });
    let row = (await dbmod.db().query.trackedLinks.findFirst({ where: eq(dbmod.schema.trackedLinks.id, link.id) }))!;
    expect(row.nextCheckAt.getTime()).toBe(d1.getTime() + DAY);

    const d15 = new Date(t0.getTime() + 15 * DAY);
    expect(await links.monitorLinks(d15)).toMatchObject({ checked: 1 });
    row = (await dbmod.db().query.trackedLinks.findFirst({ where: eq(dbmod.schema.trackedLinks.id, link.id) }))!;
    expect(row.nextCheckAt.getTime()).toBe(d15.getTime() + 7 * DAY);
    const history = await links.linkHistory(u, link.id);
    expect(history).toHaveLength(3);
  });

  it("emails one summary per owner, marks dead after two failures, and reports recoveries", async () => {
    const u = await makeUser();
    const p = await makeProduct(u, "maker.io");
    const [d1, d2, d3] = (await directories.listDirectories()).filter((d) => !d.guided);
    const live = async (dirId: string, url: string) => {
      pages.set(url, follow("maker.io"));
      return tracker.updateTracker(u, { productId: p.id, directoryId: dirId, status: "live", liveUrl: url });
    };
    const a = await live(d1.id, "https://one.example/m");
    const b = await live(d2.id, "https://two.example/m");
    const c = await live(d3.id, "https://three.example/m");

    // Two flip to nofollow, one disappears: one email about the flips, no alarm yet about the blip.
    pages.set("https://one.example/m", nofollow("maker.io"));
    pages.set("https://two.example/m", nofollow("maker.io"));
    pages.delete("https://three.example/m");
    const day1 = new Date(Date.now() + DAY + 60_000);
    expect(await links.monitorLinks(day1)).toMatchObject({ checked: 3, alerts: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: `${u}@x.test`, subject: "Link Monitor: 2 links flipped to nofollow" });
    expect(sent[0].text).toContain(d1.name);
    expect(sent[0].text).toContain("/dashboard/links");
    const sa = await dbmod.db().query.submissions.findFirst({ where: eq(dbmod.schema.submissions.id, a.id) });
    expect(sa).toMatchObject({ linkVerdict: "nofollow", status: "live" });

    // Second failure in a row: dead, and the owner hears about it once.
    sent.length = 0;
    const day2 = new Date(day1.getTime() + DAY + 60_000);
    expect(await links.monitorLinks(day2)).toMatchObject({ alerts: 1 });
    expect(sent[0].subject).toBe("Link Monitor: 1 listing removed or unreachable");
    expect(
      await dbmod.db().query.submissions.findFirst({ where: eq(dbmod.schema.submissions.id, c.id) }),
    ).toMatchObject({ status: "dead", linkVerdict: "unreachable" });

    sent.length = 0;
    const day3 = new Date(day2.getTime() + DAY + 60_000);
    expect(await links.monitorLinks(day3)).toMatchObject({ alerts: 0 });

    // The listing comes back and one link is followed again: good news.
    pages.set("https://three.example/m", follow("maker.io"));
    pages.set("https://two.example/m", follow("maker.io"));
    const day4 = new Date(day3.getTime() + DAY + 60_000);
    expect(await links.monitorLinks(day4)).toMatchObject({ alerts: 1 });
    expect(sent[0].subject).toBe("Link Monitor: 2 links recovered");
    expect(
      await dbmod.db().query.submissions.findFirst({ where: eq(dbmod.schema.submissions.id, c.id) }),
    ).toMatchObject({ status: "live", linkVerdict: "dofollow" });
    expect((await linkFor(b.id))?.lastVerdict).toBe("dofollow");
  });

  it("emails order alerts to the contact address with the private order link", async () => {
    const { order, rows } = await buyOrder(null);
    pages.set("https://dir.example/acme", follow("acme.io"));
    await subs.updateOrderSubmission(rows[0].s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    pages.set("https://dir.example/acme", nofollow("acme.io"));
    await links.monitorLinks(new Date(Date.now() + DAY + 60_000));
    expect(sent.at(-1)).toMatchObject({ to: "ada@acme.io", subject: "Link Monitor: 1 link flipped to nofollow" });
    expect(sent.at(-1)!.text).toContain(`/orders/${order.intakeToken}`);
  });

  it("limits added links to the free allowance or the plan, and pauses links over a lapsed plan", async () => {
    const u = await makeUser();
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      await links.addManualLink(u, { url: `https://dir${i}.example/p`, domain: "maker.io" }, now);
    }
    await expect(links.addManualLink(u, { url: "https://dir10.example/p", domain: "maker.io" }, now)).rejects.toThrow(
      "10 of 10",
    );
    await expect(links.addManualLink(u, { url: "https://dir0.example/p", domain: "maker.io" })).rejects.toThrow();

    // An expired plan doesn't count; an active one (or one cancelled but still paid up) does.
    await subscribe(u, "sub_maker_pro_monthly", new Date(now.getTime() - DAY));
    expect((await links.linkUsage(u, now)).limit).toBe(10);
    await dbmod.db().delete(dbmod.schema.subscriptions);
    await subscribe(u, "sub_maker_pro_monthly", new Date(now.getTime() + 30 * DAY), "non_renewing");
    expect(await links.linkUsage(u, now)).toMatchObject({ used: 10, limit: 100 });
    for (let i = 10; i < 15; i++) {
      await links.addManualLink(u, { url: `https://dir${i}.example/p`, domain: "maker.io" }, now);
    }
    expect((await links.linkUsage(u, now)).used).toBe(15);

    // The plan lapses: the 5 newest links are skipped, the first 10 still checked.
    const later = new Date(now.getTime() + 31 * DAY);
    expect((await links.pausedLinkIds(u, later)).size).toBe(5);
    expect(await links.monitorLinks(later)).toMatchObject({ checked: 10, skipped: 5 });

    // Tracker links never count against the allowance.
    const p = await makeProduct(u, "maker.io");
    const dir = (await directories.getDirectory("saashub"))!;
    await tracker.updateTracker(u, {
      productId: p.id,
      directoryId: dir.id,
      status: "live",
      liveUrl: "https://s.example/x",
    });
    expect((await links.linkUsage(u, now)).used).toBe(15);

    // Only added links can be removed here.
    const own = await links.linksForUser(u);
    const fromTracker = own.find((r) => r.link.source === "tracker")!;
    await expect(links.removeLink(u, fromTracker.link.id)).rejects.toThrow("tracker");
    await links.removeLink(u, own.find((r) => r.link.source === "manual")!.link.id);
    expect((await links.linkUsage(u, now)).used).toBe(14);
  });

  it("ends included monitoring: upsell and stop, or keep the links on the buyer's plan", async () => {
    pages.set("https://dir.example/acme", follow("acme.io"));
    const delivered = new Date();
    const { order, rows } = await buyOrder(null);
    await subs.updateOrderSubmission(rows[0].s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    await subs.deliverOrder(order.id, delivered);
    const after = (await dbmod
      .db()
      .query.submissionOrders.findFirst({ where: eq(dbmod.schema.submissionOrders.id, order.id) }))!;
    // Starter includes 3 months.
    expect(after.monitorUntil).toEqual(links.monitorEnd(delivered, 3));
    expect(after.monitorUntil!.getTime() - delivered.getTime()).toBeGreaterThan(88 * DAY);
    expect(sent.some((e) => e.text.includes("Link Monitor is included for 3 months"))).toBe(true);

    sent.length = 0;
    const end = new Date(after.monitorUntil!.getTime() + 60_000);
    expect(await links.monitorLinks(end)).toMatchObject({ stopped: 1, kept: 0, checked: 0 });
    expect(sent[0]).toMatchObject({ to: "ada@acme.io", subject: "Link Monitor for Acme has ended" });
    expect(sent[0].text).toContain("/dashboard/links");
    expect((await linkFor(rows[0].s.id))?.active).toBe(false);
    // Handled once, and ops re-verifying the row doesn't quietly restart it.
    expect(await links.monitorLinks(end)).toMatchObject({ stopped: 0 });
    await links.trackSubmission(rows[0].s.id);
    expect((await linkFor(rows[0].s.id))?.active).toBe(false);

    // A buyer with a Link Monitor plan keeps monitoring; the links now count toward it.
    const u = await makeUser();
    await subscribe(u, "sub_maker_pro_monthly", new Date(Date.now() + 365 * DAY));
    const mine = await buyOrder(u);
    await subs.updateOrderSubmission(mine.rows[0].s.id, { status: "live", liveUrl: "https://dir.example/acme" });
    await subs.deliverOrder(mine.order.id, delivered);
    sent.length = 0;
    expect(await links.monitorLinks(end)).toMatchObject({ kept: 1, stopped: 0 });
    expect(await linkFor(mine.rows[0].s.id)).toMatchObject({ active: true, source: "manual" });
    expect(sent[0].subject).toContain("continues on your plan");
    expect((await links.linkUsage(u)).used).toBe(1);
    expect(
      await dbmod
        .db()
        .select()
        .from(dbmod.schema.trackedLinks)
        .where(and(eq(dbmod.schema.trackedLinks.ownerUserId, u), eq(dbmod.schema.trackedLinks.active, true))),
    ).toHaveLength(1);
  });

  it("serves the user's links over the API", async () => {
    const u = await makeUser();
    pages.set("https://a.example/x", follow("maker.io"));
    await links.addManualLink(u, { url: "https://a.example/x", domain: "https://www.maker.io/" });
    const { myLinks } = await import("@/lib/api/operations");
    const res = await myLinks({ id: u, email: `${u}@x.test`, name: "U" } as never);
    expect(res.usage).toMatchObject({ manualLinks: 1, limit: 10, monitored: 1 });
    expect(res.links[0]).toMatchObject({ url: "https://a.example/x", target: "maker.io", verdict: "dofollow" });
    await expect(myLinks(null)).rejects.toThrow("API token");
    expect(links.linksCsv(await links.linksForUser(u)).split("\n")).toHaveLength(2);
  });
});
