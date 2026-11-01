import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { env } from "@/env";
import { sendEmail } from "@/lib/email";
import { renderEmail, type Block, type Tone } from "@/lib/email-template";
import { limit } from "@/lib/billing/entitlements";
import { formatLimit } from "@/lib/billing/plans";
import { formatUsd, getSku } from "@/lib/payments/skus";
import { checkLink, targetDomain, type LinkCheckResult } from "@/lib/directories/verify";
import { captureEvidence, evidenceKey } from "@/lib/evidence";
import {
  BATCH_SIZE,
  CONCURRENCY,
  DEAD_AFTER,
  classifyChange,
  failed,
  mapPool,
  nextCheckAt,
  normalizeDomain,
  summarizeChanges,
  type Change,
} from "./rules";

const { trackedLinks, submissions, linkChecks, directories, submissionOrders } = schema;
export type TrackedLink = typeof trackedLinks.$inferSelect;

export class LinkError extends Error {}

const url = (path: string) => new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

async function mail(
  to: string,
  subject: string,
  heading: string,
  blocks: Block[],
  link: { label: string; href: string },
) {
  await sendEmail({
    to,
    ...renderEmail({
      variant: "customer",
      label: "Link Monitor",
      subject,
      reason: "Link Monitor checks your backlinks for you",
      blocks: [{ heading }, ...blocks, { button: link.label, href: link.href }],
    }),
  });
}

/**
 * Keeps a submission's tracked link in step with it: a live row with a URL is
 * monitored (owner = the maker, or the order's buyer), anything else isn't.
 * Called after the tracker or the ops console changes a row.
 */
export async function trackSubmission(submissionId: string, now = new Date()) {
  const s = await db().query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
  if (!s) return null;
  if (s.status !== "live" || !s.liveUrl) {
    await db().update(trackedLinks).set({ active: false }).where(eq(trackedLinks.submissionId, s.id));
    return null;
  }
  const domain = await targetDomain(s);
  if (!domain) return null;

  let owner: { ownerUserId: string | null; alertEmail: string | null; source: "tracker" | "order" };
  let stopped = false;
  if (s.productId) {
    const p = await db().query.products.findFirst({
      where: eq(schema.products.id, s.productId),
      columns: { createdBy: true },
    });
    owner = { ownerUserId: p?.createdBy ?? null, alertEmail: null, source: "tracker" };
  } else {
    const o = (await db().query.submissionOrders.findFirst({ where: eq(submissionOrders.id, s.submissionOrderId!) }))!;
    owner = { ownerUserId: o.userId, alertEmail: o.contactEmail ?? o.email, source: "order" };
    // Included monitoring is over: don't quietly restart it.
    stopped = o.monitorEndedAt !== null;
  }

  const liveAt = s.liveAt ?? now;
  const failures = s.linkVerdict && failed(s.linkVerdict) ? 1 : 0;
  const latest = {
    url: s.liveUrl,
    targetDomain: domain,
    expectedAnchor: null,
    lastVerdict: s.linkVerdict,
    lastRel: s.linkRel,
    lastAnchor: s.linkAnchor,
    lastStatusCode: s.linkHttpStatus,
    lastCheckedAt: s.linkCheckedAt,
    failures,
    liveAt,
    nextCheckAt: s.linkCheckedAt ? nextCheckAt(liveAt, s.linkCheckedAt, failures) : now,
  };
  const [row] = await db()
    .insert(trackedLinks)
    .values({ ...owner, ...latest, submissionId: s.id, active: !stopped })
    .onConflictDoUpdate({
      target: trackedLinks.submissionId,
      set: {
        ...latest,
        ownerUserId: owner.ownerUserId,
        alertEmail: owner.alertEmail,
        active: stopped ? sql`${trackedLinks.active}` : true,
      },
    })
    .returning();
  return row;
}

/** Manual links that count against the plan (tracker and order links don't). */
async function manualCount(userId: string) {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(trackedLinks)
    .where(and(eq(trackedLinks.ownerUserId, userId), eq(trackedLinks.source, "manual"), eq(trackedLinks.active, true)));
  return r.n;
}

export type LinkUsage = { used: number; limit: number; monitored: number };

/** "37 / 100" for the dashboard: manual links against the plan, plus everything monitored. */
export async function linkUsage(userId: string, now = new Date()): Promise<LinkUsage> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(trackedLinks)
    .where(and(eq(trackedLinks.ownerUserId, userId), eq(trackedLinks.active, true)));
  return { used: await manualCount(userId), limit: await limit(userId, "links", now), monitored: r.n };
}

export const addLinkInput = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => /^https?:\/\/\S+\.\S+$/i.test(u), "Paste the full URL of the page that links to you"),
  domain: z.string().trim().max(200),
  expectedAnchor: z.string().trim().max(200).optional(),
});

/** Adds a URL to monitor and checks it straight away. Counts against the plan. */
export async function addManualLink(userId: string, raw: z.input<typeof addLinkInput>, now = new Date()) {
  const input = addLinkInput.parse(raw);
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new LinkError("Enter your domain, like acme.io.");
  const [used, max] = await Promise.all([manualCount(userId), limit(userId, "links", now)]);
  if (used >= max) {
    throw new LinkError(
      `You're monitoring ${used} of ${formatLimit(max)} links on your plan. Remove one or upgrade to monitor more.`,
    );
  }
  const dupe = await db().query.trackedLinks.findFirst({
    where: and(eq(trackedLinks.ownerUserId, userId), eq(trackedLinks.url, input.url), eq(trackedLinks.active, true)),
  });
  if (dupe) throw new LinkError("You're already monitoring that URL.");
  const [row] = await db()
    .insert(trackedLinks)
    .values({
      ownerUserId: userId,
      url: input.url,
      targetDomain: domain,
      expectedAnchor: input.expectedAnchor || null,
      source: "manual",
      liveAt: now,
      nextCheckAt: now,
    })
    .returning();
  return (await runCheck(row, now)).link;
}

async function owned(userId: string, id: string) {
  const link = await db().query.trackedLinks.findFirst({
    where: and(eq(trackedLinks.id, id), eq(trackedLinks.ownerUserId, userId)),
  });
  if (!link) throw new LinkError("Not found.");
  return link;
}

/** Stops monitoring a manual link. Tracker and order links follow their submission. */
export async function removeLink(userId: string, id: string) {
  const link = await owned(userId, id);
  if (link.source !== "manual") {
    throw new LinkError("This link comes from your tracker or an order. Change it there.");
  }
  await db().delete(trackedLinks).where(eq(trackedLinks.id, id));
}

/** Re-checks one of the user's links now. Doesn't email: they're looking at the result. */
export async function recheckLink(userId: string, id: string, now = new Date()) {
  const link = await owned(userId, id);
  return (await runCheck(link, now)).link;
}

/** Recent checks for a link (its own and, for submissions, the ones run before monitoring). */
export async function linkHistory(userId: string, id: string) {
  const link = await owned(userId, id);
  return db()
    .select()
    .from(linkChecks)
    .where(
      link.submissionId
        ? or(eq(linkChecks.trackedLinkId, id), eq(linkChecks.submissionId, link.submissionId))
        : eq(linkChecks.trackedLinkId, id),
    )
    .orderBy(desc(linkChecks.checkedAt))
    .limit(30);
}

/** A user's links, newest problems first, with the directory name when there is one. */
export async function linksForUser(userId: string) {
  return db()
    .select({ link: trackedLinks, directory: directories.name })
    .from(trackedLinks)
    .leftJoin(submissions, eq(submissions.id, trackedLinks.submissionId))
    .leftJoin(directories, eq(directories.id, submissions.directoryId))
    .where(eq(trackedLinks.ownerUserId, userId))
    .orderBy(
      desc(trackedLinks.active),
      sql`case ${trackedLinks.lastVerdict} when 'dofollow' then 2 when 'nofollow' then 1 else 0 end`,
      asc(trackedLinks.createdAt),
    );
}

export function linksCsv(rows: Awaited<ReturnType<typeof linksForUser>>): string {
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["url", "target", "directory", "source", "verdict", "rel", "anchor", "http_status", "checked_at"];
  const lines = rows.map(({ link: l, directory }) =>
    [
      l.url,
      l.targetDomain,
      directory,
      l.source,
      l.lastVerdict,
      l.lastRel,
      l.lastAnchor,
      l.lastStatusCode,
      l.lastCheckedAt,
    ]
      .map(q)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

type CheckOutcome = { link: TrackedLink; change: Change | null; result: LinkCheckResult };

/**
 * Checks one tracked link: records the check, updates the link and its
 * schedule, and keeps the submission's columns in step. Two failures in a
 * row mark a live submission dead; a good check brings it back.
 */
async function runCheck(link: TrackedLink, now: Date): Promise<CheckOutcome> {
  const result = await checkLink(link.url, link.targetDomain);
  const failures = failed(result.verdict) ? link.failures + 1 : 0;
  const change = classifyChange(link.lastVerdict, result.verdict, link.failures, failures);
  // Evidence of every change: what the listing looked like when it turned nofollow, vanished or came back.
  const evidenceUrl = change ? await captureEvidence(link.url, evidenceKey(link.submissionId ?? link.id, now)) : null;

  await db()
    .insert(linkChecks)
    .values({ trackedLinkId: link.id, submissionId: link.submissionId, checkedAt: now, ...result, evidenceUrl });
  const [updated] = await db()
    .update(trackedLinks)
    .set({
      lastVerdict: result.verdict,
      lastRel: result.rel,
      lastAnchor: result.anchor,
      lastStatusCode: result.httpStatus,
      lastCheckedAt: now,
      failures,
      nextCheckAt: nextCheckAt(link.liveAt, now, failures),
    })
    .where(eq(trackedLinks.id, link.id))
    .returning();

  if (link.submissionId) {
    const s = await db().query.submissions.findFirst({
      where: eq(submissions.id, link.submissionId),
      columns: { status: true },
    });
    const status =
      s?.status === "live" && failures >= DEAD_AFTER
        ? ("dead" as const)
        : s?.status === "dead" && !failed(result.verdict)
          ? ("live" as const)
          : undefined;
    await db()
      .update(submissions)
      .set({
        linkVerdict: result.verdict,
        linkRel: result.rel,
        linkAnchor: result.anchor,
        linkHttpStatus: result.httpStatus,
        linkCheckedAt: now,
        ...(status ? { status } : {}),
        ...(evidenceUrl ? { evidenceUrl } : {}),
      })
      .where(eq(submissions.id, link.submissionId));
  }
  return { link: updated ?? link, change, result };
}

/** Ids of a user's manual links beyond their plan (the oldest are kept), which aren't checked until there's room. */
export async function pausedLinkIds(userId: string, now = new Date()) {
  const max = await limit(userId, "links", now);
  const rows = await db()
    .select({ id: trackedLinks.id })
    .from(trackedLinks)
    .where(and(eq(trackedLinks.ownerUserId, userId), eq(trackedLinks.source, "manual"), eq(trackedLinks.active, true)))
    .orderBy(asc(trackedLinks.createdAt), asc(trackedLinks.id))
    .offset(max);
  return new Set(rows.map((r) => r.id));
}

async function overLimit(links: TrackedLink[], now: Date): Promise<Set<string>> {
  const owners = new Set(links.filter((l) => l.source === "manual" && l.ownerUserId).map((l) => l.ownerUserId!));
  const skip = new Set<string>();
  for (const owner of owners) for (const id of await pausedLinkIds(owner, now)) skip.add(id);
  return skip;
}

const CHANGE_CHIP: Record<Change, { label: string; tone: Tone }> = {
  nofollow: { label: "Now nofollow", tone: "warn" },
  removed: { label: "Removed or unreachable", tone: "bad" },
  recovered: { label: "Dofollow again", tone: "good" },
};

/** One email per owner per run, summarising what changed. */
async function sendAlerts(outcomes: CheckOutcome[]) {
  const changed = outcomes.filter((o): o is CheckOutcome & { change: Change } => o.change !== null);
  if (changed.length === 0) return 0;
  const names = new Map(
    (
      await db()
        .select({ id: submissions.id, name: directories.name, token: submissionOrders.intakeToken })
        .from(submissions)
        .innerJoin(directories, eq(directories.id, submissions.directoryId))
        .leftJoin(submissionOrders, eq(submissionOrders.id, submissions.submissionOrderId))
        .where(
          inArray(
            submissions.id,
            changed.map((c) => c.link.submissionId).filter((id): id is string => id !== null),
          ),
        )
    ).map((r) => [r.id, r]),
  );

  const groups = new Map<string, Array<CheckOutcome & { change: Change }>>();
  for (const c of changed) {
    const key = c.link.ownerUserId ? `u:${c.link.ownerUserId}` : c.link.alertEmail ? `e:${c.link.alertEmail}` : null;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  let sent = 0;
  for (const [key, items] of groups) {
    let to: string | null;
    let href: string;
    if (key.startsWith("u:")) {
      const u = await db().query.user.findFirst({ where: eq(schema.user.id, key.slice(2)), columns: { email: true } });
      to = u?.email ?? null;
      href = url("/dashboard/links");
    } else {
      to = key.slice(2);
      const token = items.map((i) => names.get(i.link.submissionId ?? "")?.token).find(Boolean);
      href = token ? url(`/orders/${token}`) : url("/dashboard/links");
    }
    if (!to) continue;
    const summary = summarizeChanges(items.map((i) => i.change));
    const bad = items.some((i) => i.change !== "recovered");
    const rows = items.map((i) => {
      const name = names.get(i.link.submissionId ?? "")?.name;
      return {
        name: name ?? i.link.url,
        detail: name ? i.link.url : undefined,
        href: i.link.url,
        chip: CHANGE_CHIP[i.change],
      };
    });
    await mail(
      to,
      `Link Monitor: ${summary}`,
      bad ? "Some of your backlinks changed" : "Some of your backlinks are back",
      [
        { text: bad ? "Here's what changed since our last check." : "Good news: these links are followed again." },
        { items: rows },
        ...(bad
          ? [
              {
                text: "A directory may have changed its link policy or removed the listing. It's worth checking the page and contacting the directory.",
              },
            ]
          : []),
      ],
      { label: "See all your links", href },
    );
    sent++;
  }
  return sent;
}

const addMonths = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
};

/** When an order's included monitoring ends (from delivery). */
export const monitorEnd = (deliveredAt: Date, months: number) => addMonths(deliveredAt, months);

/**
 * Orders whose included monitoring has ended: their links move onto the
 * buyer's plan if it has room, otherwise monitoring stops and we suggest
 * Maker Pro. Each order is handled once.
 */
export async function endIncludedMonitoring(now = new Date()) {
  const due = await db()
    .select()
    .from(submissionOrders)
    .where(
      and(
        isNotNull(submissionOrders.monitorUntil),
        lte(submissionOrders.monitorUntil, ts(now)),
        isNull(submissionOrders.monitorEndedAt),
      ),
    );
  let kept = 0;
  let stopped = 0;
  for (const o of due) {
    const [claimed] = await db()
      .update(submissionOrders)
      .set({ monitorEndedAt: now })
      .where(and(eq(submissionOrders.id, o.id), isNull(submissionOrders.monitorEndedAt)))
      .returning({ id: submissionOrders.id });
    if (!claimed) continue;
    const ids = (
      await db()
        .select({ id: trackedLinks.id })
        .from(trackedLinks)
        .innerJoin(submissions, eq(submissions.id, trackedLinks.submissionId))
        .where(
          and(eq(submissions.submissionOrderId, o.id), eq(trackedLinks.source, "order"), eq(trackedLinks.active, true)),
        )
    ).map((r) => r.id);
    if (ids.length === 0) continue;

    const room = o.userId ? (await limit(o.userId, "links", now)) - (await manualCount(o.userId)) : 0;
    const to = o.contactEmail ?? o.email;
    if (o.userId && room >= ids.length) {
      await db().update(trackedLinks).set({ source: "manual" }).where(inArray(trackedLinks.id, ids));
      kept++;
      await mail(
        to,
        `Monitoring for ${o.productName ?? "your order"} continues on your plan`,
        "Your links stay monitored",
        [
          {
            text: `The Link Monitor included with your order has ended. Your plan has room, so we keep checking all ${ids.length} links: they now count toward your plan.`,
          },
        ],
        { label: "See your links", href: url("/dashboard/links") },
      );
    } else {
      await db().update(trackedLinks).set({ active: false }).where(inArray(trackedLinks.id, ids));
      stopped++;
      await mail(
        to,
        `Link Monitor for ${o.productName ?? "your order"} has ended`,
        "Your included Link Monitor has ended",
        [
          {
            text: `The Link Monitor included with your order has ended, so we've stopped checking its ${ids.length} live links.`,
          },
          {
            callout: "Keep getting alerts",
            text: `Directories change their link policies and remove listings over time. Maker Pro is ${formatUsd(getSku("sub_maker_pro_monthly")!.amountCents)}/month and covers 100 links, with weekly checks.`,
          },
        ],
        { label: "Keep monitoring", href: url("/dashboard/links") },
      );
    }
  }
  return { kept, stopped };
}

/**
 * Daily: checks links that are due (oldest first, taking turns between owners so
 * one big account can't fill the bounded batch), then emails each owner what changed. Ends included monitoring first.
 */
export async function monitorLinks(now = new Date()) {
  const ended = await endIncludedMonitoring(now);
  const due = await db()
    .select()
    .from(trackedLinks)
    .where(and(eq(trackedLinks.active, true), lte(trackedLinks.nextCheckAt, ts(now))))
    .orderBy(
      sql`row_number() over (partition by ${trackedLinks.ownerUserId} order by ${trackedLinks.nextCheckAt})`,
      asc(trackedLinks.nextCheckAt),
    )
    .limit(BATCH_SIZE);
  const skip = await overLimit(due, now);
  const later = new Date(now.getTime() + 7 * 86_400_000);
  if (skip.size) {
    await db()
      .update(trackedLinks)
      .set({ nextCheckAt: later })
      .where(inArray(trackedLinks.id, [...skip]));
  }
  const outcomes = await mapPool(
    due.filter((l) => !skip.has(l.id)),
    CONCURRENCY,
    (l) => runCheck(l, now),
  );
  const alerts = await sendAlerts(outcomes);
  return { checked: outcomes.length, skipped: skip.size, alerts, ...ended };
}
