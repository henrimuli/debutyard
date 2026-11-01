"use client";

import { useState } from "react";
import { BuyButton } from "@/components/buy-button";
import { Badge, Card } from "@/components/ui/primitives";
import { PLAN_CARDS } from "@/lib/billing/plans";
import { formatUsd, getSku } from "@/lib/payments/skus";
import type { ProviderId } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "yearly";

const cents = (sku: string) => getSku(sku)!.amountCents;
/** What a year costs paying monthly, less the yearly price. */
const savedCents = (c: (typeof PLAN_CARDS)[number]) => cents(c.monthly) * 12 - cents(c.yearly);
const bestPercent = Math.max(...PLAN_CARDS.map((c) => Math.round((100 * savedCents(c)) / (cents(c.monthly) * 12))));

/** The plans, one card each, with a monthly/yearly switch above them. Checkout is the usual BuyButton. */
export function PlanCards({
  current,
  providers,
  className,
}: {
  /** SKUs the buyer already subscribes to. Either billing period counts as being on that plan. */
  current: string[];
  providers: ProviderId[];
  className?: string;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const yearly = billing === "yearly";
  return (
    <div className={className}>
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
            aria-checked={billing === b}
            onClick={() => setBilling(b)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              billing === b ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {b === "monthly" ? "Monthly" : "Yearly"}
            {b === "yearly" && <span className="ml-1.5 text-xs text-primary">Save up to {bestPercent}%</span>}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_CARDS.map((card) => {
          const sku = yearly ? card.yearly : card.monthly;
          const held = current.includes(card.yearly) ? "yearly" : current.includes(card.monthly) ? "monthly" : null;
          return (
            <Card key={card.label} className="flex flex-col p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-medium">{card.label}</h3>
                {held && <Badge tone="success">Current</Badge>}
              </div>
              <p className="mt-1 font-display text-2xl font-bold">
                {formatUsd(cents(sku))}
                <span className="text-sm font-normal text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
              </p>
              {yearly && <p className="text-xs font-medium text-primary">Save {formatUsd(savedCents(card))} a year</p>}
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{getSku(card.monthly)!.description}</p>
              {held ? (
                <p className="mt-4 text-sm text-muted-foreground">You&apos;re billed {held}.</p>
              ) : (
                // Keyed by SKU so switching billing period closes an expanded checkout.
                <BuyButton key={sku} sku={sku} recurring providers={providers} className="mt-4" />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
