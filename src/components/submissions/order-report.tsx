import { LinkVerdict } from "@/components/directories/link-verdict";
import { FoldedTable } from "@/components/submissions/folded-table";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { Badge, Card } from "@/components/ui/primitives";
import { PACKAGES } from "@/lib/submissions/packages";
import type { orderRows, SubmissionOrder, summarizeOrder } from "@/lib/submissions/service";

const STATUS: Record<string, { label: string; tone: "default" | "success" | "accent" | "primary" }> = {
  todo: { label: "Queued", tone: "default" },
  submitted: { label: "Submitted", tone: "default" },
  pending: { label: "In review", tone: "default" },
  needs_action: { label: "Needs you", tone: "accent" },
  live: { label: "Live", tone: "success" },
  rejected: { label: "Rejected", tone: "default" },
  replaced: { label: "Replaced", tone: "default" },
  skipped: { label: "Skipped", tone: "default" },
  dead: { label: "Removed", tone: "default" },
};

const date = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "–";

/**
 * The client's view of an order: progress, summary and one row per directory.
 * `shared` hides anything private (notes for the client, evidence links).
 */
export function OrderReport({
  order,
  rows,
  summary,
  shared = false,
}: {
  order: SubmissionOrder;
  rows: Awaited<ReturnType<typeof orderRows>>;
  summary: ReturnType<typeof summarizeOrder>;
  shared?: boolean;
}) {
  const visible = rows.filter((r) => r.s.status !== "replaced");
  const table = (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Directory</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Submitted</th>
            <th className="px-3 py-2 font-medium">Live</th>
            <th className="px-3 py-2 font-medium">Link check</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visible.map(({ s, d }) => (
            <tr key={s.id} className="align-top">
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  {d.dr !== null && <AuthorityScore score={d.dr} />}
                </span>
                {s.liveUrl && (
                  <a
                    href={s.liveUrl}
                    target="_blank"
                    rel="noopener nofollow"
                    className="block max-w-72 truncate text-xs text-primary hover:underline"
                  >
                    {s.liveUrl}
                  </a>
                )}
                {!shared && s.status === "needs_action" && s.actionNeeded && (
                  <p className="mt-1 text-xs text-accent-foreground">→ {s.actionNeeded}</p>
                )}
                {!shared && s.evidenceUrl && (
                  <a
                    href={s.evidenceUrl}
                    target="_blank"
                    rel="noopener"
                    className="block text-xs text-muted-foreground hover:text-foreground"
                  >
                    Evidence screenshot
                  </a>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge tone={STATUS[s.status]?.tone ?? "default"}>{STATUS[s.status]?.label ?? s.status}</Badge>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{date(s.submittedAt)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{date(s.liveAt)}</td>
              <td className="px-3 py-2">
                {s.status === "live" ? (
                  <LinkVerdict verdict={s.linkVerdict} anchor={s.linkAnchor} checkedAt={s.linkCheckedAt} />
                ) : (
                  <span className="text-xs text-muted-foreground">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Live", summary.live],
          ["Verified dofollow", summary.dofollow],
          ["Submitted", summary.inReview],
          ["Scheduled", `${summary.scheduled} / ${summary.target}`],
        ].map(([label, n]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-bold">{n}</p>
          </Card>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {PACKAGES[order.package].label} ·{" "}
            {order.status === "delivered"
              ? `delivered ${date(order.deliveredAt)}`
              : order.dueAt
                ? `due ${date(order.dueAt)}`
                : "starting soon"}
          </span>
          <span>{summary.progress}% done</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted print:border print:border-border">
          <div className="h-full rounded-full bg-primary" style={{ width: `${summary.progress}%` }} />
        </div>
        {summary.inReview > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            A submission counts as done once we have proof of it. Each directory then publishes on its own schedule, and
            the listing shows as live here when it does.
          </p>
        )}
        {summary.scheduled < summary.target && (
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.target - summary.scheduled} more directories are added as matching ones join our list.
          </p>
        )}
      </div>
      {shared ? table : <FoldedTable total={visible.length}>{table}</FoldedTable>}
    </div>
  );
}
