/** What counts as done on an order. Pure. */

type Row = { status: string; evidenceUrl: string | null };

const WITH_DIRECTORY = ["submitted", "pending"];

/** With the directory, but with no proof of it yet. */
export function awaitsScreenshot(row: Row): boolean {
  return WITH_DIRECTORY.includes(row.status) && !row.evidenceUrl;
}

/**
 * Our part is finished. Free listings can take a directory a long time to
 * publish, so a submission with a screenshot is done; going live comes later.
 */
export function rowIsDone(row: Row): boolean {
  return (
    ["live", "rejected", "dead", "skipped"].includes(row.status) ||
    (WITH_DIRECTORY.includes(row.status) && Boolean(row.evidenceUrl))
  );
}
