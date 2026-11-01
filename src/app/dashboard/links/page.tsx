import type { Metadata } from "next";
import { Suspense } from "react";
import { LinkPlansButton } from "@/components/billing/link-plans-button";
import { LaunchWallToggle } from "@/components/links/launch-wall-toggle";
import { LinksTable } from "@/components/links/links-table";
import { Card, Heading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { requireUser } from "@/lib/auth";
import { formatLimit, planForSku, planRank, PLAN_CARDS, PLANS } from "@/lib/billing/plans";
import { subscriptionsFor } from "@/lib/billing/service";
import { linksForUser, linkUsage, pausedLinkIds } from "@/lib/links/service";
import { onLaunchWall } from "@/lib/links/wall";
import { drEnabled } from "@/lib/metrics/service";
import { enabledProviders } from "@/lib/payments";
import { formatUsd, getSku } from "@/lib/payments/skus";

export const metadata: Metadata = { title: "Link Monitor", robots: { index: false } };

export default function LinksPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Heading className="text-2xl sm:text-3xl">Link Monitor</Heading>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        We re-check every live backlink: daily for its first two weeks, then weekly. If a link turns nofollow or a
        listing disappears, we email you. Links from your directory tracker and submission orders are added
        automatically.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Links />
      </Suspense>
    </div>
  );
}

async function Links() {
  const user = await requireUser("/dashboard/links");
  const [rows, usage, paused, wall, subs] = await Promise.all([
    linksForUser(user.id),
    linkUsage(user.id),
    pausedLinkIds(user.id),
    onLaunchWall(user.id),
    subscriptionsFor(user.id),
  ]);
  const active = rows.filter((r) => r.link.active);
  const n = (v: string) => active.filter((r) => r.link.lastVerdict === v).length;
  const attention = active.filter((r) => r.link.lastVerdict && r.link.lastVerdict !== "dofollow").length;
  const indexChecked = active.filter((r) => r.link.indexed !== null);
  // Only plans with more links than they have now. Unlimited has none left to offer.
  const upgrades = PLAN_CARDS.map((card) => ({ card, links: planForSku(card.monthly)!.limits.links })).filter(
    (u) => u.links > usage.limit,
  );
  const paying = subs.filter((s) => s.status !== "non_renewing").map((s) => planForSku(s.sku));
  const currentPlan = PLANS[Math.max(-1, ...paying.map((p) => (p ? planRank(p.id) : -1)))]?.label;

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:auto-cols-fr lg:grid-flow-col">
        {[
          ["Monitored", usage.monitored],
          ["Dofollow", n("dofollow")],
          ["Need attention", attention],
          ["Your added links", `${usage.used} / ${formatLimit(usage.limit)}`],
          ...(indexChecked.length
            ? [["Indexed by Google", `${indexChecked.filter((r) => r.link.indexed).length} / ${indexChecked.length}`]]
            : []),
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
      {(usage.used >= usage.limit || paused.size > 0) && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">
              {paused.size > 0
                ? `${paused.size} of your links are over your plan and aren't being checked.`
                : `You've used all ${formatLimit(usage.limit)} links on your plan.`}
            </span>{" "}
            <span className="text-muted-foreground">
              {upgrades.length > 0
                ? `${upgrades
                    .map(
                      (u) =>
                        `${u.card.label} covers ${formatLimit(u.links).toLowerCase()} links for ${formatUsd(getSku(u.card.monthly)!.amountCents)}/month`,
                    )
                    .join(", and ")}.`
                : `Email ${site.supportEmail} and we'll sort it out.`}
            </span>
          </p>
          {upgrades.length > 0 && (
            <LinkPlansButton
              planIds={upgrades.map((u) => u.card.id)}
              currentPlan={currentPlan}
              providers={enabledProviders()}
              authority={drEnabled()}
            />
          )}
        </Card>
      )}
      <Card className="p-5">
        <LaunchWallToggle on={wall} handle={user.handle ?? null} />
      </Card>
      <Card className="p-5">
        <LinksTable
          canAdd={usage.used < usage.limit}
          rows={rows.map(({ link: l, directory }) => ({
            id: l.id,
            url: l.url,
            target: l.targetDomain,
            directory,
            source: l.source,
            active: l.active,
            paused: paused.has(l.id),
            verdict: l.lastVerdict,
            anchor: l.lastAnchor,
            statusCode: l.lastStatusCode,
            checkedAt: l.lastCheckedAt,
            nextCheckAt: l.active ? l.nextCheckAt : null,
            indexed: l.indexed,
          }))}
        />
      </Card>
    </div>
  );
}
