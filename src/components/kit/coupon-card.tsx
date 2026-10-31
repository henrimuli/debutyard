import { DebutLink } from "@/components/debut/debut-link";
import { KIT_COUPON, KIT_COUPON_PERCENT } from "@/lib/kit";
import { cn } from "@/lib/utils";

export function CouponCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div>
        <p className="font-display text-lg font-semibold">{KIT_COUPON_PERCENT}% off your first paid debut</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold text-foreground">
            {KIT_COUPON}
          </code>{" "}
          at checkout on any launch plan.
        </p>
      </div>
      <DebutLink className="shrink-0">Debut your product</DebutLink>
    </div>
  );
}
