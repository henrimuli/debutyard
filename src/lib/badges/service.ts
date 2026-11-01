import "server-only";
import { and, asc, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { resolveTxt } from "node:dns/promises";
import { db, schema } from "@/db";
import { env } from "@/env";
import { site } from "@/config/site";
import { fetchPage } from "@/lib/fetch-page";
import { UnsafeUrlError } from "@/lib/net";
import { notifyBadgeMissing } from "@/lib/notifications";
import { detectBadge, dnsRecordValue } from "./detect";
import { nextBadgeState } from "./state";

const { badgeVerifications, products } = schema;

export function ourHosts(): string[] {
  return [...new Set([new URL(env().NEXT_PUBLIC_SITE_URL).hostname, new URL(site.url).hostname, "debutyard.com"])];
}

async function htmlCheck(websiteUrl: string): Promise<{ ok: boolean; detail: string }> {
  const pages = [websiteUrl];
  const home = new URL("/", websiteUrl).toString();
  if (home !== websiteUrl) pages.push(home);

  let lastDetail = "No link to DebutYard found on the page.";
  for (const page of pages) {
    try {
      const res = await fetchPage(page, { purpose: "verify", timeoutMs: 10_000 });
      if (res.status >= 400 || res.blocked) {
        lastDetail =
          res.blocked || res.status === 503
            ? `Your site returned HTTP ${res.status} to our checker (bot protection?). Use the DNS option.`
            : `Your site returned HTTP ${res.status}.`;
        continue;
      }
      const result = detectBadge(res.body, res.url, ourHosts());
      if (result.ok) return { ok: true, detail: "Badge found." };
      lastDetail = result.detail;
    } catch (err) {
      lastDetail = err instanceof UnsafeUrlError ? err.message : "We couldn't reach your site.";
    }
  }
  return { ok: false, detail: lastDetail };
}

async function dnsCheck(domain: string, token: string): Promise<boolean> {
  try {
    const records = await resolveTxt(domain);
    return records.some((chunks) => chunks.join("") === dnsRecordValue(token));
  } catch {
    return false;
  }
}

/** Checks one product's badge (HTML first, then DNS) and applies the state change. */
export async function verifyBadge(productId: string) {
  const p = await db().query.products.findFirst({ where: eq(products.id, productId) });
  const row = await db().query.badgeVerifications.findFirst({ where: eq(badgeVerifications.productId, productId) });
  if (!p || !row) throw new Error("Product not found");

  const html = await htmlCheck(p.websiteUrl);
  const viaDns = html.ok ? false : await dnsCheck(p.domain, row.dnsToken);
  const found = html.ok || viaDns;
  const now = new Date();
  const next = nextBadgeState({ status: row.status, graceUntil: row.graceUntil }, found, now);

  const [updated] = await db()
    .update(badgeVerifications)
    .set({
      status: next.status,
      graceUntil: next.graceUntil,
      method: found ? (html.ok ? "html" : "dns") : row.method,
      lastCheckedAt: now,
      lastSeenAt: found ? now : row.lastSeenAt,
      failureReason: found ? null : html.detail,
    })
    .where(eq(badgeVerifications.productId, productId))
    .returning();

  if (next.notifyMissing && next.graceUntil) await notifyBadgeMissing(p, next.graceUntil);
  return updated;
}

/**
 * Weekly re-check for free listings with a badge on record (and daily while in
 * grace). Batched so one cron run stays short.
 */
export async function recheckBadges(limit = 40) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const due = await db()
    .select({ productId: badgeVerifications.productId })
    .from(badgeVerifications)
    .innerJoin(products, eq(products.id, badgeVerifications.productId))
    .where(
      and(
        eq(products.status, "approved"),
        eq(products.tier, "free"),
        eq(products.isWinner, false),
        or(
          and(
            eq(badgeVerifications.status, "verified"),
            or(isNull(badgeVerifications.lastCheckedAt), lt(badgeVerifications.lastCheckedAt, weekAgo)),
          ),
          and(
            inArray(badgeVerifications.status, ["grace"]),
            or(isNull(badgeVerifications.lastCheckedAt), lt(badgeVerifications.lastCheckedAt, dayAgo)),
          ),
        ),
      ),
    )
    .orderBy(asc(badgeVerifications.lastCheckedAt))
    .limit(limit);

  let checked = 0;
  for (const { productId } of due) {
    try {
      await verifyBadge(productId);
      checked++;
    } catch (err) {
      console.error(`badge recheck failed for ${productId}`, err);
    }
  }
  return { due: due.length, checked };
}
