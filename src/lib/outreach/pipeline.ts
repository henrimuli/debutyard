import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SearchDownError } from "@/lib/links/serp";
import { env } from "@/env";
import { site } from "@/config/site";
import { geminiConfigured } from "@/lib/ai/gemini";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { drEnabled } from "@/lib/metrics/service";
import { UnsafeUrlError } from "@/lib/net";
import { crawlDirectory } from "./discover";
import { pollMailbox } from "./inbox";
import { canSend, mailbox, MailboxUnavailable, mailboxes } from "./mailbox";
import { qualify, isOffLimits } from "./qualify";
import { researchProspect, serpSearch } from "./research";
import { dailyTarget, healthProblem, pickSender, registrableDomain, sendsDue } from "./rules";
import { getSettings, saveMailboxState, updateSettings } from "./settings";
import { isSuppressed } from "./suppressions";
import { ensureSeeds, pickVariant, proposeIfDue, retireLosers, variantStats } from "./variants";
import { writeEmail } from "./writer";

/**
 * Three separate jobs, each on its own schedule: reading replies, finding and
 * researching businesses, and writing and sending. They only meet in the
 * prospect list. Each prospect moves one stage at a time and its state is saved
 * after every stage, so a run that runs out of time just stops, and the next one
 * carries on. Each send is claimed before it goes.
 */

const { directories, orders, outreachEmails, outreachMailboxes, outreachProspects, outreachSources, submissionOrders } =
  schema;

type Prospect = typeof outreachProspects.$inferSelect;

const DAY = 86_400_000;
/** Vercel stops the function at 300s. */
const BUDGET_MS = 270_000;
/** Nothing new starts with less than this left: research takes a while. */
const STAGE_MS = 60_000;
const MAX_ATTEMPTS = 3;
/** A draft older than this would be congratulating someone on old news. */
const DRAFT_MAX_DAYS = 3;
/** Directories read per run. */
const MAX_CRAWLS = 2;
/** How long to leave a directory before reading it again. */
const RECRAWL_MS = 6 * 3_600_000;
const HEALTH_WINDOW = 50;
/** Days of sending to keep researched and ready. Research costs money and goes stale, so it stops here. */
const READY_DAYS = 2;

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** What the pipeline needs that isn't there yet. */
export function missingForPipeline(): string[] {
  const missing: string[] = [];
  if (!geminiConfigured()) missing.push("GEMINI_API_KEY");
  if (!drEnabled()) missing.push("AHREFS_API_KEY");
  if (!serpSearch()) missing.push("WORKER_URL and WORKER_SECRET");
  return missing;
}

/** Live only ever means production with a mailbox: previews and local runs write drafts instead. */
export function canGoLive() {
  return env().VERCEL_ENV === "production" && canSend();
}

const reject = (id: string, reason: string, detail?: string) =>
  db()
    .update(outreachProspects)
    .set({ status: "rejected", reason, reasonDetail: detail?.slice(0, 500) ?? null })
    .where(eq(outreachProspects.id, id));

/** Runs one stage of one prospect. A failure counts against it, and the third one drops it. */
async function advance(p: Prospect, maxAuthority: number, now: Date, onSearchWorked?: () => void): Promise<boolean> {
  try {
    if (p.status === "discovered") {
      const v = await qualify(p);
      if (!v.ok) {
        await reject(p.id, v.reason, v.detail);
        return false;
      }
      await db()
        .update(outreachProspects)
        .set({
          status: "qualified",
          name: v.name,
          websiteUrl: v.websiteUrl,
          email: v.email,
          emailSourceUrl: v.emailSourceUrl,
          classification: v.classification,
          attempts: 0,
          reasonDetail: null,
        })
        .where(eq(outreachProspects.id, p.id));
      return false;
    }
    if (p.status === "qualified") {
      const r = await researchProspect(p, maxAuthority, onSearchWorked);
      if (!r.ok) {
        await reject(p.id, r.reason, r.detail);
        return false;
      }
      await db()
        .update(outreachProspects)
        .set({ status: "researched", research: r.research, attempts: 0, reasonDetail: null })
        .where(eq(outreachProspects.id, p.id));
      return false;
    }
    if (p.status === "researched") {
      const variant = await pickVariant();
      if (!variant) throw new Error("No version of the pitch is being tested");
      const off = await isOffLimits(p.domain, p.email);
      if (off) {
        await reject(p.id, "off_limits", off);
        return false;
      }
      const written = await writeEmail(p, variant);
      if (!written.ok) {
        // The research is paid for, so the next run writes it again before giving up.
        const detail = written.problems.join("; ");
        if (p.attempts + 1 >= MAX_ATTEMPTS) await reject(p.id, "draft_invalid", detail);
        else
          await db()
            .update(outreachProspects)
            .set({ attempts: p.attempts + 1, reasonDetail: detail.slice(0, 500) })
            .where(eq(outreachProspects.id, p.id));
        return false;
      }
      const inserted = await db()
        .insert(outreachEmails)
        .values({ prospectId: p.id, variantId: variant.id, ...written.email, createdAt: now })
        .onConflictDoNothing()
        .returning({ id: outreachEmails.id });
      if (!inserted.length) {
        await reject(p.id, "off_limits", "this address already has an email from us");
        return false;
      }
      await db().update(outreachProspects).set({ status: "drafted" }).where(eq(outreachProspects.id, p.id));
      return true;
    }
    return false;
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      await reject(p.id, "unreachable", "not a public address");
      return false;
    }
    // Not this business's fault, so it costs no attempt. The run stops rather than wearing out the rest.
    if (err instanceof SearchDownError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("outreach step failed", p.domain, p.status, err);
    const attempts = p.attempts + 1;
    await db()
      .update(outreachProspects)
      .set({
        attempts,
        reasonDetail: message.slice(0, 500),
        ...(attempts >= MAX_ATTEMPTS ? { status: "failed" as const, reason: `${p.status}_error` } : {}),
      })
      .where(eq(outreachProspects.id, p.id));
    return false;
  }
}

/** The prospect closest to being an email, then the oldest. */
async function nextProspect(skip: Set<string>, stages: Array<Prospect["status"]>): Promise<Prospect | null> {
  const rows = await db()
    .select()
    .from(outreachProspects)
    .where(inArray(outreachProspects.status, stages))
    .orderBy(
      sql`case ${outreachProspects.status} when 'researched' then 0 when 'qualified' then 1 else 2 end`,
      asc(outreachProspects.discoveredAt),
    )
    .limit(skip.size + 1);
  return rows.find((r) => !skip.has(r.id)) ?? null;
}

/** The starred directory read longest ago, unless all were read just now. */
async function nextDirectory(now: Date, skip: Set<string>) {
  const rows = await db()
    .select({ id: directories.id, name: directories.name, url: directories.url, last: outreachSources.lastCrawledAt })
    .from(directories)
    .leftJoin(outreachSources, eq(outreachSources.directoryId, directories.id))
    .where(
      and(
        eq(directories.isStarred, true),
        eq(directories.isActive, true),
        or(
          isNull(outreachSources.lastCrawledAt),
          lt(outreachSources.lastCrawledAt, new Date(now.getTime() - RECRAWL_MS)),
        ),
      ),
    )
    .orderBy(sql`${outreachSources.lastCrawledAt} asc nulls first`);
  return rows.find((r) => !skip.has(r.id)) ?? null;
}

async function draftsWaiting(now: Date, live: boolean) {
  const e = outreachEmails;
  const [row] = await db()
    .select({ n: count() })
    .from(e)
    .where(
      and(
        eq(e.status, "draft"),
        // A dry run keeps a day's worth at a time, and holds on to them for review.
        gte(e.createdAt, live ? new Date(now.getTime() - DRAFT_MAX_DAYS * DAY) : startOfUtcDay(now)),
      ),
    );
  return row?.n ?? 0;
}

/** Drafts past their date stop being sendable. The prospect stays used up: its launch has gone by. */
async function expireDrafts(now: Date) {
  const stale = await db()
    .update(outreachEmails)
    .set({ status: "discarded", error: "Draft went stale" })
    .where(
      and(
        eq(outreachEmails.status, "draft"),
        lt(outreachEmails.createdAt, new Date(now.getTime() - DRAFT_MAX_DAYS * DAY)),
      ),
    )
    .returning({ id: outreachEmails.prospectId });
  if (stale.length) {
    await db()
      .update(outreachProspects)
      .set({ status: "rejected", reason: "stale_draft" })
      .where(
        inArray(
          outreachProspects.id,
          stale.map((s) => s.id),
        ),
      );
  }
  return stale.length;
}

const usedToday = (now: Date) =>
  and(
    inArray(outreachEmails.status, ["sending", "sent", "failed", "bounced"]),
    gte(outreachEmails.sentAt, startOfUtcDay(now)),
  );

export async function sentToday(now: Date) {
  const [row] = await db().select({ n: count() }).from(outreachEmails).where(usedToday(now));
  return row?.n ?? 0;
}

/** Today's sends per mailbox address. */
export async function sentTodayByMailbox(now: Date): Promise<Record<string, number>> {
  const e = outreachEmails;
  const rows = await db()
    .select({ address: e.fromAddress, n: count() })
    .from(e)
    .where(usedToday(now))
    .groupBy(e.fromAddress);
  return Object.fromEntries(rows.flatMap((r) => (r.address ? [[r.address, r.n]] : [])));
}

/**
 * Sends one draft from the least used mailbox. Claiming it first means a second
 * run can't pick it up, and a crash after the claim leaves it unsent rather than
 * risking a repeat. A mailbox that turned it away unsent hands it to the next one.
 */
export async function sendDraft(
  id: string,
  now = new Date(),
  unavailable = new Set<string>(),
): Promise<"sent" | "skipped" | "failed" | "no_mailbox"> {
  const e = outreachEmails;
  const [draft] = await db().select().from(e).where(eq(e.id, id)).limit(1);
  if (!draft || draft.status !== "draft") return "skipped";
  const [prospect] = await db().select().from(outreachProspects).where(eq(outreachProspects.id, draft.prospectId));
  if (!prospect) return "skipped";
  if (await isSuppressed(draft.toAddress, prospect.domain)) {
    await db().update(e).set({ status: "discarded", error: "On the block list by send time" }).where(eq(e.id, id));
    return "skipped";
  }
  const box = pickSender(mailboxes(), await sentTodayByMailbox(now), unavailable);
  if (!box) return "no_mailbox";
  const [claimed] = await db()
    .update(e)
    .set({
      status: "sending",
      sentAt: now,
      fromAddress: box.address,
      // Matching the From domain, and saved here so replies still find it.
      messageId: draft.messageId.replace(/@[^@>]+>$/, `@${box.address.split("@")[1]}>`),
    })
    .where(and(eq(e.id, id), eq(e.status, "draft")))
    .returning();
  if (!claimed) return "skipped";
  const unsubscribe = `${site.url}/u/${claimed.token}`;
  try {
    await mailbox().send(box, {
      to: claimed.toAddress,
      subject: claimed.subject,
      text: claimed.body,
      messageId: claimed.messageId,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("outreach send failed", box.address, claimed.toAddress, err);
    if (err instanceof MailboxUnavailable) {
      await saveMailboxState(box.address, { sendError: message.slice(0, 500), sendErrorAt: now });
      await db().update(e).set({ status: "draft", sentAt: null, fromAddress: null }).where(eq(e.id, id));
      unavailable.add(box.address);
      return sendDraft(id, now, unavailable);
    }
    await db()
      .update(e)
      .set({ status: "failed", error: message.slice(0, 500) })
      .where(eq(e.id, id));
    return "failed";
  }
  await db().update(e).set({ status: "sent" }).where(eq(e.id, id));
  await db()
    .update(outreachMailboxes)
    .set({ sendError: null, sendErrorAt: null })
    .where(and(eq(outreachMailboxes.address, box.address), isNotNull(outreachMailboxes.sendError)));
  return "sent";
}

async function sendWhatsDue(now: Date, limit: number) {
  const due = sendsDue(now, dailyTarget(limit, mailboxes().length), await sentToday(now));
  if (due === 0) return { sent: 0, failed: 0 };
  const e = outreachEmails;
  const drafts = await db()
    .select({ id: e.id })
    .from(e)
    .where(eq(e.status, "draft"))
    .orderBy(asc(e.createdAt))
    .limit(due);
  let sent = 0;
  let failed = 0;
  // Shared across the run, so a broken mailbox costs one try rather than one per draft.
  const unavailable = new Set<string>();
  for (const d of drafts) {
    const r = await sendDraft(d.id, now, unavailable);
    if (r === "sent") sent++;
    if (r === "failed") failed++;
    if (r === "no_mailbox") break;
  }
  return { sent, failed };
}

/** Drops to dry run when recent sends look unhealthy, and tells staff. Sending stays off until someone turns it back on. */
export async function checkHealth(now: Date, since: Date | null) {
  const e = outreachEmails;
  const recent = await db()
    .select({ status: e.status, replyClass: e.replyClass })
    .from(e)
    .where(and(inArray(e.status, ["sent", "bounced"]), since ? gte(e.sentAt, since) : undefined))
    .orderBy(desc(e.sentAt))
    .limit(HEALTH_WINDOW);
  const problem = healthProblem({
    sent: recent.length,
    bounced: recent.filter((r) => r.status === "bounced").length,
    complained: recent.filter((r) => r.replyClass === "complaint").length,
  });
  if (!problem) return null;
  await updateSettings({ mode: "dry_run", pausedReason: problem });
  const to = env().ADMIN_EMAIL;
  if (to) {
    const email = renderEmail({
      variant: "staff",
      label: "Outreach",
      subject: "Outreach paused",
      trigger: `Health check at ${now.toISOString()}.`,
      blocks: [
        { heading: "Cold email has stopped sending" },
        { text: `Outreach dropped to dry run because of ${problem}. It stays there until you turn it back on.` },
        { button: "Open outreach", href: `${site.url}/admin/outreach` },
      ],
    });
    await sendEmail({ to, ...email }).catch((err) => console.error("outreach pause alert failed", err));
  }
  return problem;
}

/** Ties paid submission orders back to the email that reached them, by address or website. */
export async function attributeOrders(now = new Date()) {
  const e = outreachEmails;
  const open = await db()
    .select({ id: e.id, to: e.toAddress, sentAt: e.sentAt, domain: outreachProspects.domain })
    .from(e)
    .innerJoin(outreachProspects, eq(outreachProspects.id, e.prospectId))
    .where(
      and(isNull(e.orderId), inArray(e.status, ["sent", "bounced"]), gte(e.sentAt, new Date(now.getTime() - 90 * DAY))),
    );
  if (open.length === 0) return 0;
  const paid = await db()
    .select({
      id: orders.id,
      paidAt: orders.paidAt,
      email: orders.email,
      contact: submissionOrders.contactEmail,
      website: submissionOrders.websiteUrl,
    })
    .from(submissionOrders)
    .innerJoin(orders, eq(orders.id, submissionOrders.orderId))
    .where(and(eq(orders.status, "paid"), gte(orders.paidAt, new Date(now.getTime() - 90 * DAY))));
  let tied = 0;
  for (const o of paid) {
    const domain = o.website ? registrableDomain(o.website) : null;
    const hit = open.find(
      (m) =>
        m.sentAt &&
        o.paidAt &&
        m.sentAt < o.paidAt &&
        (m.to === o.email.toLowerCase() || m.to === o.contact?.toLowerCase() || (domain && m.domain === domain)),
    );
    if (!hit) continue;
    await db().update(e).set({ orderId: o.id, convertedAt: o.paidAt }).where(eq(e.id, hit.id));
    tied++;
  }
  return tied;
}

/** Hourly, whatever the mode: replies, bounces and opt-outs must never wait. */
export async function readReplies(now = new Date()) {
  return {
    inbox: await pollMailbox(now).catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
    orders: await attributeOrders(now),
  };
}

async function researchedWaiting() {
  const [row] = await db()
    .select({ n: count() })
    .from(outreachProspects)
    .where(eq(outreachProspects.status, "researched"));
  return row?.n ?? 0;
}

/** Finds and researches businesses until a couple of days' sending is ready, then stops. Sends nothing. */
export async function runResearch(now = new Date(), budgetMs = BUDGET_MS) {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const settings = await getSettings();
  if (settings.mode === "off") return { mode: settings.mode };
  const missing = missingForPipeline();
  if (missing.length) return { mode: settings.mode, skipped: `missing ${missing.join(", ")}` };

  const goal = READY_DAYS * dailyTarget(settings.dailyLimit, mailboxes().length);
  let ready = (await researchedWaiting()) + (await draftsWaiting(now, settings.mode === "live"));
  let crawls = 0;
  let stages = 0;
  // The dashboard tells a run whose searches worked from one that never searched (see search-health.ts).
  let searched = false;
  const skip = new Set<string>();
  const crawled = new Set<string>();
  while (ready < goal && left() > STAGE_MS) {
    const p = await nextProspect(skip, ["qualified", "discovered"]);
    if (p) {
      // One stage a turn per prospect, so a failing one can't hold up the run.
      stages++;
      try {
        await advance(p, settings.maxAuthority, now, () => {
          searched = true;
        });
      } catch (err) {
        if (!(err instanceof SearchDownError)) throw err;
        console.error("outreach research stopped", p.domain, err);
        return { mode: settings.mode, goal, ready, crawls, stages, searched, searchDown: err.message };
      }
      const [after] = await db()
        .select({ status: outreachProspects.status })
        .from(outreachProspects)
        .where(eq(outreachProspects.id, p.id));
      if (after?.status === "researched") ready++;
      else if (after?.status === p.status) skip.add(p.id);
      continue;
    }
    if (crawls >= MAX_CRAWLS) break;
    const dir = await nextDirectory(now, crawled);
    if (!dir) break;
    crawled.add(dir.id);
    crawls++;
    await crawlDirectory(dir, now).catch(async (err) => {
      console.error("outreach crawl failed", dir.name, err);
      const message = err instanceof Error ? err.message.slice(0, 300) : "crawl failed";
      await db()
        .insert(outreachSources)
        .values({ directoryId: dir.id, lastCrawledAt: now, lastError: message })
        .onConflictDoUpdate({
          target: outreachSources.directoryId,
          set: { lastCrawledAt: now, lastError: message },
        });
    });
  }
  return { mode: settings.mode, goal, ready, crawls, stages, searched };
}

/** Writes emails for whoever is researched and sends what's due. Doesn't care when research last ran. */
export async function runSending(now = new Date(), budgetMs = BUDGET_MS) {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const settings = await getSettings();
  const result: Record<string, unknown> = { mode: settings.mode };
  if (settings.mode === "off") return result;
  if (!geminiConfigured()) return { ...result, skipped: "missing GEMINI_API_KEY" };

  await ensureSeeds();
  const rows = await variantStats();
  result.retired = await retireLosers(now, rows);
  await proposeIfDue(rows, now).catch((err) => console.error("outreach variant proposal failed", err));

  let live = settings.mode === "live" && canGoLive();
  if (settings.mode === "live" && !live) result.notLive = "Live needs production and a mailbox: writing drafts only";
  if (live) {
    const problem = await checkHealth(now, settings.healthFrom);
    if (problem) {
      result.paused = problem;
      live = false;
    }
    result.expired = await expireDrafts(now);
  }

  // Enough drafts for a day's sending, and no more: each one costs money and goes stale.
  const skip = new Set<string>();
  let drafted = 0;
  let waiting = await draftsWaiting(now, live);
  const target = dailyTarget(settings.dailyLimit, mailboxes().length);
  while (waiting < target && left() > STAGE_MS) {
    const p = await nextProspect(skip, ["researched"]);
    if (!p) break;
    skip.add(p.id);
    if (await advance(p, settings.maxAuthority, now)) {
      drafted++;
      waiting++;
    }
  }
  Object.assign(result, { drafted, waiting });

  if (live) result.send = await sendWhatsDue(now, settings.dailyLimit);
  return result;
}

/** Proves every mailbox works by sending the newest draft to staff from each. Drafts and counts don't change. */
export async function sendTest(to: string) {
  const boxes = mailboxes();
  if (boxes.length === 0) throw new Error("Set OUTREACH_MAILBOXES and OUTREACH_SMTP_HOST first.");
  const [draft] = await db().select().from(outreachEmails).orderBy(desc(outreachEmails.createdAt)).limit(1);
  const now = new Date();
  const failed: string[] = [];
  for (const box of boxes) {
    try {
      await mailbox().send(box, {
        to,
        subject: draft ? `[Test] ${draft.subject}` : "[Test] Outreach mailbox",
        text: draft?.body ?? `This is a test from ${box.from}.`,
        messageId: `<test-${randomUUID()}@${box.address.split("@")[1]}>`,
      });
      await saveMailboxState(box.address, { sendError: null, sendErrorAt: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await saveMailboxState(box.address, { sendError: message.slice(0, 500), sendErrorAt: now });
      failed.push(box.address);
    }
  }
  return { sent: boxes.length - failed.length, failed };
}
