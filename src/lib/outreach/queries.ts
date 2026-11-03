import "server-only";
import { and, asc, count, desc, eq, gte, ilike, or, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { mailboxes } from "./mailbox";
import { looksLikeScanner } from "./rules";
import { suppress } from "./suppressions";

/** What the admin pages read, and the few things recipients and staff can change. */

const {
  directories,
  orders,
  outreachClicks,
  outreachEmails,
  outreachMailboxes,
  outreachProspects,
  outreachSources,
  outreachSuppressions,
  outreachVariants,
} = schema;

const PAGE = 40;

export async function funnel() {
  const [statuses, reasons, emails] = await Promise.all([
    db()
      .select({ status: outreachProspects.status, n: count() })
      .from(outreachProspects)
      .groupBy(outreachProspects.status),
    db()
      .select({ reason: outreachProspects.reason, n: count() })
      .from(outreachProspects)
      .where(eq(outreachProspects.status, "rejected"))
      .groupBy(outreachProspects.reason)
      .orderBy(desc(count())),
    emailTotals(),
  ]);
  return {
    prospects: Object.fromEntries(statuses.map((s) => [s.status, s.n])) as Record<string, number | undefined>,
    reasons,
    emails,
  };
}

const e = outreachEmails;
const totals = {
  sent: sql<number>`count(*) filter (where ${e.status} in ('sent', 'bounced'))::int`,
  drafts: sql<number>`count(*) filter (where ${e.status} = 'draft')::int`,
  failed: sql<number>`count(*) filter (where ${e.status} in ('failed', 'sending'))::int`,
  bounced: sql<number>`count(*) filter (where ${e.status} = 'bounced')::int`,
  clicked: sql<number>`count(*) filter (where ${e.firstClickAt} is not null)::int`,
  replied: sql<number>`count(*) filter (where ${e.repliedAt} is not null)::int`,
  positive: sql<number>`count(*) filter (where ${e.replyClass} in ('interested', 'question'))::int`,
  unsubscribed: sql<number>`count(*) filter (where ${e.unsubscribedAt} is not null)::int`,
  complained: sql<number>`count(*) filter (where ${e.replyClass} = 'complaint')::int`,
  orders: sql<number>`count(${e.orderId})::int`,
};

export async function emailTotals() {
  const [row] = await db().select(totals).from(e);
  const [revenue] = await db()
    .select({ cents: sum(orders.amountCents) })
    .from(e)
    .innerJoin(orders, eq(orders.id, e.orderId));
  return { ...row!, revenueCents: Number(revenue?.cents ?? 0) };
}

/** Sends per day over the last two weeks, newest first. */
export async function dailyActivity(now = new Date()) {
  const day = sql<string>`to_char(${e.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  return db()
    .select({ day, ...totals })
    .from(e)
    .where(gte(e.sentAt, new Date(now.getTime() - 14 * 86_400_000)))
    .groupBy(day)
    .orderBy(desc(day));
}

export async function sourceRows() {
  return db()
    .select({
      id: directories.id,
      name: directories.name,
      url: directories.url,
      lastCrawledAt: outreachSources.lastCrawledAt,
      lastFound: outreachSources.lastFound,
      totalFound: outreachSources.totalFound,
      lastError: outreachSources.lastError,
    })
    .from(directories)
    .leftJoin(outreachSources, eq(outreachSources.directoryId, directories.id))
    .where(and(eq(directories.isStarred, true), eq(directories.isActive, true)))
    .orderBy(asc(directories.name));
}

/** Each mailbox in the list, with how it's doing, so one going bad stands out. */
export async function mailboxRows() {
  const e = outreachEmails;
  const [states, totals] = await Promise.all([
    db().select().from(outreachMailboxes),
    db()
      .select({
        address: e.fromAddress,
        sent: sql<number>`count(*) filter (where ${e.status} in ('sent', 'bounced'))::int`,
        bounced: sql<number>`count(*) filter (where ${e.status} = 'bounced')::int`,
        replied: sql<number>`count(${e.repliedAt})::int`,
      })
      .from(e)
      .groupBy(e.fromAddress),
  ]);
  return mailboxes().map((box) => ({
    address: box.address,
    canRead: Boolean(box.imapHost),
    state: states.find((s) => s.address === box.address) ?? null,
    totals: totals.find((t) => t.address === box.address) ?? { sent: 0, bounced: 0, replied: 0 },
  }));
}

export const EMAIL_FILTERS = ["all", "draft", "sent", "clicked", "replied", "bounced", "failed"] as const;
export type EmailFilter = (typeof EMAIL_FILTERS)[number];

function emailFilter(filter: EmailFilter) {
  switch (filter) {
    case "draft":
      return eq(e.status, "draft");
    case "sent":
      return eq(e.status, "sent");
    case "clicked":
      return sql`${e.firstClickAt} is not null`;
    case "replied":
      return sql`${e.repliedAt} is not null`;
    case "bounced":
      return eq(e.status, "bounced");
    case "failed":
      return or(eq(e.status, "failed"), eq(e.status, "sending"));
    default:
      return undefined;
  }
}

export async function listEmails(filter: EmailFilter, q: string, page = 0) {
  const search = q
    ? or(
        ilike(e.toAddress, `%${q}%`),
        ilike(outreachProspects.domain, `%${q}%`),
        ilike(outreachProspects.name, `%${q}%`),
      )
    : undefined;
  return db()
    .select({ email: e, prospect: outreachProspects, variant: outreachVariants.name })
    .from(e)
    .innerJoin(outreachProspects, eq(outreachProspects.id, e.prospectId))
    .innerJoin(outreachVariants, eq(outreachVariants.id, e.variantId))
    .where(and(emailFilter(filter), search))
    .orderBy(desc(sql`coalesce(${e.sentAt}, ${e.createdAt})`))
    .limit(PAGE)
    .offset(page * PAGE);
}

export async function getEmail(id: string) {
  const [row] = await db()
    .select({ email: e, prospect: outreachProspects, variant: outreachVariants, directory: directories.name })
    .from(e)
    .innerJoin(outreachProspects, eq(outreachProspects.id, e.prospectId))
    .innerJoin(outreachVariants, eq(outreachVariants.id, e.variantId))
    .leftJoin(directories, eq(directories.id, outreachProspects.directoryId))
    .where(eq(e.id, id))
    .limit(1);
  return row ?? null;
}

export const PROSPECT_FILTERS = [
  "all",
  "discovered",
  "qualified",
  "researched",
  "drafted",
  "rejected",
  "failed",
] as const;
export type ProspectFilter = (typeof PROSPECT_FILTERS)[number];

export async function listProspects(filter: ProspectFilter, q: string, page = 0) {
  const p = outreachProspects;
  return db()
    .select({ prospect: p, directory: directories.name })
    .from(p)
    .leftJoin(directories, eq(directories.id, p.directoryId))
    .where(
      and(
        filter === "all" ? undefined : eq(p.status, filter),
        q ? or(ilike(p.domain, `%${q}%`), ilike(p.name, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(p.updatedAt))
    .limit(PAGE)
    .offset(page * PAGE);
}

export async function listSuppressions() {
  return db().select().from(outreachSuppressions).orderBy(desc(outreachSuppressions.createdAt)).limit(200);
}

/** Staff saw a directory slip through, or simply don't want to contact a site: it stops here, for good. */
export async function blockDomain(domain: string) {
  await suppress("domain", domain, "manual");
  const p = outreachProspects;
  const stopped = await db()
    .update(p)
    .set({ status: "rejected", reason: "blocked_by_staff" })
    .where(and(eq(p.domain, domain), sql`${p.status} <> 'drafted'`))
    .returning({ id: p.id });
  const [drafted] = await db().select({ id: p.id }).from(p).where(eq(p.domain, domain));
  if (drafted) {
    await db()
      .update(e)
      .set({ status: "discarded", error: "Blocked by staff" })
      .where(and(eq(e.prospectId, drafted.id), eq(e.status, "draft")));
    await db().update(p).set({ status: "rejected", reason: "blocked_by_staff" }).where(eq(p.id, drafted.id));
  }
  return stopped.length;
}

export async function discardDraft(id: string) {
  const [row] = await db()
    .update(e)
    .set({ status: "discarded", error: "Discarded by staff" })
    .where(and(eq(e.id, id), eq(e.status, "draft")))
    .returning({ prospectId: e.prospectId });
  if (row) {
    await db()
      .update(outreachProspects)
      .set({ status: "rejected", reason: "discarded_by_staff" })
      .where(eq(outreachProspects.id, row.prospectId));
  }
}

/** Counts a click, unless it looks like a mail scanner following the link. */
export async function recordClick(token: string, userAgent: string | null, now = new Date()) {
  const [email] = await db().select().from(e).where(eq(e.token, token)).limit(1);
  if (!email) return;
  const age = email.sentAt ? (now.getTime() - email.sentAt.getTime()) / 1000 : 0;
  const scanner = !email.sentAt || looksLikeScanner(userAgent, age);
  await db()
    .insert(outreachClicks)
    .values({ emailId: email.id, userAgent: userAgent?.slice(0, 300) ?? null, scanner, clickedAt: now });
  if (scanner) return;
  await db()
    .update(e)
    .set({ clicks: sql`${e.clicks} + 1`, firstClickAt: sql`coalesce(${e.firstClickAt}, ${now})` })
    .where(eq(e.id, email.id));
}

/** One unsubscribe link, one address, forever. Unknown tokens quietly do nothing. */
export async function unsubscribeByToken(token: string, now = new Date()) {
  const [email] = await db().select().from(e).where(eq(e.token, token)).limit(1);
  if (!email) return false;
  await suppress("email", email.toAddress, "unsubscribed");
  await db()
    .update(e)
    .set({ unsubscribedAt: sql`coalesce(${e.unsubscribedAt}, ${now})` })
    .where(eq(e.id, email.id));
  return true;
}
