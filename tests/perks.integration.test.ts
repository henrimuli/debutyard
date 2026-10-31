/**
 * Paid debut perks against a real Postgres: tasks created at payment (once),
 * newsletter mentions in the digest and marked done when it's sent, and launch
 * posts drafted from the listing and done when published.
 * Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { addWeeks, weekBounds, weekKeyFor } from "@/lib/weeks";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

const sent: Array<{ to: string; subject: string; html?: string; text?: string }> = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (email: { to: string; subject: string; text: string }) => {
    sent.push({ to: email.to, subject: email.subject, text: email.text });
  }),
  sendBatch: vi.fn(async (emails: Array<{ to: string; subject: string; html: string }>) => {
    for (const e of emails) sent.push({ to: e.to, subject: e.subject, html: e.html });
    return emails.length;
  }),
}));

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

describe.skipIf(!TEST_DB)("paid debut perks (Postgres)", () => {
  const fake = new FakeProvider();
  let dbmod: typeof import("@/db");
  let products: typeof import("@/lib/products/service");
  let payments: typeof import("@/lib/payments/service");
  let perks: typeof import("@/lib/perks/service");
  let newsletter: typeof import("@/lib/newsletter/service");
  let render: typeof import("@/lib/newsletter/render");
  let blog: typeof import("@/lib/blog/service");

  const now = new Date();
  const thisWeek = weekKeyFor(now);
  const lastWeek = addWeeks(thisWeek, -1);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", fake);
    dbmod = await import("@/db");
    products = await import("@/lib/products/service");
    payments = await import("@/lib/payments/service");
    perks = await import("@/lib/perks/service");
    newsletter = await import("@/lib/newsletter/service");
    render = await import("@/lib/newsletter/render");
    blog = await import("@/lib/blog/service");
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  beforeEach(async () => {
    sent.length = 0;
    fake.verifyResult = null;
    await dbmod.db().execute(
      sql`truncate perk_tasks, products, launch_weeks, orders, payment_events, newsletter_subscribers,
          newsletter_issues, posts, "user" cascade`,
    );
  });

  let seq = 0;
  async function makeUser() {
    const id = `u${++seq}`;
    await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values({ id, name: `Maker ${id}`, email: `${id}@x.test` });
    return id;
  }

  const input = (domain: string) => ({
    websiteUrl: `https://${domain}/`,
    name: domain,
    tagline: `${domain} does useful things`,
    description: `${"First paragraph. ".repeat(4)}\n\nSecond paragraph about ${domain}.`,
    categories: ["productivity"],
    pricingModel: "freemium" as const,
    screenshots: [`https://${domain}/shot.png`],
  });

  async function listing(domain: string, live?: string) {
    const p = await products.saveProduct(await makeUser(), input(domain));
    if (!live) return p;
    await products.ensureWeek(live);
    const [row] = await dbmod
      .db()
      .update(dbmod.schema.products)
      .set({ status: "approved", launchWeekKey: live, approvedAt: new Date() })
      .where(eq(dbmod.schema.products.id, p.id))
      .returning();
    return row;
  }

  /** A paid launch order, without going through checkout. */
  async function paidOrder(productId: string, sku: string, paidAt = now) {
    const [order] = await dbmod
      .db()
      .insert(dbmod.schema.orders)
      .values({
        email: "buyer@x.test",
        kind: "launch",
        sku,
        listAmountCents: 100,
        amountCents: 100,
        provider: "paystack",
        status: "paid",
        paidAt,
        metadata: { productId },
      })
      .returning();
    return order;
  }

  const tasksFor = (productId: string) =>
    dbmod.db().query.perkTasks.findMany({
      where: eq(dbmod.schema.perkTasks.productId, productId),
      orderBy: (t, { asc }) => asc(t.kind),
    });

  it("creates the perks when a Premium debut is paid, once", async () => {
    const p = await listing("premium.io");
    const wanted = addWeeks(thisWeek, 2);
    const { orderId } = await payments.startCheckout({
      skuId: "launch_premium",
      provider: "paystack",
      email: "buyer@x.test",
      metadata: { productId: p.id, weekKey: wanted },
    });
    const order = await dbmod.db().query.orders.findFirst({ where: eq(dbmod.schema.orders.id, orderId) });
    fake.verifyResult = {
      status: "paid",
      providerRef: `ref-${orderId}`,
      orderId,
      amountCents: order!.amountCents,
      currency: "USD",
    };
    await payments.confirmPayment("paystack", `ref-${orderId}`);
    // The return page and a redelivered webhook both confirm again.
    await payments.confirmPayment("paystack", `ref-${orderId}`);

    const tasks = await tasksFor(p.id);
    expect(tasks.map((t) => [t.kind, t.status, t.weekKey])).toEqual([
      // The issue whose "Debuting now" week is the launch week.
      ["newsletter", "suggested", addWeeks(wanted, -1)],
      ["launch_post", "suggested", wanted],
    ]);
    expect(tasks[1].dueAt).toEqual(new Date(weekBounds(wanted).endsAt.getTime() - 1));

    // Calling it again for the same order doesn't duplicate anything.
    const paid = await dbmod.db().query.orders.findFirst({ where: eq(dbmod.schema.orders.id, orderId) });
    const product = await dbmod.db().query.products.findFirst({ where: eq(dbmod.schema.products.id, p.id) });
    expect(await perks.createPerkTasks(paid!, product!, "premium")).toHaveLength(2);
    expect(await tasksFor(p.id)).toHaveLength(2);

    const staff = sent.filter((e) => e.subject.startsWith("Needs attention"));
    expect(staff.map((e) => e.subject)).toEqual([`Needs attention: premium.io (Premium Debut)`]);
    expect(staff[0].text).toContain("/admin/newsletter");
    expect(staff[0].text).toContain("/admin/blog");
    expect(await perks.openPerkCounts()).toEqual({ newsletter: 1, blog: 1 });
  });

  it("gives Spotlight the next issue's top slot and drops an open mention", async () => {
    const p = await listing("spot.io", thisWeek);
    await perks.createPerkTasks(await paidOrder(p.id, "launch_pro"), p, "pro");
    const paidAt = new Date(now.getTime() - 3600_000);
    await perks.createPerkTasks(await paidOrder(p.id, "launch_spotlight", paidAt), p, "spotlight");

    const tasks = await tasksFor(p.id);
    expect(tasks.map((t) => [t.kind, t.status])).toEqual([
      ["newsletter", "skipped"],
      ["newsletter_top", "suggested"],
      ["launch_post", "suggested"],
    ]);
    // No issue has gone out, so last week's (sent this Monday) is still the next one.
    expect(tasks[1].weekKey).toBe(lastWeek);
    expect(tasks[2].dueAt).toEqual(new Date(paidAt.getTime() + 7 * 24 * 3600_000));
  });

  it("puts mentions in the digest, unreviewed or not, and marks them done when it's sent", async () => {
    await products.ensureWeek(lastWeek);
    await dbmod
      .db()
      .update(dbmod.schema.launchWeeks)
      .set({ closedAt: new Date() })
      .where(eq(dbmod.schema.launchWeeks.key, lastWeek));
    await dbmod
      .db()
      .insert(dbmod.schema.newsletterSubscribers)
      .values({ email: "reader@x.test", token: "tok", status: "active" });

    const pro = await listing("pro.io", thisWeek);
    const spot = await listing("top.io", thisWeek);
    const waiting = await listing("waiting.io"); // not approved yet
    const later = await listing("later.io", addWeeks(thisWeek, 2));
    const [proTask] = await perks.createPerkTasks(await paidOrder(pro.id, "launch_pro"), pro, "pro");
    await perks.createPerkTasks(await paidOrder(spot.id, "launch_spotlight"), spot, "spotlight");
    await perks.createPerkTasks(await paidOrder(waiting.id, "launch_pro"), waiting, "pro");
    await perks.createPerkTasks(await paidOrder(later.id, "launch_pro"), later, "pro");
    await perks.setBlurb(proTask.id, "Our pick: uptime checks without the setup");

    const data = await newsletter.buildDigest(lastWeek);
    expect(data.spotlight?.map((d) => d.name)).toEqual(["top.io"]);
    expect(data.featuredDebuts?.map((d) => [d.name, d.tagline])).toEqual([
      ["pro.io", "Our pick: uptime checks without the setup"],
    ]);
    // Mentioned listings aren't repeated under "Debuting now".
    expect(data.debutingNow.map((d) => d.name)).toEqual([]);
    const html = render.renderDigest(data, "#").html;
    expect(html).toContain("Spotlight");
    expect(html).toContain("Featured debuts");

    expect(await newsletter.sendWeeklyDigest(now)).toEqual({ week: lastWeek, sent: 1 });
    expect(sent.find((e) => e.to === "reader@x.test")?.html).toContain("uptime checks without the setup");

    const status = async (id: string) => (await tasksFor(id)).find((t) => t.kind !== "launch_post")!;
    expect(await status(pro.id)).toMatchObject({ status: "done", weekKey: lastWeek });
    expect(await status(spot.id)).toMatchObject({ status: "done", weekKey: lastWeek });
    expect((await status(waiting.id)).status).toBe("suggested");
    expect((await status(later.id)).status).toBe("suggested");
    expect((await perks.pastMentions()).map((r) => r.name).sort()).toEqual(["pro.io", "top.io"]);

    // A skipped mention stays out.
    await perks.skipPerk((await status(waiting.id)).id, "Refunded");
    expect((await perks.openMentions()).map((r) => r.name)).toEqual(["later.io"]);
  });

  it("drafts a launch post from the listing and marks it done when published", async () => {
    const p = await listing("launchy.io", thisWeek);
    const author = await makeUser();
    const [, task] = await perks.createPerkTasks(await paidOrder(p.id, "launch_premium"), p, "premium");
    expect(task.kind).toBe("launch_post");

    const post = await blog.startLaunchDraft(task.id, author);
    expect(post).toMatchObject({ kind: "launch", status: "draft" });
    const draft = JSON.stringify((await blog.getStaffPost(post.id))!.fields.content_json);
    expect(draft).toContain("launchy.io does useful things");
    expect(draft).toContain("https://launchy.io/");
    expect(draft).toContain("https://launchy.io/shot.png");
    expect(draft).toContain("Second paragraph");
    expect(draft).toContain("/category/productivity");
    expect(draft).toContain(`Maker u`);
    expect(await perks.getPerkTask(task.id)).toMatchObject({ status: "drafting", postId: post.id });
    // Starting again opens the same draft.
    expect((await blog.startLaunchDraft(task.id, author)).id).toBe(post.id);
    expect(await perks.openPerkCounts()).toEqual({ newsletter: 1, blog: 1 });

    // Launch drafts come with a category but still need a meta description.
    const staff = (await blog.getStaffPost(post.id))!;
    await blog.saveDraft(post.id, author, { baseVersion: staff.version, fields: { seo_description: "launchy.io." } });
    await blog.publishPost(post.id, author);
    expect(await perks.getPerkTask(task.id)).toMatchObject({ status: "done" });
    expect((await perks.openPerkCounts()).blog).toBe(0);
  });

  it("puts a launch post back in the suggestions when its draft is deleted", async () => {
    const p = await listing("deleted.io", thisWeek);
    const [, task] = await perks.createPerkTasks(await paidOrder(p.id, "launch_premium"), p, "premium");
    const post = await blog.startLaunchDraft(task.id, await makeUser());
    await blog.deletePost(post.id);
    expect(await perks.getPerkTask(task.id)).toMatchObject({ status: "suggested", postId: null });
  });

  it("backfills paid listings launching this week or later, once", async () => {
    const soon = await listing("soon.io", addWeeks(thisWeek, 1));
    const old = await listing("old.io", addWeeks(thisWeek, -2));
    for (const p of [soon, old]) {
      await dbmod.db().update(dbmod.schema.products).set({ tier: "premium" }).where(eq(dbmod.schema.products.id, p.id));
      await paidOrder(p.id, "launch_premium");
    }
    expect(await perks.backfillPerkTasks(now)).toBe(2);
    expect(await perks.backfillPerkTasks(now)).toBe(0);
    expect(await tasksFor(old.id)).toEqual([]);
    expect((await tasksFor(soon.id)).map((t) => t.kind)).toEqual(["newsletter", "launch_post"]);
  });
});
