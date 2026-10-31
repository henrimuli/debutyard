import "server-only";
import { and, asc, countDistinct, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { env } from "@/env";
import { addImpressions, newsletterSponsor } from "@/lib/ads/service";
import { sendBatch, sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { weekBoard } from "@/lib/board/queries";
import { markMentionsDelivered, mentionsForIssue } from "@/lib/perks/service";
import { isKitSource, KIT_COUPON, KIT_COUPON_PERCENT, KIT_NAME, KIT_PATH } from "@/lib/kit";
import { addWeeks, formatWeekLabel, weekKeyFor } from "@/lib/weeks";
import { renderDigest, type DigestData } from "./render";
import type { TrackedEvent } from "./webhook-rules";

const { newsletterSubscribers: subs, newsletterIssues: issues, launchWeeks } = schema;

function url(path: string) {
  return new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
}

const newToken = () => randomBytes(24).toString("base64url");
const RESEND_CONFIRM_AFTER_MS = 10 * 60_000;

export type SubscribeResult = "confirm_sent" | "already_subscribed" | "recently_sent";

async function sendConfirm(email: string, token: string, kit: boolean) {
  if (kit) return sendKitConfirm(email, token);
  const link = url(`/newsletter/confirm?token=${token}`);
  await sendEmail({
    to: email,
    ...renderEmail({
      variant: "newsletter",
      label: "Weekly digest",
      subject: "Confirm your DebutYard newsletter subscription",
      preheader: "One click and you're in: winners and new debuts, every Monday.",
      reason: "someone signed this address up for the DebutYard weekly digest",
      blocks: [
        { heading: "Confirm your subscription" },
        {
          text: "Confirm your subscription to the weekly DebutYard digest: last week's winners and this week's debuts, every Monday.",
        },
        { button: "Confirm subscription", href: link },
        { note: "If you didn't ask for this, ignore this email and you won't hear from us." },
      ],
    }),
  });
}

/** Confirm email for a Founder Kit sign-up: confirming opens the kit. */
async function sendKitConfirm(email: string, token: string) {
  const link = url(`/newsletter/confirm?token=${token}&kit=1`);
  await sendEmail({
    to: email,
    ...renderEmail({
      variant: "newsletter",
      label: KIT_NAME,
      subject: `Confirm your email to get the ${KIT_NAME}`,
      preheader: `One click and the kit is yours, plus ${KIT_COUPON_PERCENT}% off your first paid debut.`,
      reason: `someone asked for the DebutYard ${KIT_NAME} with this address`,
      blocks: [
        { heading: `Your ${KIT_NAME} is one click away` },
        {
          text: "Confirm your email and we'll open the kit: the Directory Atlas, the Agentic Dev Starter Pack, the Vibe-Coded App Ship Checklist, the AI Search Visibility Playbook and the 30-Day Launch Playbook.",
        },
        { button: "Confirm and get the kit", href: link },
        {
          note: "Confirming also subscribes you to the weekly DebutYard digest, one email each Monday. If you didn't ask for this, ignore this email.",
        },
      ],
    }),
  });
}

/** The kit itself, for someone who is already subscribed and asks again. */
async function sendKit(email: string) {
  await sendEmail({
    to: email,
    ...renderEmail({
      variant: "newsletter",
      label: KIT_NAME,
      subject: `Your DebutYard ${KIT_NAME}`,
      preheader: `Five launch guides, plus ${KIT_COUPON_PERCENT}% off your first paid debut.`,
      reason: `you asked for the DebutYard ${KIT_NAME}`,
      blocks: [
        { heading: `Here's your ${KIT_NAME}` },
        { text: "You're already on the list, so here's the kit straight away." },
        { button: "Open the kit", href: url(KIT_PATH) },
        { text: `Code ${KIT_COUPON} takes ${KIT_COUPON_PERCENT}% off your first paid debut.` },
      ],
    }),
  });
}

/** Double opt-in: creates (or revives) a pending subscriber and emails a confirm link. */
export async function subscribe(rawEmail: string, source: string | null = null): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  const existing = await db().query.newsletterSubscribers.findFirst({ where: eq(subs.email, email) });
  const kit = isKitSource(source);
  if (existing?.status === "active") {
    if (kit) await sendKit(email);
    return "already_subscribed";
  }
  if (
    existing?.confirmEmailSentAt &&
    Date.now() - existing.confirmEmailSentAt.getTime() < RESEND_CONFIRM_AFTER_MS &&
    existing.status === "pending"
  ) {
    return "recently_sent";
  }

  const token = existing?.status === "pending" ? existing.token : newToken();
  if (existing) {
    await db()
      .update(subs)
      .set({ status: "pending", token, confirmEmailSentAt: new Date(), unsubscribedAt: null })
      .where(eq(subs.id, existing.id));
  } else {
    await db().insert(subs).values({ email, token, source, confirmEmailSentAt: new Date() }).onConflictDoNothing();
  }
  await sendConfirm(email, token, kit);
  return "confirm_sent";
}

export async function confirmSubscription(token: string): Promise<boolean> {
  const [row] = await db()
    .update(subs)
    .set({ status: "active", confirmedAt: new Date() })
    .where(and(eq(subs.token, token), eq(subs.status, "pending")))
    .returning();
  if (row) return true;
  return Boolean(
    await db().query.newsletterSubscribers.findFirst({ where: and(eq(subs.token, token), eq(subs.status, "active")) }),
  );
}

export async function unsubscribe(token: string): Promise<boolean> {
  const [row] = await db()
    .update(subs)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(subs.token, token))
    .returning();
  return Boolean(row);
}

/** Digest for the week that just closed plus the week that just started. */
export async function buildDigest(closedWeek: string): Promise<DigestData> {
  const newWeek = addWeeks(closedWeek, 1);
  const [closedBoard, newBoard, awards, mentions] = await Promise.all([
    weekBoard(closedWeek),
    weekBoard(newWeek),
    db().query.awards.findMany({
      where: and(eq(schema.awards.scope, "week"), eq(schema.awards.periodKey, closedWeek)),
      orderBy: (a, { asc }) => asc(a.place),
    }),
    mentionsForIssue(closedWeek),
  ]);
  const byId = new Map(closedBoard.map((p) => [p.id, p]));
  const winners = awards
    .map((a) => ({ a, p: byId.get(a.productId) }))
    .filter((x) => x.p)
    .map(({ a, p }) => ({
      name: p!.name,
      tagline: p!.tagline,
      url: url(`/p/${p!.slug}`),
      logoUrl: p!.logoUrl,
      applause: p!.debutApplause,
      place: a.place,
    }));
  const winnerIds = new Set(awards.map((a) => a.productId));

  // Paid mentions get their own rows (blurb included), so they aren't repeated further down.
  const mention = (m: (typeof mentions)[number]) => ({
    name: m.name,
    tagline: m.task.blurb || m.tagline,
    url: url(`/p/${m.slug}`),
    logoUrl: m.logoUrl,
  });
  const spotlight = mentions.filter((m) => m.task.kind === "newsletter_top");
  const featured = mentions.filter((m) => m.task.kind === "newsletter");
  const mentioned = new Set(mentions.map((m) => m.slug));

  const paidRank = { spotlight: 0, premium: 1, pro: 2 } as Record<string, number>;
  const debuting = [...newBoard]
    .filter((p) => !mentioned.has(p.slug))
    .sort((a, b) => (paidRank[a.tier] ?? 9) - (paidRank[b.tier] ?? 9))
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      tagline: p.tagline,
      url: url(`/p/${p.slug}`),
      logoUrl: p.logoUrl,
      featured: p.tier in paidRank,
    }));

  return {
    closedWeekLabel: formatWeekLabel(closedWeek),
    newWeekLabel: formatWeekLabel(newWeek),
    winners,
    topOfWeek: closedBoard
      .filter((p) => !winnerIds.has(p.id) && !mentioned.has(p.slug))
      .slice(0, 7)
      .map((p) => ({
        name: p.name,
        tagline: p.tagline,
        url: url(`/p/${p.slug}`),
        logoUrl: p.logoUrl,
        applause: p.applause,
      })),
    debutingNow: debuting,
    sponsor: await newsletterSponsor(newWeek),
    spotlight: spotlight.map(mention),
    featuredDebuts: featured.map(mention),
    perkTaskIds: mentions.map((m) => m.task.id),
    siteUrl: url("/"),
  };
}

/**
 * Sends the digest for last week once it's closed. The issue row is the lock;
 * a send that died midway is retried after an hour with the same idempotency
 * keys, so recipients who already got it don't get it twice.
 */
export async function sendWeeklyDigest(now = new Date()) {
  const closedWeek = addWeeks(weekKeyFor(now), -1);
  const week = await db().query.launchWeeks.findFirst({
    where: and(eq(launchWeeks.key, closedWeek), isNotNull(launchWeeks.closedAt)),
  });
  if (!week) return { skipped: "week not closed" };

  const data = await buildDigest(closedWeek);
  if (
    data.winners.length === 0 &&
    data.debutingNow.length === 0 &&
    data.topOfWeek.length === 0 &&
    !data.perkTaskIds?.length
  ) {
    return { skipped: "nothing to send" };
  }

  const subject = renderDigest(data, "").subject;
  const [claimed] = await db()
    .insert(issues)
    .values({ weekKey: closedWeek, subject })
    .onConflictDoNothing()
    .returning();
  if (!claimed) {
    const stale = await db().query.newsletterIssues.findFirst({
      where: and(eq(issues.weekKey, closedWeek), lt(issues.startedAt, new Date(now.getTime() - 3600_000))),
    });
    if (!stale || stale.sentAt) return { skipped: "already sent or in progress" };
    await db().update(issues).set({ startedAt: now, error: null }).where(eq(issues.weekKey, closedWeek));
  }

  const recipients = await db()
    .select({ email: subs.email, token: subs.token })
    .from(subs)
    .where(eq(subs.status, "active"))
    .orderBy(asc(subs.createdAt), asc(subs.id));

  try {
    const emails = recipients.map((r) => {
      const unsub = url(`/newsletter/unsubscribe?token=${r.token}`);
      const oneClick = url(`/api/newsletter/unsubscribe?token=${r.token}`);
      return {
        to: r.email,
        ...renderDigest(data, unsub),
        headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "issue", value: closedWeek }],
      };
    });
    const sent = emails.length ? await sendBatch(emails, `digest-${closedWeek}`) : 0;
    await db().update(issues).set({ sentAt: new Date(), recipients: sent }).where(eq(issues.weekKey, closedWeek));
    if (data.sponsor) await addImpressions(data.sponsor.bookingId, sent);
    await markMentionsDelivered(data.perkTaskIds ?? [], closedWeek);
    return { week: closedWeek, sent };
  } catch (err) {
    await db()
      .update(issues)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(issues.weekKey, closedWeek));
    throw err;
  }
}

export async function subscriberCounts() {
  const rows = await db().select({ status: subs.status }).from(subs);
  return {
    active: rows.filter((r) => r.status === "active").length,
    pending: rows.filter((r) => r.status === "pending").length,
    unsubscribed: rows.filter((r) => r.status === "unsubscribed").length,
  };
}

/** Stores a Resend open/click. Redelivered events (same svix id) and unknown issues are no-ops. */
export async function recordEvent(svixId: string, event: TrackedEvent): Promise<boolean> {
  const issue = await db().query.newsletterIssues.findFirst({ where: eq(issues.weekKey, event.weekKey) });
  if (!issue) return false;
  const rows = await db()
    .insert(schema.newsletterEvents)
    .values({
      svixId,
      weekKey: event.weekKey,
      type: event.type,
      email: event.email,
      link: event.link ?? null,
      occurredAt: event.at,
    })
    .onConflictDoNothing()
    .returning({ id: schema.newsletterEvents.id });
  return rows.length > 0;
}

/** Unique opens and clicks per issue (one per subscriber, however often they open). */
export async function engagementByIssue(weekKeys: string[]) {
  if (weekKeys.length === 0) return new Map<string, { opens: number; clicks: number }>();
  const ev = schema.newsletterEvents;
  const rows = await db()
    .select({ weekKey: ev.weekKey, type: ev.type, n: countDistinct(ev.email) })
    .from(ev)
    .where(inArray(ev.weekKey, weekKeys))
    .groupBy(ev.weekKey, ev.type);
  const out = new Map<string, { opens: number; clicks: number }>();
  for (const r of rows) {
    const s = out.get(r.weekKey) ?? { opens: 0, clicks: 0 };
    if (r.type === "opened") s.opens = r.n;
    else s.clicks = r.n;
    out.set(r.weekKey, s);
  }
  return out;
}
