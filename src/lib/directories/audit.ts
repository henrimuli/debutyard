import "server-only";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { site } from "@/config/site";
import { sendEmail } from "@/lib/email";
import { renderEmail, type EmailItem } from "@/lib/email-template";
import { fetchPage } from "@/lib/fetch-page";

const { directories } = schema;
const DAY = 86_400_000;

/** Healthy directories are re-checked monthly; failing ones every few days until they recover or are retired. */
export const AUDIT_EVERY_DAYS = 30;
export const AUDIT_RETRY_DAYS = 3;
export const AUDIT_DEACTIVATE_AFTER = 3;
/** A run stops starting new directories after this long. Whatever's left is still due tomorrow. */
const AUDIT_BUDGET_MS = 120_000;

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * The monthly directory audit: is each active directory's homepage still up?
 * Three failures in a row deactivate it (staff see the flag in the admin).
 * A site that turns our bot away (401, 403, 429, a challenge page) isn't down,
 * so that's recorded as blocked and never counts towards deactivation.
 * Runs from the daily cron in small batches. (The observed link type is
 * re-derived daily from recent link checks by refreshDirectoryStats.)
 */
export async function auditDirectories(now = new Date(), batch = 40) {
  const due = await db()
    .select()
    .from(directories)
    .where(
      and(
        eq(directories.isActive, true),
        or(
          isNull(directories.auditedAt),
          and(
            eq(directories.auditFailures, 0),
            lt(directories.auditedAt, ts(new Date(now.getTime() - AUDIT_EVERY_DAYS * DAY))),
          ),
          and(
            gt(directories.auditFailures, 0),
            lt(directories.auditedAt, ts(new Date(now.getTime() - AUDIT_RETRY_DAYS * DAY))),
          ),
        ),
      ),
    )
    .orderBy(sql`${directories.auditedAt} asc nulls first`)
    .limit(batch);

  const started = Date.now();
  let audited = 0;
  let failed = 0;
  const retired: EmailItem[] = [];
  const blocked: EmailItem[] = [];
  for (const d of due) {
    if (Date.now() - started > AUDIT_BUDGET_MS) break;
    audited++;
    let error: string | null = null;
    let wall: string | null = null;
    try {
      const page = await fetchPage(d.url, { purpose: "verify", timeoutMs: 10_000, maxBytes: 200_000 });
      if (page.blocked) wall = page.status >= 400 ? `HTTP ${page.status}` : "bot check";
      else if (page.status >= 400) error = `HTTP ${page.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 200) : "Fetch failed";
    }
    const failures = error ? d.auditFailures + 1 : 0;
    const retire = failures >= AUDIT_DEACTIVATE_AFTER;
    await db()
      .update(directories)
      .set({
        auditedAt: now,
        auditFailures: failures,
        auditError: error ?? (wall ? `Blocked (${wall})` : null),
        ...(retire ? { isActive: false } : {}),
      })
      .where(eq(directories.id, d.id));
    if (error) failed++;
    if (wall) blocked.push({ name: d.name, detail: d.url, chip: { label: wall, tone: "warn" as const } });
    if (retire) retired.push({ name: d.name, detail: d.url, chip: { label: error!, tone: "bad" as const } });
  }

  if (retired.length || blocked.length) {
    const count = (list: EmailItem[]) => `${list.length} ${list.length === 1 ? "directory" : "directories"}`;
    const summary = [
      retired.length ? `${count(retired)} deactivated` : "",
      blocked.length ? `${count(blocked)} blocked` : "",
    ]
      .filter(Boolean)
      .join(", ");
    await sendEmail({
      to: env().ADMIN_EMAIL ?? site.supportEmail,
      ...renderEmail({
        variant: "staff",
        label: "Directories",
        subject: `Directory audit: ${summary}`,
        trigger: "Sent by the directory audit cron.",
        blocks: [
          { heading: summary },
          ...(retired.length
            ? [
                {
                  text: `These directories failed ${AUDIT_DEACTIVATE_AFTER} audits in a row and are no longer picked for orders:`,
                },
                { items: retired },
                { text: "Reactivate one if it's back." },
              ]
            : []),
          ...(blocked.length
            ? [
                {
                  text: "These turned our checker away, so we can't tell if they're up. They stay active and are checked again next month:",
                },
                { items: blocked },
              ]
            : []),
          { button: "Open directories", href: new URL("/admin/directories", env().NEXT_PUBLIC_SITE_URL).toString() },
        ],
      }),
    });
  }

  return { audited, failed, blocked: blocked.length, deactivated: retired.length };
}
