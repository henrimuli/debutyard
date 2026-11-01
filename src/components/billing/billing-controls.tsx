"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAction } from "@/app/dashboard/billing/actions";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";

export function CancelPlan({
  subscriptionId,
  title = "Cancel this plan?",
  message = "You keep it until the end of the period you've paid for, and you won't be charged again.",
  label = "Cancel plan",
  keepLabel = "Keep plan",
}: {
  subscriptionId: string;
  title?: string;
  message?: string;
  label?: string;
  keepLabel?: string;
}) {
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
            title,
            message,
            confirmLabel: label,
            cancelLabel: keepLabel,
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
        {pending ? "Cancelling…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
