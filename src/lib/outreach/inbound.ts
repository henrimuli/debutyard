/**
 * What an email landing in the outreach mailbox is, before any model reads it:
 * a bounce, an auto-reply, an unsubscribe, or something a person wrote. Pure.
 */

export type ReplyClass =
  "interested" | "question" | "not_interested" | "unsubscribe" | "complaint" | "auto_reply" | "other";

export const REPLY_CLASSES: readonly ReplyClass[] = [
  "interested",
  "question",
  "not_interested",
  "unsubscribe",
  "complaint",
  "auto_reply",
  "other",
];

/** Replies that count for a version of the pitch. */
export const isPositive = (c: string | null) => c === "interested" || c === "question";

/** Replies that mean never contact this address again, beyond the one email it already got. */
export const suppressionFor = (c: ReplyClass): string | null =>
  c === "unsubscribe"
    ? "unsubscribed"
    : c === "complaint"
      ? "complained"
      : c === "not_interested"
        ? "not_interested"
        : null;

export type InboundHeaders = Record<string, string>;

/**
 * Why a mailbox couldn't be read, for the dashboard. The IMAP library says only
 * "Command failed" whatever the server answered, and keeps the answer on the side.
 */
export function readFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const { authenticationFailed, responseText } = err as Error & {
    authenticationFailed?: boolean;
    responseText?: string;
  };
  const said = responseText ? `: ${responseText}` : "";
  return authenticationFailed ? `The server refused the login${said}` : `${err.message}${said}`;
}

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon|bounces?)@/i;
const BOUNCE_SUBJECT =
  /delivery (status notification|has failed|failure|incomplete)|undeliverable|undelivered mail|returned mail|mail delivery failed|failure notice/i;

export const isBounce = (from: string, subject: string, headers: InboundHeaders) =>
  BOUNCE_FROM.test(from) ||
  BOUNCE_SUBJECT.test(subject) ||
  /multipart\/report.*delivery-status/i.test(headers["content-type"] ?? "");

const FAILED_RECIPIENT =
  /(?:final-recipient:\s*rfc822;\s*|original-recipient:\s*rfc822;\s*|x-failed-recipients:\s*|to:?\s*<)([^\s<>;]+@[^\s<>;]+)/i;

/** The address that failed, from a bounce message. */
export function bouncedAddress(text: string, headers: InboundHeaders): string | null {
  const header = headers["x-failed-recipients"];
  if (header) return header.split(",")[0]!.trim().toLowerCase();
  return FAILED_RECIPIENT.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** Soft failures (a full mailbox, a greylist) don't mean the address is bad. Only permanent ones suppress. */
export const isHardBounce = (text: string) =>
  /\b5\.\d\.\d\b|\b55\d\b|user unknown|no such user|does not exist|address rejected|account .{0,30}(disabled|not found)/i.test(
    text,
  ) && !/\b4\.\d\.\d\b/.test(text);

export function isAutoReply(subject: string, headers: InboundHeaders): boolean {
  const auto = headers["auto-submitted"];
  if (auto && !/^no$/i.test(auto.trim())) return true;
  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;
  if (/^(auto_reply|bulk)$/i.test(headers["precedence"] ?? "")) return true;
  return /^(auto(matic)?[- ]?(reply|response)|out of (the )?office|away from|on vacation|thanks for (contacting|reaching out))/i.test(
    subject.replace(/^(re|fwd?):\s*/i, ""),
  );
}

/** A short reply asking to stop. Longer ones go to the model, which reads them properly. */
export function asksToStop(ownText: string): boolean {
  const t = ownText.trim();
  return (
    t.length <= 200 &&
    /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact)|^stop\.?$)\b/i.test(
      t,
    )
  );
}

/** A short no. Emails invite this reply, so it has to work even when the model is down. A question goes to the model. */
export function declines(ownText: string): boolean {
  const t = ownText.trim();
  return (
    t.length <= 200 &&
    !t.includes("?") &&
    /\b(not interested|no thanks|no thank you|not relevant|not for us|not useful|no need|leave me alone)\b/i.test(t)
  );
}

export const asksIfSpam = (ownText: string) =>
  /\b(this is spam|reported? (you|this|as spam)|spam(ming)? (me|us))\b/i.test(ownText);

/** Message-IDs a message points back at. */
export function referenced(inReplyTo: string | null | undefined, references: string | null | undefined): string[] {
  const ids = `${inReplyTo ?? ""} ${references ?? ""}`.match(/<[^<>\s]+>/g) ?? [];
  return [...new Set(ids)];
}
