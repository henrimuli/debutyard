/**
 * The cold outreach guarantees against a real Postgres: never emailing anyone
 * twice, honouring unsubscribes, filing replies. Runs when TEST_DATABASE_URL is set.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InboundMail, MailboxAccount, OutgoingMail } from "@/lib/outreach/mailbox";
import { resetDatabase } from "./helpers/db";

const TEST_DB = process.env.TEST_DATABASE_URL;

const mail = (over: Partial<InboundMail>): InboundMail => ({
  uid: 1,
  messageId: `<${Math.random()}@them>`,
  from: "founder@acme.com",
  fromName: "Ada",
  to: "henry@hello.debutyard.com",
  subject: "Re: who's ranking",
  text: "Tell me more, this sounds useful for us and we'd like the details.",
  inReplyTo: null,
  references: null,
  headers: {},
  date: new Date(),
  ...over,
});

describe.skipIf(!TEST_DB)("cold outreach (Postgres)", () => {
  let dbmod: typeof import("@/db");
  let pipeline: typeof import("@/lib/outreach/pipeline");
  let inbox: typeof import("@/lib/outreach/inbox");
  let queries: typeof import("@/lib/outreach/queries");
  let settings: typeof import("@/lib/outreach/settings");
  let variants: typeof import("@/lib/outreach/variants");
  type Sent = OutgoingMail & { box: string };
  let sent: Sent[] = [];
  let failNext = false;
  /** Addresses that refuse the connection, as a mailbox with a bad password would. */
  let down = new Set<string>();
  let inboxes: Record<string, InboundMail[]> = {};
  let reads: Array<{ box: string; lastUid: number }> = [];
  let n = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.OUTREACH_SMTP_HOST = "smtp.test";
    process.env.OUTREACH_IMAP_HOST = "imap.test";
    process.env.OUTREACH_MAILBOXES = JSON.stringify([
      { from: "Henry from DebutYard <henry@hello.debutyard.com>", pass: "x" },
      { from: "Henry from DebutYard <henry@other.debutyard.test>", pass: "x" },
    ]);
    (await import("@/env")).resetEnvForTests();
    await resetDatabase(TEST_DB!);
    dbmod = await import("@/db");
    pipeline = await import("@/lib/outreach/pipeline");
    inbox = await import("@/lib/outreach/inbox");
    queries = await import("@/lib/outreach/queries");
    settings = await import("@/lib/outreach/settings");
    variants = await import("@/lib/outreach/variants");
    const { MailboxUnavailable, setMailboxForTests } = await import("@/lib/outreach/mailbox");
    setMailboxForTests({
      async send(box: MailboxAccount, m) {
        if (down.has(box.address)) throw new MailboxUnavailable("Invalid login");
        if (failNext) {
          failNext = false;
          throw new Error("SMTP said no");
        }
        sent.push({ ...m, box: box.address });
      },
      async read(box: MailboxAccount, since) {
        reads.push({ box: box.address, lastUid: since.lastUid });
        if (down.has(box.address)) throw new Error("IMAP down");
        const mails = inboxes[box.address] ?? [];
        return { uidValidity: "1", lastUid: since.lastUid + mails.length, mails };
      },
    });
    await variants.ensureControl();
  });

  beforeEach(async () => {
    sent = [];
    down = new Set();
    inboxes = {};
    reads = [];
    // Each test starts with every mailbox's day empty.
    await dbmod
      .db()
      .update(dbmod.schema.outreachEmails)
      .set({ sentAt: new Date(0) });
  });

  afterAll(async () => {
    delete process.env.OUTREACH_MAILBOXES;
    delete process.env.OUTREACH_SMTP_HOST;
    delete process.env.OUTREACH_IMAP_HOST;
    (await import("@/lib/outreach/mailbox")).setMailboxForTests(undefined);
    await (dbmod?.db() as unknown as { $client: { end(): Promise<void> } } | undefined)?.$client.end();
  });

  /** A prospect with a draft ready to send. */
  async function draft(domain = `site${++n}.com`, to = `hello@${domain}`) {
    const { outreachEmails, outreachProspects, outreachVariants } = dbmod.schema;
    const [variant] = await dbmod.db().select().from(outreachVariants).limit(1);
    const [prospect] = await dbmod
      .db()
      .insert(outreachProspects)
      .values({
        domain,
        name: domain,
        websiteUrl: `https://${domain}`,
        sourceUrl: "https://dir.com",
        launchEvidence: "Listed under Today",
        status: "drafted",
        email: to,
      })
      .returning();
    const [email] = await dbmod
      .db()
      .insert(outreachEmails)
      .values({
        prospectId: prospect!.id,
        variantId: variant!.id,
        toAddress: to,
        subject: "Hello",
        body: "Hey team,",
        html: "<p>Hey team,</p>",
        token: `tok-${domain}`,
        messageId: `<${domain}@hello.debutyard.com>`,
      })
      .returning();
    return { prospect: prospect!, email: email! };
  }

  it("starts switched off, at 5 a day", async () => {
    const s = await settings.getSettings();
    expect(s.mode).toBe("off");
    expect(s.dailyLimit).toBe(5);
  });

  it("does nothing but read the mailbox while off", async () => {
    await draft();
    const r = await pipeline.runOutreach();
    expect(r.mode).toBe("off");
    expect(sent).toEqual([]);
  });

  it("won't send when not in production, even in live mode", async () => {
    expect(pipeline.canGoLive()).toBe(false);
  });

  it("sends a draft once, however many times it's asked", async () => {
    const { email } = await draft();
    expect(await pipeline.sendDraft(email.id)).toBe("sent");
    expect(await pipeline.sendDraft(email.id)).toBe("skipped");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("refuses a second email to the same address or the same business at the database", async () => {
    const { email, prospect } = await draft();
    const { outreachEmails, outreachProspects } = dbmod.schema;
    const copy = { ...email, id: undefined, token: "other", messageId: "<other@x>" };
    const [other] = await dbmod
      .db()
      .insert(outreachProspects)
      .values({
        domain: `other${++n}.com`,
        name: "o",
        websiteUrl: "https://o.com",
        sourceUrl: "x",
        launchEvidence: "x",
      })
      .returning();
    await expect(
      dbmod
        .db()
        .insert(outreachEmails)
        .values({ ...copy, prospectId: other!.id }),
    ).rejects.toThrow();
    await expect(
      dbmod
        .db()
        .insert(outreachEmails)
        .values({ ...copy, prospectId: prospect.id, toAddress: "new@x.com" }),
    ).rejects.toThrow();
    await expect(
      dbmod.db().insert(outreachProspects).values({
        domain: prospect.domain,
        name: "o",
        websiteUrl: "https://o.com",
        sourceUrl: "x",
        launchEvidence: "x",
      }),
    ).rejects.toThrow();
  });

  it("never retries a failed send", async () => {
    const { email } = await draft();
    failNext = true;
    expect(await pipeline.sendDraft(email.id)).toBe("failed");
    expect(await pipeline.sendDraft(email.id)).toBe("skipped");
    expect(sent).toEqual([]);
  });

  it("won't send to someone blocked after the draft was written", async () => {
    const { email, prospect } = await draft();
    await queries.blockDomain(prospect.domain);
    expect(await pipeline.sendDraft(email.id)).toBe("skipped");
    expect(sent).toEqual([]);
  });

  it("honours an unsubscribe link, and a later draft to that address doesn't go", async () => {
    const domain = `unsub${++n}.com`;
    const first = await draft(domain);
    await pipeline.sendDraft(first.email.id);
    expect(await queries.unsubscribeByToken(first.email.token)).toBe(true);
    const { isSuppressed } = await import("@/lib/outreach/suppressions");
    expect(await isSuppressed(first.email.toAddress)).toBe(true);
  });

  it("counts a real click but not a scanner", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    const later = new Date(Date.now() + 600_000);
    await queries.recordClick(email.token, "Mozilla/5.0 (compatible; Barracuda)", later);
    await queries.recordClick(email.token, "Mozilla/5.0 Chrome/124", later);
    const row = await queries.getEmail(email.id);
    expect(row?.email.clicks).toBe(1);
    expect(row?.email.firstClickAt).not.toBeNull();
  });

  it("files a reply on the email it answers, once", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    const reply = mail({
      from: "ada@somewhere.com",
      inReplyTo: email.messageId,
      messageId: "<reply-1@them>",
      subject: "Re: Hello",
      text: "Please unsubscribe me.",
    });
    const filed = await inbox.receiveMail(reply);
    expect(filed?.kind).toBe("unsubscribe");
    expect(await inbox.receiveMail(reply)).toBeNull();
    const thread = await inbox.getThread(filed!.threadId);
    expect(thread?.email?.id).toBe(email.id);
    expect(thread?.messages).toHaveLength(1);
    const { isSuppressed } = await import("@/lib/outreach/suppressions");
    expect(await isSuppressed("ada@somewhere.com")).toBe(true);
    expect((await queries.getEmail(email.id))?.email.repliedAt).not.toBeNull();
  });

  it("keeps a reply it can't match, in its own conversation", async () => {
    const filed = await inbox.receiveMail(
      mail({
        from: "stranger@elsewhere.com",
        messageId: "<stranger@them>",
        text: "Who are you? Please stop emailing me.",
      }),
    );
    const thread = await inbox.getThread(filed!.threadId);
    expect(thread?.email).toBeNull();
    expect(await inbox.outreachUnread()).toBeGreaterThan(0);
  });

  it("marks a hard bounce and blocks the address", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    await inbox.receiveMail(
      mail({
        from: "mailer-daemon@mail.com",
        subject: "Undeliverable",
        text: `550 5.1.1 user unknown\nFinal-Recipient: rfc822; ${email.toAddress}`,
        messageId: "<bounce-1@them>",
      }),
    );
    expect((await queries.getEmail(email.id))?.email.status).toBe("bounced");
    const { isSuppressed } = await import("@/lib/outreach/suppressions");
    expect(await isSuppressed(email.toAddress)).toBe(true);
  });

  it("answers from the outreach mailbox, threaded on the conversation", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    const filed = await inbox.receiveMail(
      mail({
        from: email.toAddress,
        inReplyTo: email.messageId,
        messageId: "<reply-2@them>",
        subject: "Re: Hello",
        headers: { "auto-submitted": "no" },
      }),
    );
    sent = [];
    const [staff] = await dbmod
      .db()
      .insert(dbmod.schema.user)
      .values({ id: "staff-1", name: "Staff", email: "staff@debutyard.test", emailVerified: true })
      .returning();
    await inbox.sendReply(filed!.threadId, "Happy to explain.", staff!.id);
    expect(sent[0]!.to).toBe(email.toAddress);
    expect(sent[0]!.inReplyTo).toBe("<reply-2@them>");
    expect(sent[0]!.references).toContain(email.messageId);
    expect((await inbox.getThread(filed!.threadId))?.messages.at(-1)?.direction).toBe("out");
  });

  it("spreads sends across the mailboxes and records which one sent", async () => {
    const a = await draft();
    const b = await draft();
    const c = await draft();
    await pipeline.sendDraft(a.email.id);
    await pipeline.sendDraft(b.email.id);
    await pipeline.sendDraft(c.email.id);
    expect(sent.map((m) => m.box)).toEqual([
      "henry@hello.debutyard.com",
      "henry@other.debutyard.test",
      "henry@hello.debutyard.com",
    ]);
    expect((await queries.getEmail(b.email.id))?.email.fromAddress).toBe("henry@other.debutyard.test");
  });

  it("gives the Message-ID the sending mailbox's domain and saves it, so replies still match", async () => {
    const first = await draft();
    await pipeline.sendDraft(first.email.id);
    const second = await draft();
    await pipeline.sendDraft(second.email.id);
    expect(sent[1]!.messageId).toMatch(/@other\.debutyard\.test>$/);
    expect((await queries.getEmail(second.email.id))?.email.messageId).toBe(sent[1]!.messageId);
  });

  it("stops a mailbox at its daily cap and leaves the draft for later", async () => {
    const { MAILBOX_DAILY_CAP } = await import("@/lib/outreach/rules");
    const made = [];
    for (let i = 0; i < MAILBOX_DAILY_CAP * 2 + 1; i++) made.push(await draft());
    const results = [];
    for (const { email } of made) results.push(await pipeline.sendDraft(email.id));
    expect(results.filter((r) => r === "sent")).toHaveLength(MAILBOX_DAILY_CAP * 2);
    expect(results.at(-1)).toBe("no_mailbox");
    expect((await queries.getEmail(made.at(-1)!.email.id))?.email.status).toBe("draft");
  });

  it("hands a draft to the next mailbox when one can't send, without using up the prospect", async () => {
    down.add("henry@hello.debutyard.com");
    const { email } = await draft();
    expect(await pipeline.sendDraft(email.id)).toBe("sent");
    expect(sent.map((m) => m.box)).toEqual(["henry@other.debutyard.test"]);
    const [box] = await dbmod
      .db()
      .select()
      .from(dbmod.schema.outreachMailboxes)
      .where(eq(dbmod.schema.outreachMailboxes.address, "henry@hello.debutyard.com"));
    expect(box?.sendError).toBe("Invalid login");
  });

  it("keeps the draft when every mailbox is down, and clears the error once one recovers", async () => {
    down = new Set(["henry@hello.debutyard.com", "henry@other.debutyard.test"]);
    const { email } = await draft();
    expect(await pipeline.sendDraft(email.id)).toBe("no_mailbox");
    const row = await queries.getEmail(email.id);
    expect(row?.email.status).toBe("draft");
    expect(row?.email.sentAt).toBeNull();
    expect(row?.email.fromAddress).toBeNull();
    down = new Set();
    expect(await pipeline.sendDraft(email.id)).toBe("sent");
    const [box] = await dbmod
      .db()
      .select()
      .from(dbmod.schema.outreachMailboxes)
      .where(eq(dbmod.schema.outreachMailboxes.address, sent[0]!.box));
    expect(box?.sendError).toBeNull();
  });

  it("reads every mailbox, each from where it got to, and one failing leaves the others alone", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    inboxes["henry@other.debutyard.test"] = [
      mail({
        from: email.toAddress,
        to: "henry@other.debutyard.test",
        inReplyTo: sent[0]!.messageId,
        messageId: `<poll-${++n}@them>`,
        subject: "Re: Hello",
      }),
    ];
    down.add("henry@hello.debutyard.com");
    expect(await inbox.pollMailbox()).toMatchObject({ mailboxes: 2, filed: 1, failed: 1 });
    inboxes = {};
    down = new Set();
    reads = [];
    await inbox.pollMailbox();
    expect(reads.find((r) => r.box === "henry@other.debutyard.test")?.lastUid).toBeGreaterThan(0);
    expect(reads.find((r) => r.box === "henry@hello.debutyard.com")).toBeDefined();
  });

  it("answers from the mailbox the conversation is with", async () => {
    await pipeline.sendDraft((await draft()).email.id);
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    expect(sent[1]!.box).toBe("henry@other.debutyard.test");
    const filed = await inbox.receiveMail(
      mail({
        from: email.toAddress,
        inReplyTo: sent[1]!.messageId,
        messageId: `<r-${++n}@them>`,
        subject: "Re: Hello",
      }),
    );
    sent = [];
    await inbox.sendReply(filed!.threadId, "Happy to explain.", "staff-1");
    expect(sent[0]!.box).toBe("henry@other.debutyard.test");
    expect(sent[0]!.messageId).toMatch(/@other\.debutyard\.test>$/);
  });

  it("ignores mail between our own mailboxes", async () => {
    const own = mail({ from: "henry@other.debutyard.test", messageId: `<own-${++n}@x>` });
    expect(await inbox.receiveMail(own)).toBeNull();
  });

  it("doesn't pause again on the same bad sends after staff go live again", async () => {
    const { email } = await draft();
    await pipeline.sendDraft(email.id);
    const { outreachEmails } = dbmod.schema;
    const sentAt = new Date();
    await dbmod
      .db()
      .update(outreachEmails)
      .set({ replyClass: "complaint", sentAt })
      .where(eq(outreachEmails.id, email.id));
    expect(await pipeline.checkHealth(sentAt, null)).toContain("complaint");
    expect(await pipeline.checkHealth(sentAt, new Date(sentAt.getTime() + 1000))).toBeNull();
    await dbmod.db().update(outreachEmails).set({ replyClass: null }).where(eq(outreachEmails.id, email.id));
    await settings.updateSettings({ mode: "off", pausedReason: null });
  });

  it("ties a paid order back to the email", async () => {
    const domain = `buyer${++n}.com`;
    const { email } = await draft(domain);
    await pipeline.sendDraft(email.id, new Date(Date.now() - 86_400_000));
    const { orders, submissionOrders } = dbmod.schema;
    const [order] = await dbmod
      .db()
      .insert(orders)
      .values({
        email: "someone@else.com",
        kind: "submission",
        sku: "submission_starter",
        listAmountCents: 9900,
        amountCents: 9900,
        provider: "paystack",
        status: "paid",
        paidAt: new Date(),
      })
      .returning();
    await dbmod
      .db()
      .insert(submissionOrders)
      .values({
        orderId: order!.id,
        email: "someone@else.com",
        package: "starter",
        targetCount: 30,
        intakeToken: `i-${domain}`,
        reportToken: `r-${domain}`,
        websiteUrl: `https://www.${domain}/`,
      });
    expect(await pipeline.attributeOrders()).toBeGreaterThanOrEqual(1);
    expect((await queries.getEmail(email.id))?.email.orderId).toBe(order!.id);
  });
});
