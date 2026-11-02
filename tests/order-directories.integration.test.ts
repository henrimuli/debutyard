/**
 * Choosing an order's directories against a real Postgres: dofollow only, and
 * staff swapping or adding directories, with the client's list following along.
 * Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  sendBatch: vi.fn(async (emails: unknown[]) => emails.length),
}));

vi.mock("@/lib/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net")>();
  return {
    ...actual,
    safeFetchText: vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }),
  };
});

class FakePayments implements PaymentProvider {
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

describe.skipIf(!TEST_DB)("choosing an order's directories (Postgres)", () => {
  const pay = new FakePayments();
  let dbmod: typeof import("@/db");
  let subs: typeof import("@/lib/submissions/service");
  let payments: typeof import("@/lib/payments/service");

  const directory = (slug: string, over: Record<string, unknown> = {}) => ({
    slug,
    name: slug,
    url: `https://${slug}.test`,
    dr: 50,
    linkTypeClaimed: "dofollow" as const,
    ...over,
  });

  const addDirectories = async (...rows: Array<ReturnType<typeof directory>>) => {
    const { db, schema } = dbmod;
    const inserted = await db().insert(schema.directories).values(rows).returning();
    return Object.fromEntries(inserted.map((d) => [d.slug, d.id]));
  };

  /** A paid order with its intake done. */
  const newOrder = async (badgePreference: "none" | "allow" = "none") => {
    const { db, schema } = dbmod;
    const { orderId } = await payments.startCheckout({
      skuId: "submission_starter",
      provider: "paystack",
      email: "buyer@x.test",
    });
    const o = (await db().query.orders.findFirst({ where: eq(schema.orders.id, orderId) }))!;
    pay.verifyResult = {
      status: "paid",
      providerRef: `ref-${orderId}`,
      orderId,
      amountCents: o.amountCents,
      currency: "USD",
    };
    await payments.confirmPayment("paystack", `ref-${orderId}`);
    const so = (await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.orderId, orderId) }))!;
    return subs.submitIntake(so.intakeToken, {
      productName: "Acme",
      websiteUrl: "https://acme.io/",
      tagline: "Invoices that chase themselves",
      shortDescription: "Acme sends polite reminders so clients pay on time, every time, without awkward emails.",
      longDescription: "Acme connects to your invoicing tool and follows up on late invoices for you. ".repeat(3),
      categories: ["ai"],
      logoUrl: "",
      founderName: "Ada",
      contactEmail: "ada@acme.io",
      clientNotes: "",
      badgePreference,
      allowAccounts: true,
    });
  };

  const rowFor = async (orderId: string, slug: string) => {
    const { db, schema } = dbmod;
    const [r] = await db()
      .select({ s: schema.submissions })
      .from(schema.submissions)
      .innerJoin(schema.directories, eq(schema.directories.id, schema.submissions.directoryId))
      .where(and(eq(schema.submissions.submissionOrderId, orderId), eq(schema.directories.slug, slug)));
    return r?.s;
  };

  /** What the client's dashboard, report and CSV list. */
  const clientList = async (orderId: string) =>
    (await subs.orderRows(orderId))
      .filter((r) => r.s.status !== "replaced")
      .map((r) => r.d.slug)
      .sort();

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    (await import("@/env")).resetEnvForTests();
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", pay);
    dbmod = await import("@/db");
    subs = await import("@/lib/submissions/service");
    payments = await import("@/lib/payments/service");
  });

  beforeEach(async () => {
    await dbmod.db().execute(sql`truncate directories cascade`);
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  it("only puts dofollow directories on an order, going by what our checks observed first", async () => {
    await addDirectories(
      directory("good"),
      directory("claimed-nofollow", { linkTypeClaimed: "nofollow", dr: 90 }),
      directory("unknown", { linkTypeClaimed: "unknown", dr: 90 }),
      directory("seen-nofollow", { linkTypeObserved: "nofollow", dr: 90 }),
      directory("seen-dofollow", { linkTypeClaimed: "nofollow", linkTypeObserved: "dofollow" }),
    );
    const order = await newOrder();
    expect(await clientList(order.id)).toEqual(["good", "seen-dofollow"]);
    expect((await subs.directoryChoices(order)).choices).toEqual([]);
  });

  it("keeps replacements for rejected directories dofollow too", async () => {
    await addDirectories(directory("good"));
    const order = await newOrder();
    await addDirectories(directory("bad", { linkTypeClaimed: "nofollow" }), directory("next"));
    const { replacement } = await subs.updateOrderSubmission((await rowFor(order.id, "good"))!.id, {
      status: "rejected",
    });
    expect(replacement).toBeTruthy();
    expect(await clientList(order.id)).toEqual(["next"]);
  });

  it("swaps a directory, and the client's list, report and CSV follow", async () => {
    await addDirectories(directory("old"), directory("stays"));
    const order = await newOrder();
    const { spare } = await addDirectories(directory("spare"));
    expect((await subs.directoryChoices(order)).choices.map((c) => c.name)).toEqual(["spare"]);

    const oldRow = (await rowFor(order.id, "old"))!;
    const { row } = await subs.swapOrderDirectory(oldRow.id, spare);
    expect(row).toMatchObject({ status: "todo", replacesId: oldRow.id, directoryId: spare });
    expect((await rowFor(order.id, "old"))!.status).toBe("replaced");

    expect(await clientList(order.id)).toEqual(["spare", "stays"]);
    const rows = await subs.orderRows(order.id);
    const summary = subs.summarizeOrder(
      order,
      rows.map((r) => r.s),
    );
    expect(summary.scheduled).toBe(2);
    const csv = subs.ordersCsv(rows);
    expect(csv).toContain("spare");
    expect(csv).not.toContain("https://old.test");
  });

  it("brings a swapped-out directory back as a fresh row", async () => {
    await addDirectories(directory("first"));
    const order = await newOrder();
    const { spare } = await addDirectories(directory("spare"));
    const first = (await rowFor(order.id, "first"))!;
    await subs.updateOrderSubmission(first.id, { status: "submitted", actionNeeded: "Old note" });

    await subs.swapOrderDirectory(first.id, spare);
    expect((await subs.directoryChoices(order)).choices.map((c) => c.name)).toEqual(["first"]);
    const { row } = await subs.swapOrderDirectory((await rowFor(order.id, "spare"))!.id, first.directoryId);

    expect(row.id).toBe(first.id);
    expect(row).toMatchObject({ status: "todo", submittedAt: null, actionNeeded: null });
    expect(await clientList(order.id)).toEqual(["first"]);
  });

  it("refuses directories that can't go on an order", async () => {
    await addDirectories(directory("on-order"), directory("also-on"));
    const order = await newOrder();
    const row = (await rowFor(order.id, "on-order"))!;
    const ids = await addDirectories(
      directory("nofollow", { linkTypeClaimed: "nofollow" }),
      directory("unknown", { linkTypeClaimed: "unknown" }),
      directory("guided", { guided: true }),
      directory("inactive", { isActive: false }),
      directory("badge", { badgeRequired: true }),
    );
    for (const slug of ["nofollow", "unknown", "guided", "inactive"]) {
      await expect(subs.swapOrderDirectory(row.id, ids[slug])).rejects.toThrow("dofollow");
    }
    await expect(subs.swapOrderDirectory(row.id, ids.badge)).rejects.toThrow("no badge");
    await expect(subs.swapOrderDirectory(row.id, (await rowFor(order.id, "also-on"))!.directoryId)).rejects.toThrow(
      "already on this order",
    );
    expect((await rowFor(order.id, "on-order"))!.status).toBe("todo");
  });

  it("won't swap a live listing, a row already swapped out or a finished order", async () => {
    await addDirectories(directory("live"), directory("other"));
    const order = await newOrder();
    const { spare, spare2 } = await addDirectories(directory("spare"), directory("spare2"));
    const live = (await rowFor(order.id, "live"))!;
    const { db, schema } = dbmod;
    await db()
      .update(schema.submissions)
      .set({ status: "live", liveUrl: "https://live.test/acme" })
      .where(eq(schema.submissions.id, live.id));
    await expect(subs.swapOrderDirectory(live.id, spare)).rejects.toThrow("live");

    const other = (await rowFor(order.id, "other"))!;
    await subs.swapOrderDirectory(other.id, spare);
    await expect(subs.swapOrderDirectory(other.id, spare2)).rejects.toThrow("already swapped out");

    await subs.deliverOrder(order.id);
    await expect(subs.swapOrderDirectory((await rowFor(order.id, "spare"))!.id, spare2)).rejects.toThrow(
      "while an order is active",
    );
    await expect(subs.addOrderDirectory(order.id, spare2)).rejects.toThrow("while an order is active");
  });

  it("adds a directory to an order that's short, up to its count", async () => {
    await addDirectories(directory("one"));
    const order = await newOrder();
    const { spare, spare2 } = await addDirectories(directory("spare"), directory("spare2"));
    expect(order.targetCount).toBe(40);

    await subs.addOrderDirectory(order.id, spare);
    expect(await clientList(order.id)).toEqual(["one", "spare"]);
    await expect(subs.addOrderDirectory(order.id, spare)).rejects.toThrow("already on this order");

    const { db, schema } = dbmod;
    await db().update(schema.submissionOrders).set({ targetCount: 2 }).where(eq(schema.submissionOrders.id, order.id));
    await expect(subs.addOrderDirectory(order.id, spare2)).rejects.toThrow("Swap one instead");
  });

  it("holds a badge order to five badges, counting the one being swapped out", async () => {
    await addDirectories(
      ...Array.from({ length: 5 }, (_, i) => directory(`badge-${i}`, { badgeRequired: true, dr: 90 - i })),
      directory("plain"),
    );
    const order = await newOrder("allow");
    const { extra } = await addDirectories(directory("extra", { badgeRequired: true }));
    expect((await subs.directoryChoices(order)).badgesFull).toBe(true);

    await expect(subs.swapOrderDirectory((await rowFor(order.id, "plain"))!.id, extra)).rejects.toThrow(
      "already has 5 badge",
    );
    await subs.swapOrderDirectory((await rowFor(order.id, "badge-0"))!.id, extra);
    expect((await rowFor(order.id, "extra"))!.status).toBe("todo");
  });

  it("gives a badge directory swapped in late its own full wait", async () => {
    await addDirectories(directory("badge-old", { badgeRequired: true }));
    const order = await newOrder("allow");
    const { db, schema } = dbmod;
    await db()
      .update(schema.submissionOrders)
      .set({ badgeBlockSentAt: new Date(Date.now() - 30 * DAY) })
      .where(eq(schema.submissionOrders.id, order.id));
    const { late } = await addDirectories(directory("late", { badgeRequired: true }));
    await subs.swapOrderDirectory((await rowFor(order.id, "badge-old"))!.id, late);

    await subs.checkBadgeBlocks(new Date(Date.now() + DAY));
    expect((await rowFor(order.id, "late"))!.status).toBe("todo");

    await subs.checkBadgeBlocks(new Date(Date.now() + 8 * DAY));
    expect((await rowFor(order.id, "late"))!.status).toBe("skipped");
  });
});
