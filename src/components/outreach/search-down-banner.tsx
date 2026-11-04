import type { SearchDownStreak } from "@/lib/outreach/search-health";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** Top of every outreach page while Google searches are failing, louder once it has gone on long enough to need a proxy. */
export function SearchDownBanner({ streak }: { streak: SearchDownStreak }) {
  const { runs, lastAt, since, error, needsProxy } = streak;
  if (needsProxy) {
    return (
      <div role="alert" className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
        <p className="font-semibold text-red-700 dark:text-red-300">
          Outreach research needs a proxy: Google searches failed {runs} runs in a row
        </p>
        <p className="mt-1 text-red-700 dark:text-red-300">
          Failing since {when.format(since)} UTC. Latest, {when.format(lastAt)} UTC: {error}.
        </p>
        <p className="mt-2">
          Set a US residential proxy under <code>proxies.global</code> in <code>workers/openserp/config.yaml</code> and
          redeploy. If the error is HTTP 503 or the worker can&apos;t be reached, check the Railway services first. No
          business loses an attempt in the meantime.
        </p>
      </div>
    );
  }
  return (
    <p role="status" className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      {runs === 1 ? "The latest research run" : `The last ${runs} research runs`} stopped because Google searches failed
      ({when.format(lastAt)} UTC: {error}). Research tries again on its next run, and no business loses an attempt.
    </p>
  );
}
