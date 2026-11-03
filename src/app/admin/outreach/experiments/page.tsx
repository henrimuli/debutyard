import { ActionButton } from "@/components/outreach/controls";
import { Badge, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { MIN_SENDS_TO_RETIRE, probabilityBest } from "@/lib/outreach/bandit";
import { ensureControl, variantStats } from "@/lib/outreach/variants";
import { proposeVariantAction, setVariantStatusAction } from "../actions";

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

export default async function OutreachExperimentsPage() {
  await requireStaff("/admin/outreach/experiments");
  await ensureControl();
  const rows = await variantStats();
  const testing = rows.filter((r) => r.variant.status === "testing");
  const best = probabilityBest(
    testing.map((r) => ({ id: r.variant.id, sent: r.sent, engaged: r.engaged, unhappy: r.unhappy })),
  );
  const order = { pending: 0, testing: 1, retired: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.variant.status] - order[b.variant.status]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Better versions gradually get more sends. Winners are judged on real clicks and positive replies, not opens. A
          version can be retired for poor results after {MIN_SENDS_TO_RETIRE} sends, so at low volume this takes months.
          Run one or two at a time.
        </p>
        <ActionButton action={proposeVariantAction} label="Ask the agent for a new version" variant="primary" />
      </div>
      {sorted.map((r) => {
        const v = r.variant;
        const chance = best.get(v.id);
        return (
          <Card key={v.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{v.name}</h2>
              <Badge tone={v.status === "testing" ? "success" : v.status === "pending" ? "accent" : "default"}>
                {v.status === "pending" ? "waiting for approval" : v.status}
              </Badge>
              {chance !== undefined && testing.length > 1 && (
                <span className="text-sm text-muted-foreground">
                  {Math.round(chance * 100)}% chance it&apos;s the best
                </span>
              )}
            </div>
            {v.rationale && <p className="mt-2 text-sm text-muted-foreground">{v.rationale}</p>}
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Subject</dt>
              <dd>{v.subjectBrief}</dd>
              <dt className="text-muted-foreground">Angle</dt>
              <dd>{v.pitchBrief}</dd>
              <dt className="text-muted-foreground">Closing</dt>
              <dd>{v.closing.replace(/\{link:([^}]+)\}/, "$1")}</dd>
            </dl>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-5">
              {(
                [
                  ["Sent", r.sent],
                  ["Clicked", `${r.clicked} (${pct(r.clicked, r.sent)})`],
                  ["Positive replies", `${r.positive} (${pct(r.positive, r.sent)})`],
                  ["Unhappy", `${r.unhappy} (${pct(r.unhappy, r.sent)})`],
                  ["Orders", r.orders],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {v.retiredReason && <p className="mt-3 text-sm text-muted-foreground">Retired: {v.retiredReason}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              {v.status !== "testing" && (
                <ActionButton
                  action={setVariantStatusAction.bind(null, v.id, "testing")}
                  label={v.status === "pending" ? "Approve and start testing" : "Test it again"}
                />
              )}
              {v.status !== "retired" && !(v.status === "testing" && testing.length === 1) && (
                <ActionButton
                  action={setVariantStatusAction.bind(null, v.id, "retired")}
                  label="Retire"
                  variant="ghost"
                />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
