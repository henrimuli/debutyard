import "server-only";
import { and, count, eq, gt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { checkLink } from "@/lib/directories/verify";
import { DR_ATTRIBUTION } from "@/lib/metrics/providers";
import { drEnabled, latestDr, SNAPSHOT_EVERY_DAYS, snapshot } from "@/lib/metrics/service";
import { hashClient, normalizeUrl, ReadinessError } from "@/lib/readiness/service";
import { DAY, DEFAULT_DAILY_PROVIDER_CAP, drVerdict, HOUR, limitMessage, type Usage } from "./dr-limits";
import { explainLink, toDomain } from "./explain";

export class ToolError extends Error {
  constructor(
    message: string,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

/** Each caller can run each free tool this many times an hour (same as the readiness check). */
export const TOOL_RUNS_PER_HOUR = 15;

export type ToolCaller = { clientKey: string; userId?: string | null; source: "web" | "api" | "mcp" };
type Tool = "dofollow" | "dr" | "screenshot";

/** Counts the run against the caller's hourly allowance, or throws when it's used up. */
export async function spend(
  tool: Tool,
  target: string,
  caller: ToolCaller,
  limit = TOOL_RUNS_PER_HOUR,
  now = new Date(),
) {
  const clientHash = hashClient(caller.userId ? `user:${caller.userId}` : `ip:${caller.clientKey}`);
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const [{ n }] = await db()
    .select({ n: count() })
    .from(schema.toolChecks)
    .where(
      and(
        eq(schema.toolChecks.tool, tool),
        eq(schema.toolChecks.clientHash, clientHash),
        gt(schema.toolChecks.createdAt, sql`${since}::timestamptz`),
      ),
    );
  if (n >= limit) throw new ToolError("That's a lot of checks. Try again in an hour.", true);
  await db()
    .insert(schema.toolChecks)
    .values({ tool, target, clientHash, source: caller.source, userId: caller.userId ?? null });
}

function domainOrThrow(raw: string, what: string) {
  try {
    return toDomain(raw);
  } catch {
    throw new ToolError(`Enter ${what}, like example.com.`);
  }
}

/** Does `pageUrl` link to `target` (a domain or URL), and is the link followed? */
export async function checkDofollow(pageUrl: string, target: string, caller: ToolCaller) {
  let url: string;
  try {
    url = normalizeUrl(pageUrl);
  } catch (err) {
    if (err instanceof ReadinessError)
      throw new ToolError("Enter the page to check, like https://example.com/listing.");
    throw err;
  }
  const domain = domainOrThrow(target, "the site the link should point to");
  await spend("dofollow", url, caller);
  const r = await checkLink(url, domain);
  return {
    pageUrl: url,
    domain,
    verdict: r.verdict,
    rel: r.rel,
    anchor: r.anchor,
    httpStatus: r.httpStatus,
    explanation: explainLink(r, domain),
  };
}

/** Domain Rating checks in the last day matching `who`, with the hour's share and the oldest of each. */
async function drUsage(who: SQL, now: Date): Promise<Usage> {
  const { toolChecks: t } = schema;
  const hourAgo = new Date(now.getTime() - HOUR).toISOString();
  const dayAgo = new Date(now.getTime() - DAY).toISOString();
  const recent = sql`${t.createdAt} > ${hourAgo}::timestamptz`;
  const [r] = await db()
    .select({
      day: count(),
      hour: count(sql`case when ${recent} then 1 end`),
      oldestInDay: sql<number | null>`extract(epoch from min(${t.createdAt}))::float8`,
      oldestInHour: sql<number | null>`extract(epoch from min(case when ${recent} then ${t.createdAt} end))::float8`,
    })
    .from(t)
    .where(and(eq(t.tool, "dr"), who, gt(t.createdAt, sql`${dayAgo}::timestamptz`)));
  const at = (s: number | null | undefined) => (s == null ? null : new Date(Number(s) * 1000));
  return { hour: r?.hour ?? 0, day: r?.day ?? 0, oldestInHour: at(r?.oldestInHour), oldestInDay: at(r?.oldestInDay) };
}

/**
 * Counts a Domain Rating check against the caller's IP and, when signed in,
 * their account (see dr-limits.ts), or throws when any of them is used up.
 * Locked per IP, so parallel requests can't slip past the limit together.
 */
async function spendDr(domain: string, caller: ToolCaller, now: Date) {
  const ip = caller.clientKey && caller.clientKey !== "unknown" ? caller.clientKey : null;
  if (!ip && !caller.userId && env().NODE_ENV === "production") {
    throw new ToolError("We couldn't identify your connection, so we can't run the check. Try again.", true);
  }
  const ipHash = hashClient(`ip:${ip ?? "unknown"}`);
  const { toolChecks: t } = schema;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dr:${ipHash}`}))`);
    const buckets = await Promise.all([
      ...(ip || !caller.userId ? [drUsage(eq(t.clientHash, ipHash), now)] : []),
      ...(caller.userId ? [drUsage(eq(t.userId, caller.userId), now)] : []),
    ]);
    const signedIn = Boolean(caller.userId);
    const verdict = drVerdict(buckets, signedIn, now);
    if (!verdict.ok) throw new ToolError(limitMessage(verdict, signedIn, now), true);
    await tx.insert(t).values({
      tool: "dr",
      target: domain,
      clientHash: ipHash,
      source: caller.source,
      userId: caller.userId ?? null,
      createdAt: now,
    });
    return verdict.remaining;
  });
}

/** Provider lookups (cache misses) by the checker in the last day, across everyone. */
async function providerLookupsToday(now: Date) {
  const { toolChecks: t } = schema;
  const dayAgo = new Date(now.getTime() - DAY).toISOString();
  const [{ n }] = await db()
    .select({ n: count() })
    .from(t)
    .where(and(eq(t.tool, "dr_lookup"), gt(t.createdAt, sql`${dayAgo}::timestamptz`)));
  return n;
}

const BUSY = "The Domain Rating checker has hit its limit for today. Try again tomorrow.";

/**
 * A domain's Domain Rating, cached for 7 days. Each check counts against the
 * caller's limits; a cache miss also counts against the site-wide daily cap on
 * provider lookups, since Ahrefs can throttle or cut off heavy use.
 */
export async function checkDr(rawDomain: string, caller: ToolCaller, now = new Date()) {
  if (!drEnabled()) throw new ToolError("The Domain Rating checker isn't available right now.");
  const domain = domainOrThrow(rawDomain, "a domain");
  const cap = env().DR_DAILY_PROVIDER_CAP ?? DEFAULT_DAILY_PROVIDER_CAP;
  const cached = await latestDr(domain, SNAPSHOT_EVERY_DAYS, now);
  // Refuse before spending the caller's allowance when the provider is off limits anyway.
  if (!cached && (await providerLookupsToday(now)) >= cap) throw new ToolError(BUSY, true);
  const remaining = await spendDr(domain, caller, now);
  let row = cached;
  if (!row) {
    await db()
      .insert(schema.toolChecks)
      .values({ tool: "dr_lookup", target: domain, clientHash: "-", source: caller.source, createdAt: now });
    row = await snapshot(domain, now)
      .then((s) => s?.row ?? null)
      .catch((err) => {
        console.error("DR check failed", err);
        return null;
      });
  }
  if (!row) throw new ToolError(`We couldn't get a Domain Rating for ${domain}. Try again later.`);
  return {
    domain,
    dr: row.dr,
    provider: row.provider,
    /** Ahrefs' licence asks anyone showing this score to credit it like this. */
    attribution: DR_ATTRIBUTION,
    measuredAt: row.measuredAt.toISOString(),
    /** Checks this caller has left in the current hour and day. */
    remaining,
  };
}
