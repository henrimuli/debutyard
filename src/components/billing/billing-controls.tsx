"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAction, setFeaturedListingAction } from "@/app/dashboard/billing/actions";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";

export function CancelPlan({ subscriptionId }: { subscriptionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={async () => {
          const ok = await confirmDialog({
            title: "Cancel this plan?",
            message: "You keep it until the end of the period you've paid for, and you won't be charged again.",
            confirmLabel: "Cancel plan",
            cancelLabel: "Keep plan",
            danger: true,
          });
          if (!ok) return;
          setError(null);
          start(async () => {
            const res = await cancelSubscriptionAction(subscriptionId);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Cancelling…" : "Cancel plan"}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Always Featured: which approved listing to feature. */
export function FeaturedListingPicker({
  subscriptionId,
  current,
  listings,
}: {
  subscriptionId: string;
  current: string | null;
  listings: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(current ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (listings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Once one of your listings is approved, pick it here to feature it.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Featured listing</span>
        <Select
          className="h-11 w-full max-w-sm rounded-md border border-border bg-card px-3 text-base sm:h-10 sm:text-sm"
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setMessage(null);
            start(async () => {
              const res = await setFeaturedListingAction(subscriptionId, next || null);
              setMessage(res.ok ? (next ? "Saved. It's in the featured rail now." : "Saved.") : res.error);
            });
          }}
        >
          <option value="">Pick a listing…</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </label>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
