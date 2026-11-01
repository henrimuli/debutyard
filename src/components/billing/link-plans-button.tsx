"use client";

import { useState } from "react";
import { BillingSwitch, PaidPlanCard, type Billing } from "@/components/billing/plan-cards";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PLAN_CARDS } from "@/lib/billing/plans";
import type { ProviderId } from "@/lib/payments/types";
import { cn } from "@/lib/utils";

/** "See plans" on the Link Monitor page: the plans above their limit, in a modal. */
export function LinkPlansButton({
  planIds,
  currentPlan,
  providers,
  authority,
}: {
  planIds: string[];
  /** The plan they're on now, which an upgrade replaces. */
  currentPlan?: string;
  providers: ProviderId[];
  authority: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState<Billing>("monthly");
  const cards = PLAN_CARDS.filter((c) => planIds.includes(c.id));
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        See plans
      </Button>
      {open && (
        <Dialog onClose={() => setOpen(false)} label="Plans with more links" size={cards.length > 1 ? "lg" : "sm"}>
          <div className="p-5 sm:p-6">
            <h2 className="pr-8 font-display text-xl font-semibold">Monitor more links</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cancel anytime.</p>
            <div className="mt-4">
              <BillingSwitch value={billing} onChange={setBilling} />
            </div>
            <div className={cn("mt-4 grid gap-4", cards.length > 1 && "sm:grid-cols-2")}>
              {cards.map((card) => (
                <PaidPlanCard
                  key={card.id}
                  card={card}
                  billing={billing}
                  providers={providers}
                  authority={authority}
                  linksFirst
                  action={
                    currentPlan
                      ? {
                          note: (
                            <>Your {currentPlan} plan is cancelled once this starts, with no refund for time left.</>
                          ),
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
