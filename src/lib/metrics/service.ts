import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { entitled } from "@/lib/billing/entitlements";
import { MAKER_SKUS, planForSku } from "@/lib/billing/plans";
import { roundRobin } from "@/lib/fair-share";
import { domainOf } from "@/lib/slug";
import { BULK_MAX, createDrProvider, DR_DROP_ALERT, type DrProvider, type DrReading } from "./providers";

const { domainMetrics, products, subscriptions, submissionOrders, directories } = schema;
export type DomainMetric = typeof domainMetrics.$inferSelect;

const DAY = 86_400_000;
/** Snapshots are weekly; the DR checker reuses one this fresh. */
export const SNAPSHOT_EVERY_DAYS = 7;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const url = (path: string) => new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();

let override: DrProvider | null | undefined;

/** The configured Authority Score provider (DataForSEO unless DR_PROVIDER says otherwise), or null without a key. */
export function drProvider(): DrProvider | null {
  if (override !== undefined) return override;
  const { DR_PROVIDER, DR_API_KEY } = env();
  return DR_API_KEY ? createDrProvider(DR_PROVIDER ?? "dataforseo", DR_API_KEY) : null;
}

export const drEnabled = () => drProvider() !== null;

/** Test-only. `undefined` goes back to the environment. */
export function setDrProviderForTests(p: DrProvider | null | undefined) {
  override = p;
}

/** Latest reading for a domain, if it's no older than `maxAgeDays`. */
export async function latestDr(domain: string, maxAgeDays = SNAPSHOT_EVERY_DAYS, now = new Date()) {
  return (
    (await db().query.domainMetrics.findFirst({
      where: and(
        eq(domainMetrics.domain, domain),
        gt(domainMetrics.measuredAt, ts(new Date(now.getTime() - maxAgeDays * DAY))),
      ),
      orderBy: desc(domainMetrics.measuredAt),
    })) ?? null
  );
}

/** Every reading for a domain, oldest first (charts). */
export async function drHistory(domain: string) {
  return db()
    .select({ at: domainMetrics.measuredAt, dr: domainMetrics.dr })
    .from(domainMetrics)
    .where(eq(domainMetrics.domain, domain))
    .orderBy(asc(domainMetrics.measuredAt))
    .limit(200);
}

/** Measures a domain now and stores it. Returns the reading and the one before it. */
export async function snapshot(domain: string, now = new Date()) {
  const provider = drProvider();
  if (!provider) return null;
  const previous =
    (await db().query.domainMetrics.findFirst({
      where: eq(domainMetrics.domain, domain),
      orderBy: desc(domainMetrics.measuredAt),
    })) ?? null;
  const reading = await provider.fetchDr(domain);
  const [row] = await db()
    .insert(domainMetrics)
    .values({ domain, ...reading, provider: provider.id, measuredAt: now })
    .returning();
  return { row, previous };
}

/** A cached reading (≤ 7 days old) or a fresh one. For the free DR checker. */
export async function drFor(domain: string, now = new Date()) {
  return (await latestDr(domain, SNAPSHOT_EVERY_DAYS, now)) ?? (await snapshot(domain, now))?.row ?? null;
}

/** A baseline at intake, so the order's chart starts before any listing goes live. Never throws. */
export async function baselineSnapshot(websiteUrl: string | null, now = new Date()) {
  if (!websiteUrl || !drEnabled()) return null;
  try {
    const domain = domainOf(websiteUrl);
    return (await latestDr(domain, 1, now)) ?? (await snapshot(domain, now))?.row ?? null;
  } catch (err) {
    console.error("DR baseline failed", err);
    return null;
  }
}

type Watcher = { email: string; href: string };

/**
 * Domains we track weekly, and who hears about a drop: Maker plan products (each user's
 * oldest, up to their plan's limit, which only bites after a downgrade) and submission orders.
 */
async function trackedDomains(now: Date): Promise<Map<string, Watcher[]>> {
  const out = new Map<string, Watcher[]>();
  const add = (domain: string, w: Watcher) => {
    const list = out.get(domain) ?? [];
    if (!list.some((x) => x.email === w.email)) list.push(w);
    out.set(domain, list);
  };
  const pro = await db()
    .select({
      domain: products.domain,
      email: schema.user.email,
      userId: products.createdBy,
      sku: subscriptions.sku,
    })
    .from(products)
    .innerJoin(subscriptions, eq(subscriptions.userId, products.createdBy))
    .innerJoin(schema.user, eq(schema.user.id, products.createdBy))
    .where(
      and(
        inArray(subscriptions.sku, MAKER_SKUS),
        entitled(now),
        inArray(products.status, ["draft", "pending", "approved"]),
      ),
    )
    .orderBy(asc(products.createdAt));
  const caps = new Map<string, number>();
  for (const r of pro) caps.set(r.userId, Math.max(caps.get(r.userId) ?? 0, planForSku(r.sku)?.limits.domains ?? 0));
  const kept = new Map<string, Set<string>>();
  for (const r of pro) {
    if (!r.domain) continue;
    const domains = kept.get(r.userId) ?? new Set<string>();
    kept.set(r.userId, domains);
    if (!domains.has(r.domain) && domains.size >= caps.get(r.userId)!) continue;
    domains.add(r.domain);
    add(r.domain, { email: r.email, href: url("/dashboard") });
  }

  const orders = await db()
    .select({
      websiteUrl: submissionOrders.websiteUrl,
      email: sql<string>`coalesce(${submissionOrders.contactEmail}, ${submissionOrders.email})`,
      token: submissionOrders.intakeToken,
    })
    .from(submissionOrders)
    .where(
      and(
        inArray(submissionOrders.status, ["queued", "in_progress", "delivered"]),
        isNotNull(submissionOrders.websiteUrl),
      ),
    );
  for (const o of orders) {
    try {
      add(domainOf(o.websiteUrl!), { email: o.email, href: url(`/orders/${o.token}`) });
    } catch {
      // A malformed URL from intake: skip it.
    }
  }
  return out;
}

/**
 * Daily: snapshots tracked domains not measured in a week (bounded batch,
 * one request each), emails watchers when the score drops by DR_DROP_ALERT or
 * more, then refreshes directory scores in bulk when they're due.
 */
export async function snapshotDomains(now = new Date(), { batch = 100 } = {}) {
  if (!drEnabled()) return { skipped: "no DR provider configured" };
  const watched = await trackedDomains(now);
  const recent = new Set(
    (
      await db()
        .selectDistinct({ domain: domainMetrics.domain })
        .from(domainMetrics)
        .where(gt(domainMetrics.measuredAt, ts(new Date(now.getTime() - (SNAPSHOT_EVERY_DAYS - 0.5) * DAY))))
    ).map((r) => r.domain),
  );
  // Taking turns between owners, so one big account can't fill the batch.
  const byOwner = new Map<string, string[]>();
  for (const [domain, watchers] of watched) {
    if (recent.has(domain)) continue;
    const owner = watchers[0].email;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), domain]);
  }
  const due = roundRobin([...byOwner.values()], batch);

  let measured = 0;
  let alerts = 0;
  for (const domain of due) {
    try {
      const res = await snapshot(domain, now);
      if (!res) continue;
      measured++;
      const drop = res.previous ? res.previous.dr - res.row.dr : 0;
      if (drop >= DR_DROP_ALERT) {
        for (const w of watched.get(domain) ?? []) {
          await sendEmail({
            to: w.email,
            ...renderEmail({
              variant: "customer",
              label: "Authority Score",
              subject: `Authority Score alert: ${domain} dropped ${Math.round(drop)} points`,
              reason: `you track the Authority Score of ${domain}`,
              blocks: [
                { heading: `${domain} dropped ${Math.round(drop)} points` },
                {
                  text: `The Authority Score of ${domain} fell from ${res.previous!.dr} to ${res.row.dr} since our last check.`,
                },
                {
                  text: "A drop like this usually means some sites that linked to you removed the link or lost authority themselves. Your Link Monitor shows which listings changed.",
                },
                { button: "See the details", href: w.href },
              ],
            }),
          });
          alerts++;
        }
      }
    } catch (err) {
      console.error(`DR snapshot ${domain}`, err);
    }
  }
  const directoriesScored = await refreshDirectoryScores(now);
  return { measured, alerts, directories: directoriesScored };
}

/** Directory scores are re-measured this often, all together. */
export const DIRECTORY_REFRESH_DAYS = 30;
/** Without a bulk API (Ahrefs, Open PageRank), single lookups per run, so a run stays short. */
const SINGLE_LOOKUPS_PER_RUN = 50;

/**
 * Scores every active directory that has none, or whose last reading is
 * DIRECTORY_REFRESH_DAYS old, in as few requests as the provider allows: one
 * bulk request (up to 1,000 domains) with DataForSEO. In practice that's one
 * request a month for the whole list, plus a small one when directories are
 * added. Readings go into domain_metrics too, so directories have history.
 * Returns how many directories got a score.
 */
export async function refreshDirectoryScores(now = new Date()) {
  const provider = drProvider();
  if (!provider) return 0;
  const active = await db()
    .select({ id: directories.id, url: directories.url, dr: directories.dr })
    .from(directories)
    .where(eq(directories.isActive, true));
  const byDomain = new Map<string, Array<{ id: string; dr: number | null }>>();
  for (const d of active) {
    let domain: string;
    try {
      domain = domainOf(d.url);
    } catch {
      continue;
    }
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), { id: d.id, dr: d.dr }]);
  }
  if (byDomain.size === 0) return 0;

  const fresh = new Set(
    (
      await db()
        .selectDistinct({ domain: domainMetrics.domain })
        .from(domainMetrics)
        .where(
          and(
            inArray(domainMetrics.domain, [...byDomain.keys()]),
            gt(domainMetrics.measuredAt, ts(new Date(now.getTime() - DIRECTORY_REFRESH_DAYS * DAY))),
          ),
        )
    ).map((r) => r.domain),
  );
  const due = [...byDomain.entries()]
    .filter(([domain, rows]) => !fresh.has(domain) || rows.some((r) => r.dr === null))
    .map(([domain]) => domain);
  if (due.length === 0) return 0;

  const readings = new Map<string, DrReading>();
  try {
    if (provider.fetchBulk) {
      for (let i = 0; i < due.length; i += BULK_MAX) {
        for (const [domain, r] of await provider.fetchBulk(due.slice(i, i + BULK_MAX))) readings.set(domain, r);
      }
    } else {
      for (const domain of due.slice(0, SINGLE_LOOKUPS_PER_RUN)) {
        try {
          readings.set(domain, await provider.fetchDr(domain));
        } catch (err) {
          console.error(`Directory score ${domain}`, err);
        }
      }
    }
  } catch (err) {
    console.error("Directory score refresh failed", err);
    return 0;
  }
  if (readings.size === 0) return 0;

  await db()
    .insert(domainMetrics)
    .values([...readings].map(([domain, r]) => ({ domain, ...r, provider: provider.id, measuredAt: now })));
  let scored = 0;
  for (const [domain, r] of readings) {
    const ids = (byDomain.get(domain) ?? []).map((d) => d.id);
    if (ids.length === 0) continue;
    await db()
      .update(directories)
      .set({ dr: Math.round(r.dr) })
      .where(inArray(directories.id, ids));
    scored += ids.length;
  }
  return scored;
}
