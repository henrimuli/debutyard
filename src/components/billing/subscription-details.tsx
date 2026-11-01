import Link from "next/link";
import { CancelPlan } from "@/components/billing/billing-controls";
import { Badge, Card } from "@/components/ui/primitives";
import { PLACEMENTS, type Placement } from "@/lib/ads/placements";
import { formatUsd, getSku } from "@/lib/payments/skus";

type Sub = { id: string; sku: string; status: string; provider: string; currentPeriodEnd: Date | null };

export const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–";

const providerName = (s: Sub) => (s.provider === "paystack" ? "Paystack" : "PayPal");

/** "$20/week" */
function priceOf(skuId: string) {
  const sku = getSku(skuId);
  if (!sku || sku.type !== "recurring") return "";
  const per = sku.interval === "weekly" ? "week" : sku.interval === "monthly" ? "month" : "year";
  return `${formatUsd(sku.amountCents)}/${per}`;
}

const SLOT_STATUS = {
  active: { label: "Active", tone: "success" },
  non_renewing: { label: "Cancelled", tone: "accent" },
  past_due: { label: "Payment failed", tone: "primary" },
} as const;

/** A paid plan's card, for someone on it: when it renews, what's left of its perks, and Cancel. */
export function PlanDetails({
  sub,
  fastTracks,
}: {
  sub: Sub;
  fastTracks: { remaining: number; allowed: number } | null;
}) {
  return (
    <div className="space-y-2 text-sm">
      {sub.status === "active" && (
        <p>
          {priceOf(sub.sku)}, renews on {day(sub.currentPeriodEnd)}.
        </p>
      )}
      {sub.status === "non_renewing" && <p>Cancelled. You keep the plan until {day(sub.currentPeriodEnd)}.</p>}
      {sub.status === "past_due" && (
        <p className="font-medium text-danger">
          The last renewal didn&apos;t go through. Check your payment method with {providerName(sub)}; the plan ends 7
          days after the failed payment.
        </p>
      )}
      {fastTracks && (
        <p className="text-muted-foreground">
          Free Fast Tracks left this quarter: {fastTracks.remaining} of {fastTracks.allowed}.
        </p>
      )}
      {sub.status !== "non_renewing" && <CancelPlan subscriptionId={sub.id} />}
    </div>
  );
}

/** Recurring sponsor slots: one row each, with where they stand. */
export function Sponsorships({
  slots,
}: {
  slots: Array<{
    b: { id: string; placement: Placement; paidEndsAt: Date; impressions: number; clicks: number };
    productName: string;
    sub: Sub;
  }>;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Sponsorships</h2>
        <Link href="/dashboard/sponsorships" className="text-sm text-primary hover:underline">
          All sponsorships
        </Link>
      </div>
      <Card className="mt-4 p-0">
        <ul className="divide-y divide-border">
          {slots.map(({ b, productName, sub }) => {
            const status = SLOT_STATUS[sub.status as keyof typeof SLOT_STATUS];
            return (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{PLACEMENTS[b.placement].label}</span>
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  </p>
                  <p className="text-muted-foreground">
                    {productName} · {priceOf(sub.sku)}
                  </p>
                  <p>
                    {sub.status === "active" && <>Next charge on {day(sub.currentPeriodEnd)}.</>}
                    {sub.status === "non_renewing" && <>Your ad stops on {day(b.paidEndsAt)}.</>}
                    {sub.status === "past_due" && (
                      <>The last payment didn&apos;t go through. Check your payment method with {providerName(sub)}.</>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {b.impressions.toLocaleString("en-US")} impressions · {b.clicks.toLocaleString("en-US")} clicks
                  </p>
                </div>
                {sub.status !== "non_renewing" && (
                  <CancelPlan
                    subscriptionId={sub.id}
                    title="Cancel this sponsorship?"
                    message="Your ad keeps running for the time you've paid for, then the slot is released. You won't be charged again."
                    label="Cancel"
                    keepLabel="Keep sponsorship"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
