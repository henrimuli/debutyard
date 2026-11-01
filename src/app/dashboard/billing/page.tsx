import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PlanCards } from "@/components/billing/plan-cards";
import { day, PlanDetails, Sponsorships } from "@/components/billing/subscription-details";
import { Badge, Card, Heading } from "@/components/ui/primitives";
import { recurringSlots } from "@/lib/ads/service";
import { requireUser } from "@/lib/auth";
import { planForSku, planRank, PLANS } from "@/lib/billing/plans";
import { fastTrackCredit, receiptsFor, subscriptionsFor, type Subscription } from "@/lib/billing/service";
import { drEnabled } from "@/lib/metrics/service";
import { enabledProviders } from "@/lib/payments";
import { formatUsd, getSku } from "@/lib/payments/skus";

export const metadata: Metadata = { title: "Billing & plans", robots: { index: false } };

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Heading className="text-2xl sm:text-3xl">Billing &amp; plans</Heading>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-lg bg-muted/50" />}>
        <Billing />
      </Suspense>
    </div>
  );
}

async function Billing() {
  const user = await requireUser("/dashboard/billing");
  const [subs, receipts, credit, slots] = await Promise.all([
    subscriptionsFor(user.id),
    receiptsFor(user.id),
    fastTrackCredit(user.id),
    recurringSlots(user.id),
  ]);
  const planSubs = subs.filter((s) => planForSku(s.sku));
  const rankOf = (s: Subscription) => planRank(planForSku(s.sku)!.id);
  const topRank = Math.max(-1, ...planSubs.map(rankOf));
  const yourPlan = PLANS[topRank]?.id ?? "free";

  const details: Record<string, ReactNode> = {};
  for (const s of planSubs) {
    // A plan replaced by an upgrade has nothing left to manage.
    if (s.status === "non_renewing" && rankOf(s) < topRank) continue;
    const id = planForSku(s.sku)!.id;
    details[id] = (
      <>
        {details[id]}
        <PlanDetails sub={s} fastTracks={id === yourPlan ? credit : null} />
      </>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <section id="plans" className="scroll-mt-20">
        <h2 className="font-display text-xl font-semibold">Plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">Monthly or yearly, cancel anytime.</p>
        <PlanCards
          yourPlan={yourPlan}
          activePlans={planSubs.filter((s) => s.status !== "non_renewing").map((s) => planForSku(s.sku)!.id)}
          details={details}
          providers={enabledProviders()}
          authority={drEnabled()}
          className="mt-4"
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Every plan ranks the same: no plan boosts your applause or position on the board. &quot;Unlimited&quot; is
          subject to{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            fair use
          </Link>
          .
        </p>
      </section>

      {slots.length > 0 && <Sponsorships slots={slots} />}

      <Card>
        <h2 className="font-display text-lg font-semibold">Receipts</h2>
        {receipts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No one-time purchases yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {receipts.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  {getSku(o.sku)?.name ?? o.sku}
                  <span className="ml-2 text-muted-foreground">{day(o.paidAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {o.status !== "paid" && <Badge>{o.status.replace("_", " ")}</Badge>}
                  {formatUsd(o.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Subscription invoices come from Paystack or PayPal each time you&apos;re charged.
        </p>
      </Card>
    </div>
  );
}
