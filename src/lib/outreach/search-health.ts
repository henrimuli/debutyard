/**
 * Whether outreach's Google searches are getting through, read from the logged
 * research runs. Pure, so it can be tested without a database.
 */

/** Runs are three hours apart, so this many in a row is most of a day, too long to be a passing block. */
export const PROXY_AFTER_RUNS = 3;

/** Our services failing rather than Google refusing, so a proxy wouldn't help. */
const serviceTrouble = (error: string) => /HTTP 5\d\d|reach the worker/.test(error);

export type ResearchRun = { startedAt: Date; results: unknown };

export type SearchDownStreak = {
  /** Failed runs in a row, newest back to the last time searches worked. */
  runs: number;
  /** The latest failure. */
  lastAt: Date;
  /** The first failure of this streak. */
  since: Date;
  error: string;
  needsProxy: boolean;
};

/**
 * Newest run first. A run that searched fine ends the streak. A run that never
 * searched, because enough was ready or it crashed first, says nothing either way.
 */
export function searchDownStreak(newestFirst: ResearchRun[]): SearchDownStreak | null {
  let streak: SearchDownStreak | null = null;
  for (const run of newestFirst) {
    const research = (run.results as { research?: { searchDown?: unknown; searched?: unknown } } | null)?.research;
    if (typeof research?.searchDown === "string") {
      streak = streak ?? {
        runs: 0,
        lastAt: run.startedAt,
        since: run.startedAt,
        error: research.searchDown,
        needsProxy: false,
      };
      streak.runs++;
      streak.since = run.startedAt;
      streak.needsProxy = streak.runs >= PROXY_AFTER_RUNS && !serviceTrouble(streak.error);
    }
    // Worked earlier in the same run, then failed: the block starts here.
    if (research?.searched) break;
  }
  return streak;
}
