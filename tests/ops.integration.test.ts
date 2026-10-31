/**
 * Submission ops tooling against a real Postgres: per-order inboxes (Resend
 * received-email webhooks), encrypted directory logins and the badge block (hold,
 * detect, replace). Runs when TEST_DATABASE_URL is set; the database is wiped.
 */
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, VerifiedPayment, WebhookEvent } from "@/lib/payments/types";
import { signSvix } from "@/lib/newsletter/webhook-rules";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;
const WEBHOOK_SECRET = `whsec_${Buffer.from("ops-webhook-secret").toString("base64")}`;
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

describe.skipIf(!TEST_DB)("submission ops tooling (Postgres)", () => {
  const pay = new FakePayments();
  let dbmod: typeof import("@/db");
  let subs: typeof import("@/lib/submissions/service");
  let payments: typeof import("@/lib/payments/service");
  let inbox: typeof import("@/lib/submissions/inbox");
  let rules: typeof import("@/lib/submissions/inbox-rules");
  let order: Awaited<ReturnType<typeof import("@/lib/submissions/service").submitIntake>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://debutyard.test";
    process.env.ADMIN_EMAIL = "ops@debutyard.test";
    process.env.INBOUND_EMAIL_DOMAIN = "submit.debutyard.test";
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.CREDENTIALS_KEY = randomBytes(32).toString("base64");
    (await import("@/env")).resetEnvForTests();
    await resetDatabase(TEST_DB!);
    (await import("@/lib/payments")).setProviderForTests("paystack", pay);
    dbmod = await import("@/db");
    subs = await import("@/lib/submissions/service");
    payments = await import("@/lib/payments/service");
    inbox = await import("@/lib/submissions/inbox");
    rules = await import("@/lib/submissions/inbox-rules");

    const { db, schema } = dbmod;
    await db().execute(sql`truncate directories cascade`);
    await db()
      .insert(schema.directories)
      .values([
        {
          slug: "badge-a",
          name: "Badge A",
          url: "https://badge-a.test",
          dr: 95,
          badgeRequired: true,
          badgeSnippet: '<a href="https://badge-a.test/p/acme"><img src="https://badge-a.test/b.svg"></a>',
        },
        {
          slug: "badge-b",
          name: "Badge B",
          url: "https://badge-b.test",
          dr: 94,
          badgeRequired: true,
          badgeSnippet: '<a href="https://badge-b.test"><img src="https://badge-b.test/b.svg"></a>',
        },
        ...Array.from({ length: 4 }, (_, i) => ({
          slug: `plain-${i}`,
          name: `Plain ${i}`,
          url: `https://plain-${i}.test`,
          dr: 60 + i,
        })),
      ]);

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
    sent.length = 0;
    order = await subs.submitIntake(so.intakeToken, {
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
      badgePreference: "allow",
      allowAccounts: true,
    });
  });

  afterAll(async () => {
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  const rowFor = async (slug: string) => {
    const { db, schema } = dbmod;
    const [r] = await db()
      .select({ s: schema.submissions })
      .from(schema.submissions)
      .innerJoin(schema.directories, eq(schema.directories.id, schema.submissions.directoryId))
      .where(and(eq(schema.submissions.submissionOrderId, order.id), eq(schema.directories.slug, slug)));
    return r?.s;
  };

  it("gives each order an inbox and stores Resend-received mail for it once", async () => {
    const address = await inbox.inboxAddress(order);
    expect(address).toMatch(/^[a-z0-9]{10}@submit\.debutyard\.test$/);
    const fetched: string[] = [];
    inbox.setEmailFetcherForTests(async (id) => {
      fetched.push(id);
      return {
        from: "noreply@badge-a.test",
        subject: "Confirm your email",
        text: "Click https://badge-a.test/verify?t=1 to confirm.",
        html: null,
      };
    });
    const route = await import("@/app/api/webhooks/resend/route");
    const post = (svixId: string, data: Record<string, unknown>, sign = true) => {
      const body = JSON.stringify({ type: "email.received", created_at: new Date().toISOString(), data });
      const ts = String(Math.floor(Date.now() / 1000));
      return route.POST(
        new Request("https://debutyard.test/api/webhooks/resend", {
          method: "POST",
          headers: {
            "svix-id": svixId,
            "svix-timestamp": ts,
            "svix-signature": sign ? signSvix(svixId, ts, body, WEBHOOK_SECRET) : "v1,bad",
          },
          body,
        }),
      );
    };
    const mail = { email_id: "em_1", to: ["ops@debutyard.test"], received_for: [address!], from: "x" };
    expect((await post("m0", mail, false)).status).toBe(401);
    expect(await (await post("m1", mail)).json()).toEqual({ stored: true });
    // Resend retries deliver the same email id again.
    expect(await (await post("m2", mail)).json()).toEqual({ stored: false });
    expect(await (await post("m3", { email_id: "em_2", to: ["nobody@submit.debutyard.test"] })).json()).toEqual({
      stored: false,
    });
    expect(fetched).toEqual(["em_1"]);
    const msgs = await inbox.messagesFor(order.id);
    expect(msgs).toHaveLength(1);
    expect(rules.messageLinks(msgs[0].text, msgs[0].html)[0]).toMatchObject({ likely: true });
    inbox.setEmailFetcherForTests(undefined);
  });

  it("keeps directory passwords encrypted and hands them over after delivery", async () => {
    const plain = (await rowFor("plain-0"))!;
    await subs.updateOrderSubmission(plain.id, { accountLogin: "ada@acme.io", accountPassword: "s3cret-pw" });
    const stored = (await rowFor("plain-0"))!;
    expect(stored.accountSecret).toMatch(/^v1\./);
    expect(stored.accountSecret).not.toContain("s3cret");
    // A blank password keeps the stored one.
    await subs.updateOrderSubmission(plain.id, { accountLogin: "ada@acme.io", accountPassword: "" });
    expect(await subs.credentialsFor(order.id)).toEqual([
      { directory: "Plain 0", url: "https://plain-0.test", login: "ada@acme.io", password: "s3cret-pw" },
    ]);
  });

  it("emails a badge block, holds badge rows until the badge is found, then swaps the rest", async () => {
    expect(order.badgeBlockSentAt).toBeNull(); // set after the intake email, past the returning() snapshot
    const fresh = (await subs.orderByIntakeToken(order.intakeToken))!;
    expect(fresh.badgeBlockSentAt).not.toBeNull();
    // The block rides in the intake confirmation, not a second email.
    expect(sent.filter((e) => e.subject.includes("directory badges"))).toHaveLength(0);
    const mail = sent.find((e) => e.subject.startsWith("We've got everything"));
    expect(mail?.to).toBe("ada@acme.io");
    expect(mail?.text).toContain("https://badge-a.test/b.svg");
    expect(mail?.text).toContain("https://badge-b.test/b.svg");

    const a = (await rowFor("badge-a"))!;
    await expect(subs.updateOrderSubmission(a.id, { status: "submitted" })).rejects.toThrow("badge");
    expect(await subs.bulkUpdate(order.id, [a.id, (await rowFor("plain-1"))!.id], "submitted")).toBe(1);

    // The client adds badge A only. A spare badge-free directory joins the list.
    pages.set("https://acme.io/", {
      status: 200,
      body: '<footer><a href="https://badge-a.test/p/acme"><img src="https://badge-a.test/b.svg"></a></footer>',
    });
    await dbmod
      .db()
      .insert(dbmod.schema.directories)
      .values({ slug: "spare", name: "Spare", url: "https://spare.test" });
    expect(await subs.checkBadgeBlocks(new Date())).toMatchObject({ found: 1, replaced: 0 });
    expect((await rowFor("badge-a"))!.badgeSeenAt).not.toBeNull();
    await subs.updateOrderSubmission(a.id, { status: "submitted" });

    const later = new Date(Date.now() + 8 * DAY);
    expect(await subs.checkBadgeBlocks(later)).toMatchObject({ found: 0, replaced: 1 });
    expect((await rowFor("badge-b"))!.status).toBe("replaced");
    expect((await rowFor("spare"))!.status).toBe("todo");
  });
});
