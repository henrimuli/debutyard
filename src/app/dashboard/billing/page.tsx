import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Suspense } from "react";
import { CancelPlan, FeaturedListingPicker } from "@/components/billing/billing-controls";
import { PlanCards } from "@/components/billing/plan-cards";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, Heading } from "@/components/ui/primitives";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { planForSku } from "@/lib/billing/plans";
import { fastTrackCredit, receiptsFor, subscriptionsFor } from "@/lib/billing/service";
import { linkUsage } from "@/lib/links/service";
import { enabledProviders } from "@/lib/payments";
import { formatUsd, getSku } from "@/lib/payments/skus";

export const metadata: Metadata = { title: "Billing & plans", robots: { index: false } };

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–";

const STATUS = {
  active: { label: "Active", tone: "success" },
  non_renewing: { label: "Cancelled, active until period end", tone: "accent" },
  past_due: { label: "Payment failed", tone: "primary" },
} as const;

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
  const [subs, receipts, usage, credit, listings] = await Promise.all([
    subscriptionsFor(user.id),
    receiptsFor(user.id),
    linkUsage(user.id),
    fastTrackCredit(user.id),
    db()
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(and(eq(schema.products.createdBy, user.id), eq(schema.products.status, "approved")))
      .orderBy(schema.products.name),
  ]);

  return (
    <div className="mt-8 space-y-6">
      {subs.length === 0 ? (
        <Card className="text-center">
          <p className="font-medium">You&apos;re on the free plan.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can monitor {usage.limit} links you add yourself, plus everything from your tracker and orders.
          </p>
          <ButtonLink href="/dashboard/billing#plans" className="mt-4">
            See plans
          </ButtonLink>
        </Card>
      ) : (
        subs.map((s) => {
          const plan = planForSku(s.sku);
          const sku = getSku(s.sku);
          const status = STATUS[s.status as keyof typeof STATUS];
          return (
            <Card key={s.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">{sku?.name ?? plan?.label ?? s.sku}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sku && sku.type === "recurring"
                      ? `${formatUsd(sku.amountCents)}/${sku.interval === "monthly" ? "month" : "year"}`
                      : ""}{" "}
                    · paid with {s.provider === "paystack" ? "card (Paystack)" : "PayPal"}
                  </p>
                </div>
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
              </div>
              <p className="text-sm">
                {s.status === "active" && <>Renews on {day(s.currentPeriodEnd)}.</>}
                {s.status === "non_renewing" && <>You keep the plan until {day(s.currentPeriodEnd)}.</>}
                {s.status === "past_due" && (
                  <>
                    The last renewal didn&apos;t go through. Check your payment method with{" "}
                    {s.provider === "paystack" ? "Paystack" : "PayPal"}; the plan ends 7 days after the failed payment.
                  </>
                )}
              </p>
              {plan?.id === "maker_pro" && (
                <p className="text-sm text-muted-foreground">
                  Free Fast Track this quarter: {credit.available ? "available, pick it when you submit" : "used"}.
                </p>
              )}
              {plan && plan.limits.links > 0 && (
                <p className="text-sm text-muted-foreground">
                  Link Monitor: {usage.used} / {usage.limit} links.{" "}
                  <Link href="/dashboard/links" className="text-primary hover:underline">
                    Manage links
                  </Link>
                </p>
              )}
              {plan?.id === "always_featured" && (
                <FeaturedListingPicker subscriptionId={s.id} current={s.featuredProductId} listings={listings} />
              )}
              {s.status !== "non_renewing" && <CancelPlan subscriptionId={s.id} />}
            </Card>
          );
        })
      )}

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

      <Plans current={subs.map((s) => s.sku)} />
    </div>
  );
}

/** Subscription plans and their prices. Plans that aren't on sale (Agency) stay hidden. */
function Plans({ current }: { current: string[] }) {
  return (
    <section id="plans" className="scroll-mt-20 pt-4">
      <h2 className="font-display text-xl font-semibold">Plans</h2>
      <p className="mt-1 text-sm text-muted-foreground">Monthly or yearly, cancel anytime.</p>
      <PlanCards current={current} providers={enabledProviders()} className="mt-4" />
    </section>
  );
}
