/**
 * Limits for the Domain Rating checker, so one visitor can't use up our allowance with Ahrefs.
 * Every check counts against the visitor's IP and, when signed in, their
 * account too; each bucket has an hourly and a daily allowance, and all of
 * them must have room. Pure, so it can be tested without a database.
 */

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export const DR_LIMITS = {
  /** Signed out: per IP. */
  anonymous: { hour: 5, day: 15 },
  /** Signed in: per account, and per IP across every account and visitor on it. */
  signedIn: { hour: 15, day: 40 },
} as const;

/** Provider lookups (cache misses) across everyone, per rolling day. Overridable with DR_DAILY_PROVIDER_CAP. */
export const DEFAULT_DAILY_PROVIDER_CAP = 300;

export type Window = "hour" | "day";
/** Checks in the last hour and day, and when the oldest of them happened (for "try again in …"). */
export type Usage = { hour: number; day: number; oldestInHour: Date | null; oldestInDay: Date | null };

export type Verdict =
  { ok: true; remaining: { hour: number; day: number } } | { ok: false; window: Window; retryAt: Date };

/** Whether one more check fits every bucket, and what's left afterwards. */
export function drVerdict(buckets: Usage[], signedIn: boolean, now: Date): Verdict {
  const limit = signedIn ? DR_LIMITS.signedIn : DR_LIMITS.anonymous;
  for (const window of ["hour", "day"] as const) {
    const full = buckets.find((b) => b[window] >= limit[window]);
    if (full) {
      const oldest = window === "hour" ? full.oldestInHour : full.oldestInDay;
      const span = window === "hour" ? HOUR : DAY;
      return { ok: false, window, retryAt: new Date((oldest ?? now).getTime() + span) };
    }
  }
  const used = (w: Window) => Math.max(0, ...buckets.map((b) => b[w]));
  return { ok: true, remaining: { hour: limit.hour - used("hour") - 1, day: limit.day - used("day") - 1 } };
}

/** "45 minutes", "1 hour", "5 hours". */
export function waitText(retryAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function limitMessage(v: Extract<Verdict, { ok: false }>, signedIn: boolean, now: Date): string {
  const when = `Try again in ${waitText(v.retryAt, now)}`;
  const more = signedIn ? "" : " Signed-in accounts get more checks.";
  return v.window === "hour"
    ? `That's all your Domain Rating checks for this hour. ${when}.${more}`
    : `That's all your Domain Rating checks for today. ${when}.${more}`;
}
