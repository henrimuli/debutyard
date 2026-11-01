"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import type { ProviderId } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

const labels: Record<ProviderId, string> = { paystack: "Pay with card", paypal: "PayPal" };

type Props = {
  sku: string;
  recurring: boolean;
  providers: ProviderId[];
  className?: string;
  /** Attach a submission package to one of the buyer's listings (a "boost"). */
  productId?: string;
  /** "dashboard": after checkout the provider sends the buyer back into the dashboard. */
  returnTo?: "dashboard";
  /** The signed-in buyer's email: the order goes on their account, so we don't ask for one. */
  accountEmail?: string;
};

/** Expands into email (skipped when signed in) + coupon + provider choice, then redirects to the provider's checkout. */
export function BuyButton({ sku, recurring, providers, className, productId, returnTo, accountEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) {
    return (
      <Button className={className} disabled variant="outline">
        Checkout opening soon
      </Button>
    );
  }

  if (!open) {
    return (
      <Button className={className} onClick={() => setOpen(true)}>
        {recurring ? "Subscribe" : "Buy"}
      </Button>
    );
  }

  async function pay(provider: ProviderId) {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          provider,
          email: accountEmail ? undefined : email || undefined,
          coupon: coupon || undefined,
          productId,
          returnTo,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {!recurring && (
        <>
          {accountEmail ? (
            <p className="truncate text-sm text-muted-foreground">
              Ordering as <span className="font-medium text-foreground">{accountEmail}</span>
            </p>
          ) : (
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email for your receipt"
            />
          )}
          <Input
            placeholder="Coupon (optional)"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            aria-label="Coupon code"
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Button
            key={p}
            className="flex-1"
            variant={p === "paystack" ? "primary" : "outline"}
            disabled={busy !== null}
            onClick={() => pay(p)}
          >
            {busy === p ? "Redirecting…" : labels[p]}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
