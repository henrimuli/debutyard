"use client";

import { useState, type ReactNode } from "react";
import { BuyButton } from "@/components/buy-button";
import { Badge, Card } from "@/components/ui/primitives";
import { combine, formatLimit, planFeatures, planRank, PLAN_CARDS, PLANS, type PlanCard } from "@/lib/billing/plans";
import { formatUsd, getSku } from "@/lib/payments/skus";
import type { ProviderId } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

export type Billing = "monthly" | "yearly";

const cents = (sku: string) => getSku(sku)!.amountCents;
/** What a year costs paying monthly, less the yearly price. */
const savedCents = (c: PlanCard) => cents(c.monthly) * 12 - cents(c.yearly);
const bestPercent = Math.max(...PLAN_CARDS.map((c) => Math.round((100 * savedCents(c)) / (cents(c.monthly) * 12))));
const limitsOf = (id: string) => PLANS.find((p) => p.id === id)!.limits;

export function BillingSwitch({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex rounded-lg border border-border bg-muted/50 p-1 text-sm"
    >
      {(["monthly", "yearly"] as const).map((b) => (
        <button
          key={b}
          type="button"
          role="radio"
          aria-checked={value === b}
          onClick={() => onChange(b)}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            value === b ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {b === "monthly" ? "Monthly" : "Yearly"}
          {b === "yearly" && <span className="ml-1.5 text-xs text-primary">Save up to {bestPercent}%</span>}
        </button>
      ))}
    </div>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex-1 space-y-2 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-primary"
            fill="none"
            stroke="currentColor"
          >
            <path d="m3.5 8.5 3 3 6-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {f}
        </li>
      ))}
    </ul>
  );
}

/** A paid plan's card. `linksFirst` leads with its link count, for the Link Monitor page. */
export function PaidPlanCard({
  card,
  billing,
  providers,
  authority,
  yours,
  details,
  action,
  linksFirst,
}: {
  card: PlanCard;
  billing: Billing;
  providers: ProviderId[];
  authority: boolean;
  yours?: boolean;
  /** The buyer's subscription to this plan: renewal date, Cancel and so on. */
  details?: ReactNode;
  /** What stands in for the Subscribe button, or a note to show above it. */
  action?: { replace?: ReactNode; note?: ReactNode };
  linksFirst?: boolean;
}) {
  const yearly = billing === "yearly";
  const sku = yearly ? card.yearly : card.monthly;
  const limits = limitsOf(card.id);
  return (
    <Card className={cn("flex flex-col p-5", yours && "border-primary")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{card.label}</h3>
        {yours && <Badge tone="success">Your plan</Badge>}
      </div>
      {linksFirst && (
        <p className="mt-2 font-display text-3xl font-bold text-primary">{formatLimit(limits.links)} links</p>
      )}
      <p className={cn("mt-1 font-display font-bold", linksFirst ? "text-lg" : "text-2xl")}>
        {formatUsd(cents(sku))}
        <span className="text-sm font-normal text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
      </p>
      {yearly && <p className="text-xs font-medium text-primary">Save {formatUsd(savedCents(card))} a year</p>}
      <Features
        items={planFeatures(limits, { authority }).filter((f) => !linksFirst || !f.endsWith("monitored links"))}
      />
      {details && <div className="mt-4 space-y-3 border-t border-border pt-4">{details}</div>}
      {action?.note && <p className="mt-4 text-xs text-muted-foreground">{action.note}</p>}
      {action?.replace ?? (
        // Keyed by SKU so switching billing period closes an expanded checkout.
        <BuyButton key={sku} sku={sku} recurring providers={providers} returnTo="dashboard" className="mt-4" />
      )}
    </Card>
  );
}

/** Free and the paid plans, with a monthly/yearly switch above them. Checkout is the usual BuyButton. */
export function PlanCards({
  yourPlan,
  activePlans,
  details,
  providers,
  authority,
  className,
}: {
  /** The plan to mark as theirs: their highest, or "free". */
  yourPlan: string;
  /** Plans they're still being charged for. Nothing at or below the highest of these can be bought. */
  activePlans: string[];
  details: Record<string, ReactNode>;
  providers: ProviderId[];
  /** Whether Authority Score tracking is set up, so it can be sold. */
  authority: boolean;
  className?: string;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const top = Math.max(-1, ...activePlans.map(planRank));
  const topLabel = PLANS[top]?.label;
  return (
    <div className={className}>
      <BillingSwitch value={billing} onChange={setBilling} />
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className={cn("flex flex-col p-5", yourPlan === "free" && "border-primary")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Free</h3>
            {yourPlan === "free" && <Badge tone="success">Your plan</Badge>}
          </div>
          <p className="mt-1 font-display text-2xl font-bold">$0</p>
          <Features items={planFeatures(combine([]).limits)} />
        </Card>
        {PLAN_CARDS.map((card) => {
          const rank = planRank(card.id);
          const below = rank < top;
          const same = rank === top;
          return (
            <PaidPlanCard
              key={card.id}
              card={card}
              billing={billing}
              providers={providers}
              authority={authority}
              yours={yourPlan === card.id}
              details={details[card.id]}
              action={
                below
                  ? {
                      replace: (
                        <p className="mt-4 text-sm text-muted-foreground">
                          To move down to this plan, cancel {topLabel} first.
                        </p>
                      ),
                    }
                  : same
                    ? { replace: <></> }
                    : top >= 0
                      ? { note: <>Your {topLabel} plan is cancelled once this starts, with no refund for time left.</> }
                      : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
