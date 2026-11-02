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
  let block: typeof import("@/lib/badge-block/service");

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

  const details = {
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
    allowAccounts: true as const,
  };

  /** A paid order, waiting for its intake. */
  const paidOrder = async () => {
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
    return (await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.orderId, orderId) }))!;
  };

  /** A paid order with its intake done, and its badge block found if it allows badges. */
  const newOrder = async (badgePreference: "none" | "allow" = "none") => {
    const { db, schema } = dbmod;
    const so = await paidOrder();
    if (badgePreference === "allow") {
      await db()
        .update(schema.submissionOrders)
        .set({ blockInstalledAt: new Date(), blockInstalledUrl: details.websiteUrl })
        .where(eq(schema.submissionOrders.id, so.id));
    }
    return subs.submitIntake(so.intakeToken, { ...details, badgePreference });
  };

  /** The site's homepage, for the next install check. */
  const sitePage = async (body: string) =>
    vi.mocked((await import("@/lib/net")).safeFetchText).mockResolvedValueOnce({
      url: details.websiteUrl,
      status: 200,
      contentType: "text/html",
      body,
    });

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
    block = await import("@/lib/badge-block/service");
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
    expect(order.targetCount).toBe(30);

    await subs.addOrderDirectory(order.id, spare);
    expect(await clientList(order.id)).toEqual(["one", "spare"]);
    await expect(subs.addOrderDirectory(order.id, spare)).rejects.toThrow("already on this order");

    const { db, schema } = dbmod;
    await db().update(schema.submissionOrders).set({ targetCount: 2 }).where(eq(schema.submissionOrders.id, order.id));
    await expect(subs.addOrderDirectory(order.id, spare2)).rejects.toThrow("Swap one instead");
  });

  it("counts an order's live and scheduled directories for the maker's and staff's lists", async () => {
    await addDirectories(directory("one"), directory("two"));
    const order = await newOrder();
    await subs.updateOrderSubmission((await rowFor(order.id, "one"))!.id, {
      status: "live",
      liveUrl: "https://one.test/acme",
    });

    const mine = (await subs.ordersForUser("nobody", "buyer@x.test")).find((r) => r.o.id === order.id)!;
    expect(mine).toMatchObject({ live: 1, total: 2 });
    const ops = (await subs.listOrdersForOps()).find((r) => r.o.id === order.id)!;
    expect(ops).toMatchObject({ live: 1, total: 2 });
  });

  it("picks starred directories first for new orders and replacements", async () => {
    const { starred, spare } = await addDirectories(
      directory("strong", { dr: 90 }),
      directory("starred", { dr: 5 }),
      directory("spare", { dr: 1 }),
    );
    const { setDirectoryStarred } = await import("@/lib/directories/service");
    await setDirectoryStarred(starred, true);

    const { db, schema } = dbmod;
    const so = await paidOrder();
    await db().update(schema.submissionOrders).set({ targetCount: 1 }).where(eq(schema.submissionOrders.id, so.id));
    const order = await subs.submitIntake(so.intakeToken, { ...details, badgePreference: "none" });
    expect(await clientList(order.id)).toEqual(["starred"]);

    await setDirectoryStarred(spare, true);
    expect((await subs.directoryChoices(order)).choices[0]).toMatchObject({ name: "spare", starred: true });
    await subs.updateOrderSubmission((await rowFor(order.id, "starred"))!.id, { status: "rejected" });
    expect(await clientList(order.id)).toEqual(["spare"]);
  });

  it("has no limit on badge directories, and puts them first", async () => {
    await addDirectories(
      ...Array.from({ length: 8 }, (_, i) => directory(`badge-${i}`, { badgeRequired: true, dr: 20 + i })),
      directory("plain", { dr: 90 }),
    );
    const order = await newOrder("allow");
    expect((await clientList(order.id)).filter((slug) => slug.startsWith("badge-"))).toHaveLength(8);

    const { extra } = await addDirectories(directory("extra", { badgeRequired: true }));
    await subs.swapOrderDirectory((await rowFor(order.id, "plain"))!.id, extra);
    expect((await rowFor(order.id, "extra"))!.status).toBe("todo");
  });

  it("only takes a badge order once the block is on the site, for the URL it was found on", async () => {
    await addDirectories(directory("plain"));
    const so = await paidOrder();
    const input = { ...details, badgePreference: "allow" as const };
    await subs.saveIntakeDraft(so.intakeToken, input);
    await expect(subs.submitIntake(so.intakeToken, input)).rejects.toThrow("badge block");

    await sitePage("<html><body>No block here</body></html>");
    let draft = (await subs.orderByIntakeToken(so.intakeToken))!;
    expect(await block.checkIntakeBlock(draft)).toEqual({ found: false, reason: "missing" });

    await sitePage(`<script src="https://debutyard.test/badges/${so.blockKey}.js" async></script>`);
    draft = (await subs.orderByIntakeToken(so.intakeToken))!;
    expect(await block.checkIntakeBlock(draft, new Date(Date.now() + 60_000))).toEqual({ found: true });

    await expect(
      subs.submitIntake(so.intakeToken, { ...input, websiteUrl: "https://somewhere-else.io/" }),
    ).rejects.toThrow("badge block");
    const order = await subs.submitIntake(so.intakeToken, input);
    expect(order.status).toBe("queued");
  });

  it("lets a client continue without badges, block or no block", async () => {
    await addDirectories(directory("plain"), directory("needs-badge", { badgeRequired: true }));
    const so = await paidOrder();
    await subs.saveIntakeDraft(so.intakeToken, { ...details, badgePreference: "allow" });
    const order = await subs.submitIntake(so.intakeToken, { ...details, badgePreference: "none" });
    expect(await clientList(order.id)).toEqual(["plain"]);
  });

  it("shows entered badges in the live block straight away, cleaned, and drops them with their row", async () => {
    await addDirectories(directory("one"), directory("two"), directory("spare", { dr: 10 }));
    const order = await newOrder("allow");
    const badge = '<a href="https://one.test/p/acme" rel="noopener"><img src="https://one.test/b.svg"></a>';

    const empty = (await block.publicBlock(order.blockKey))!;
    expect(empty.script).toBe("");
    expect(empty.html).toContain(order.blockKey);
    expect(empty.html).toContain("hidden");
    expect(empty.html).not.toContain("<a");

    const one = (await rowFor(order.id, "one"))!;
    const saved = await block.setBadgeCode(one.id, `${badge}<script>alert(1)</script>`);
    expect(saved.removed).toEqual(["script"]);
    let live = (await block.publicBlock(order.blockKey))!;
    expect(live.html).toContain(badge);
    expect(live.html).not.toContain("alert(1)");
    expect(live.script).toContain("one.test/p/acme");

    await expect(block.setBadgeCode(one.id, "<script>alert(1)</script>")).rejects.toThrow("script");

    // Rejected: the row gives way to a replacement, and its badge goes with it.
    await subs.updateOrderSubmission(one.id, { status: "rejected" });
    live = (await block.publicBlock(order.blockKey))!;
    expect(live.html).not.toContain("one.test");

    const two = (await rowFor(order.id, "two"))!;
    await block.setBadgeCode(two.id, '<a href="https://two.test">Two</a>');
    expect((await block.publicBlock(order.blockKey))!.html).toContain("two.test");
    const { db, schema } = dbmod;
    await db()
      .update(schema.submissionOrders)
      .set({ status: "cancelled" })
      .where(eq(schema.submissionOrders.id, order.id));
    expect((await block.publicBlock(order.blockKey))!.script).toBe("");

    expect(await block.publicBlock("f".repeat(32))).toBeNull();
  });

  it("gives a badge directory swapped in late its own full wait", async () => {
    await addDirectories(directory("badge-old", { badgeRequired: true }));
    const order = await newOrder("allow");
    const { db, schema } = dbmod;
    await db()
      .update(schema.submissionOrders)
      // An order from before the live block.
      .set({ badgeBlockSentAt: new Date(Date.now() - 30 * DAY), blockInstalledAt: null, blockInstalledUrl: null })
      .where(eq(schema.submissionOrders.id, order.id));
    const { late } = await addDirectories(directory("late", { badgeRequired: true }));
    await subs.swapOrderDirectory((await rowFor(order.id, "badge-old"))!.id, late);

    await subs.checkBadgeBlocks(new Date(Date.now() + DAY));
    expect((await rowFor(order.id, "late"))!.status).toBe("todo");

    await subs.checkBadgeBlocks(new Date(Date.now() + 8 * DAY));
    expect((await rowFor(order.id, "late"))!.status).toBe("skipped");
  });
});
