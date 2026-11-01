import "server-only";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "@/db";
import { env } from "@/env";
import { detectBadge } from "@/lib/badges/detect";
import { ourHosts } from "@/lib/badges/service";
import { fetchPage } from "@/lib/fetch-page";
import { UnsafeUrlError } from "@/lib/net";
import { extractPrefill } from "@/lib/products/prefill";
import { bookableWeeks, nextFreeWeek } from "@/lib/products/service";
import { domainOf } from "@/lib/slug";
import { formatWeekLabel, weekBounds } from "@/lib/weeks";
import { pageChecks, scoreChecks, suggestedListing, unreachableChecks, type Existing } from "./checks";

export class ReadinessError extends Error {}

/** Each caller (by IP, or by account) can run this many checks an hour. */
export const CHECKS_PER_HOUR = 15;

export function hashClient(key: string) {
  return createHash("sha256")
    .update(`${env().BETTER_AUTH_SECRET ?? "dev"}:${key}`)
    .digest("hex")
    .slice(0, 32);
}

export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) throw new Error();
    return u.toString();
  } catch {
    throw new ReadinessError("Enter your product's website, like https://example.com.");
  }
}

async function existingListing(domain: string): Promise<Existing> {
  const p = await db().query.products.findFirst({
    where: and(eq(schema.products.domain, domain), inArray(schema.products.status, ["pending", "approved"])),
    columns: { slug: true, status: true, launchWeekKey: true },
  });
  if (!p) return null;
  const debutEnded = Boolean(p.launchWeekKey) && weekBounds(p.launchWeekKey!).endsAt.getTime() <= Date.now();
  return { slug: p.slug, status: p.status, debutEnded };
}

export type ReadinessReport = Awaited<ReturnType<typeof checkReadiness>>;

/**
 * Audits a product URL before submission: HTTPS, reachability, metadata,
 * duplicates, the badge, plus a suggested listing and the next weeks with room.
 */
export async function checkReadiness(
  rawUrl: string,
  caller: { clientKey: string; userId?: string | null; source: "web" | "api" | "mcp" },
) {
  const url = normalizeUrl(rawUrl);
  const domain = domainOf(url);
  const clientHash = hashClient(caller.userId ? `user:${caller.userId}` : `ip:${caller.clientKey}`);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(schema.readinessChecks)
    .where(
      and(
        eq(schema.readinessChecks.clientHash, clientHash),
        gt(schema.readinessChecks.createdAt, new Date(Date.now() - 3600_000)),
      ),
    );
  if (n >= CHECKS_PER_HOUR) throw new ReadinessError("That's a lot of checks. Try again in an hour.");

  const existing = await existingListing(domain);
  let checks;
  let suggested = null;
  try {
    const page = await fetchPage(url, { purpose: "read", timeoutMs: 8000 });
    const prefill = extractPrefill(page.body, page.url);
    checks = pageChecks(
      {
        finalUrl: page.url,
        status: page.status,
        html: page.body,
        prefill,
        badge: detectBadge(page.body, page.url, ourHosts()),
        blocksBots: page.via === "firecrawl" && page.directBlocked,
      },
      existing,
    );
    suggested = suggestedListing(prefill);
  } catch (err) {
    const reason =
      err instanceof UnsafeUrlError
        ? err.message
        : err instanceof Error && err.name === "TimeoutError"
          ? "The site took more than 8 seconds to respond."
          : "We couldn't connect to the site.";
    checks = unreachableChecks(reason, existing);
  }

  const score = scoreChecks(checks);
  await db()
    .insert(schema.readinessChecks)
    .values({ domain, score, clientHash, source: caller.source, userId: caller.userId ?? null });

  const free = await nextFreeWeek();
  return {
    url,
    domain,
    score,
    ready: checks.every((c) => c.status !== "fail"),
    checks: checks.map((c) => ({ id: c.id, label: c.label, status: c.status, detail: c.detail })),
    suggested,
    nextWeeks: {
      free: { key: free, label: formatWeekLabel(free) },
      paid: bookableWeeks()
        .slice(0, 4)
        .map((k) => ({ key: k, label: formatWeekLabel(k) })),
    },
  };
}
