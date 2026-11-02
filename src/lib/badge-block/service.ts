import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchPage, fetchRendered } from "@/lib/fetch-page";
import { SubmissionError, type SubmissionOrder } from "@/lib/submissions/service";
import { blockHtml, blockScript } from "./render";
import { sanitizeBadge } from "./sanitize";

const { submissionOrders: orders, submissions, directories } = schema;

/** A row's badge shows while the row is meant to end in a listing: not once it's swapped, rejected, skipped or dead. */
const SHOWING = ["todo", "submitted", "pending", "needs_action", "live"] as const;
const ORDER_SHOWING = ["queued", "in_progress", "delivered"];
const CHECK_GAP_MS = 10_000;

/** The badges an order's block shows now. A cancelled order's block empties by itself. */
async function liveBadges(order: Pick<SubmissionOrder, "id" | "status" | "badgePreference">) {
  if (order.badgePreference !== "allow" || !ORDER_SHOWING.includes(order.status)) return [];
  const rows = await db()
    .select({ code: submissions.badgeCode, name: directories.name })
    .from(submissions)
    .innerJoin(directories, eq(directories.id, submissions.directoryId))
    .where(
      and(
        eq(submissions.submissionOrderId, order.id),
        inArray(submissions.status, [...SHOWING]),
        isNotNull(submissions.badgeCode),
      ),
    )
    .orderBy(asc(directories.name));
  return rows.map((r) => ({ name: r.name, code: r.code! }));
}

export async function liveBadgeCount(order: SubmissionOrder) {
  return (await liveBadges(order)).length;
}

/** What a maker's site loads: both forms of the block, or null for a key we don't know. */
export async function publicBlock(key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) return null;
  const order = await db().query.submissionOrders.findFirst({ where: eq(orders.blockKey, key) });
  if (!order) return null;
  const badges = (await liveBadges(order)).map((b) => b.code);
  const html = blockHtml(key, badges);
  return { html, script: blockScript(html, badges.length > 0) };
}

export type InstallCheck = { found: true } | { found: false; reason: "unreachable" | "blocked" | "missing" };

/**
 * Looks for the order's key on its website: first in the raw HTML, which also
 * proves plain-fetch directories will see the block, then in the rendered page,
 * for a block installed some other way that only shows up once scripts run.
 */
export async function findBlock(order: Pick<SubmissionOrder, "websiteUrl" | "blockKey">): Promise<InstallCheck> {
  const url = order.websiteUrl;
  if (!url) return { found: false, reason: "unreachable" };
  let reason: "unreachable" | "blocked" | "missing" = "unreachable";
  try {
    const page = await fetchPage(url, { purpose: "verify", fallback: false, timeoutMs: 10_000 });
    if (page.status < 400 && page.body.includes(order.blockKey)) return { found: true };
    reason = page.blocked ? "blocked" : page.status < 400 ? "missing" : "unreachable";
  } catch {
    // A site that's down, or a URL we won't fetch: the rendered check below decides.
  }
  const rendered = await fetchRendered(url);
  if (rendered && rendered.status < 400) {
    return rendered.body.includes(order.blockKey) ? { found: true } : { found: false, reason: "missing" };
  }
  return { found: false, reason };
}

/** The "Check my site" button during intake. Finding the block is what lets the order go in. */
export async function checkIntakeBlock(order: SubmissionOrder, now = new Date()): Promise<InstallCheck> {
  if (order.status !== "awaiting_intake") throw new SubmissionError("We already have your details.");
  if (!order.websiteUrl || !order.intakeDraftAt) throw new SubmissionError("Save your details first.");
  if (order.blockCheckedAt && now.getTime() - order.blockCheckedAt.getTime() < CHECK_GAP_MS) {
    throw new SubmissionError("We only just checked. Give it a few seconds and try again.");
  }
  await db().update(orders).set({ blockCheckedAt: now }).where(eq(orders.id, order.id));
  const result = await findBlock(order);
  if (result.found) {
    await db()
      .update(orders)
      .set({ blockInstalledAt: now, blockInstalledUrl: order.websiteUrl })
      .where(eq(orders.id, order.id));
  }
  return result;
}

/** Staff enter a directory's badge code on a row, or clear it. The client's site has it on its next load. */
export async function setBadgeCode(submissionId: string, raw: string) {
  const s = await db().query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
  if (!s?.submissionOrderId) throw new SubmissionError("Not found.");
  const order = await db().query.submissionOrders.findFirst({ where: eq(orders.id, s.submissionOrderId) });
  if (!order?.blockInstalledAt || order.badgePreference !== "allow") {
    throw new SubmissionError("This order has no badge block.");
  }
  if (!ORDER_SHOWING.includes(order.status)) throw new SubmissionError("This order isn't active.");
  if (raw.length > 20_000) throw new SubmissionError("That's too long to be a badge. Paste only the badge code.");

  if (!raw.trim()) {
    await db().update(submissions).set({ badgeCode: null }).where(eq(submissions.id, s.id));
    return { showing: false, removed: [] as string[], hasLink: false };
  }
  if (!(SHOWING as readonly string[]).includes(s.status)) {
    throw new SubmissionError(`This directory is ${s.status}, so its badge wouldn't show.`);
  }
  const clean = sanitizeBadge(raw);
  if (!clean.usable) {
    throw new SubmissionError(
      clean.removed.length
        ? `This badge is only a ${clean.removed.join(" and ")}, which we can't put on a client's site. Look for an HTML or image version.`
        : "That doesn't look like badge code: there's no link or image in it.",
    );
  }
  await db().update(submissions).set({ badgeCode: clean.html }).where(eq(submissions.id, s.id));
  return { showing: true, removed: clean.removed, hasLink: clean.hasLink };
}
