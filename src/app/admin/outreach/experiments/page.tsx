import { ActionButton } from "@/components/outreach/controls";
import { Badge, Card } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { copyAgeDays, MIN_SENDS_TO_RETIRE, probabilityBest, REFRESH_DAYS } from "@/lib/outreach/bandit";
import { fixedVariations } from "@/lib/outreach/draft";
import { recentRepeats } from "@/lib/outreach/queries";
import { ensureSeeds, variantStats } from "@/lib/outreach/variants";
import { isValidSpin, variations } from "@/lib/outreach/variety";
import { proposeVariantAction, setVariantStatusAction } from "../actions";

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

export default async function OutreachExperimentsPage() {
  await requireStaff("/admin/outreach/experiments");
  await ensureSeeds();
  const [rows, repeats] = await Promise.all([variantStats(), recentRepeats()]);
  const testing = rows.filter((r) => r.variant.status === "testing");
  const best = probabilityBest(
    testing.map((r) => ({ id: r.variant.id, sent: r.sent, engaged: r.engaged, unhappy: r.unhappy })),
  );
  const order = { pending: 0, testing: 1, retired: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.variant.status] - order[b.variant.status]);
  const age = copyAgeDays(
    testing.map((r) => r.variant.approvedAt),
    new Date(),
  );
  const waiting = rows.some((r) => r.variant.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Better versions gradually get more sends. Winners are judged on real clicks and positive replies, not opens. A
          version can be retired for poor results after {MIN_SENDS_TO_RETIRE} sends, so at low volume this takes months.
          New copy goes in every {REFRESH_DAYS} days or so, because filters catch up with wording.
        </p>
        <ActionButton action={proposeVariantAction} label="Ask the agent for a new version" variant="primary" />
      </div>
      {age !== null && age >= REFRESH_DAYS && (
        <p role="status" className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          The newest version has been running for {age} days.{" "}
          {waiting
            ? "Approve or retire the one waiting below to bring in new copy."
            : "New copy should be proposed soon."}
        </p>
      )}
      {repeats.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold">Repeating wording</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Phrases that keep turning up in the newest emails, which filters could learn. Retire a version that leans on
            one, or mention it when asking for a new one.
          </p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {repeats.map((p) => (
              <li key={p.phrase} className="flex justify-between gap-3 py-1.5">
                <span>&ldquo;{p.phrase}&rdquo;</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">{p.emails} emails</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {sorted.map((r) => {
        const v = r.variant;
        const combinations =
          isValidSpin(v.subjectBrief) && isValidSpin(v.closing)
            ? variations(v.subjectBrief) * variations(v.closing) * fixedVariations()
            : null;
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
              <dd>{v.closing}</dd>
              <dt className="text-muted-foreground">Wordings</dt>
              <dd>
                {combinations === null
                  ? "Broken spintax: this version can't send"
                  : `${combinations.toLocaleString("en-GB")} combinations of the fixed wording and subject line`}
              </dd>
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
