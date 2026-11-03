import "server-only";
import { env } from "@/env";
import type { InboundHeaders } from "./inbound";
import { parseMailboxes, type MailboxAccount } from "./rules";

export type { MailboxAccount };

/**
 * The outreach mailboxes, over plain SMTP and IMAP so any host will do. This is
 * the only way cold email leaves: it deliberately doesn't touch Resend, whose
 * policy bans it and which carries the site's sign-in and order mail.
 */

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
};

export type InboundMail = {
  uid: number;
  messageId: string;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string | null;
  headers: InboundHeaders;
  date: Date;
};

export type Mailbox = {
  send(box: MailboxAccount, mail: OutgoingMail): Promise<void>;
  read(
    box: MailboxAccount,
    since: { uidValidity: string | null; lastUid: number },
    limit: number,
  ): Promise<{
    uidValidity: string;
    lastUid: number;
    mails: InboundMail[];
  }>;
};

/** The mailbox couldn't take the message, so nothing went out and another can try. */
export class MailboxUnavailable extends Error {}

const configured = () => {
  const e = env();
  return parseMailboxes(e.OUTREACH_MAILBOXES, { smtpHost: e.OUTREACH_SMTP_HOST, imapHost: e.OUTREACH_IMAP_HOST });
};

/** Every mailbox that's set up properly, in the order they're listed. */
export const mailboxes = () => configured().boxes;

/** What's wrong with OUTREACH_MAILBOXES, for the dashboard. */
export const mailboxProblems = () => configured().problems;

export const canSend = () => mailboxes().length > 0;

let override: Mailbox | undefined;

/** Test-only. `undefined` goes back to the real servers. */
export function setMailboxForTests(m: Mailbox | undefined) {
  override = m;
}

const smtpSend: Mailbox["send"] = async (box, mail) => {
  const port = env().OUTREACH_SMTP_PORT;
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host: box.smtpHost,
    port,
    secure: port === 465,
    // On any other port (Maildoso uses 587) refuse to log in or send unless STARTTLS works.
    requireTLS: port !== 465,
    auth: { user: box.user, pass: box.pass },
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
  try {
    // Connecting and logging in first, because a failure here proves nothing was sent.
    // Once sending starts a dropped connection could mean either, and that must not be retried.
    await transport.verify().catch((err: Error) => {
      throw new MailboxUnavailable(err.message);
    });
    await transport
      .sendMail({
        from: box.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        messageId: mail.messageId,
        inReplyTo: mail.inReplyTo,
        references: mail.references,
        headers: mail.headers,
      })
      .catch((err: Error & { responseCode?: number }) => {
        // A 4xx is the server saying "not now, and I didn't take it": throttling, usually.
        if (err.responseCode && err.responseCode >= 400 && err.responseCode < 500) {
          throw new MailboxUnavailable(err.message);
        }
        throw err;
      });
  } finally {
    transport.close();
  }
};

const smtpImap: Mailbox["read"] = async (box, since, limit) => {
  const port = env().OUTREACH_IMAP_PORT;
  const [{ ImapFlow }, { simpleParser }] = await Promise.all([import("imapflow"), import("mailparser")]);
  const client = new ImapFlow({
    host: box.imapHost!,
    port,
    secure: port === 993,
    auth: { user: box.user, pass: box.pass },
    logger: false,
    connectionTimeout: 20_000,
  });
  await client.connect();
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const uidValidity = String(box.uidValidity);
    const from = since.uidValidity === uidValidity ? since.lastUid : 0;
    const raw: Array<{ uid: number; source: Buffer }> = [];
    if (box.exists > 0) {
      // "n:*" always returns the newest message, even when it's older than n.
      for await (const m of client.fetch(`${from + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (m.uid > from && m.source) raw.push({ uid: m.uid, source: m.source });
        if (raw.length >= limit) break;
      }
    }
    const mails: InboundMail[] = [];
    for (const { uid, source } of raw) {
      const parsed = await simpleParser(source);
      const headers: InboundHeaders = {};
      for (const h of parsed.headerLines) headers[h.key.toLowerCase()] = h.line.slice(h.line.indexOf(":") + 1).trim();
      const sender = parsed.from?.value[0];
      const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
      const refs = Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references ?? null);
      mails.push({
        uid,
        messageId: parsed.messageId ?? `<imap-${uidValidity}-${uid}@outreach.local>`,
        from: (sender?.address ?? "").toLowerCase(),
        fromName: sender?.name || null,
        to: (to?.value[0]?.address ?? "").toLowerCase(),
        subject: parsed.subject ?? "",
        text: (parsed.text ?? "").slice(0, 200_000),
        inReplyTo: parsed.inReplyTo ?? null,
        references: refs,
        headers,
        date: parsed.date ?? new Date(),
      });
    }
    return { uidValidity, lastUid: raw.at(-1)?.uid ?? from, mails };
  } finally {
    await client.logout().catch(() => {});
  }
};

export function mailbox(): Mailbox {
  return override ?? { send: smtpSend, read: smtpImap };
}
