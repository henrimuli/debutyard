"use client";

import { useState } from "react";
import { relaunchCheckoutAction } from "@/app/dashboard/products/[id]/relaunch/actions";
import { Button } from "@/components/ui/button";
import type { ProviderId } from "@/lib/payments/types";

const labels: Record<ProviderId, string> = { paystack: "Pay with card", paypal: "PayPal" };

/** The payment choice on the relaunch page, which then redirects to the provider's checkout. */
export function RelaunchCheckout({ productId, providers }: { productId: string; providers: ProviderId[] }) {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) {
    return (
      <Button disabled variant="outline">
        Checkout opening soon
      </Button>
    );
  }

  async function pay(provider: ProviderId) {
    setBusy(provider);
    setError(null);
    const res = await relaunchCheckoutAction(productId, provider).catch(() => null);
    if (res?.ok) return window.location.assign(res.url);
    setError(res?.error ?? "Couldn't start checkout. Please try again.");
    setBusy(null);
  }

  return (
    <div className="space-y-2">
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
