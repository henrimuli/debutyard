"use client";

import { useState, useTransition } from "react";
import { approveAction, rejectAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const reasons = [
  "The website doesn't load or isn't a working product yet.",
  "It's a duplicate of an existing listing.",
  "The listing details are incomplete or misleading.",
  "It doesn't meet our guidelines (spam, adult, gambling, scams or malware).",
];

export function ReviewControls({ productId, paid }: { productId: string; paid: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed");
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => approveAction(productId))}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting((r) => !r)}>
          Reject…
        </Button>
      </div>
      {rejecting && (
        <div className="space-y-2">
          <Select
            className="h-11 w-full rounded-md border border-border bg-card px-2 text-base sm:h-9 sm:text-sm"
            value={reasons.includes(reason) ? reason : "custom"}
            onChange={(e) => setReason(e.target.value === "custom" ? "" : e.target.value)}
          >
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="custom">Custom reason…</option>
          </Select>
          {!reasons.includes(reason) && (
            <textarea
              className="w-full rounded-md border border-border bg-card p-2 text-base sm:text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Shown to the maker"
            />
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => rejectAction(productId, reason))}
          >
            Confirm reject{paid ? " and refund" : ""}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
