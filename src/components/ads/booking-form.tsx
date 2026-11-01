"use client";

import { useContext, useEffect, useState, useTransition } from "react";
import { availabilityAction, bookAction } from "@/app/(site)/advertise/actions";
import { BookingPlacementContext } from "@/components/ads/booking-modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { PLACEMENTS, WEEKS_PER, type Duration, type Placement } from "@/lib/ads/placements";
import { formatUsd, getSku } from "@/lib/payments/skus";
import type { ProviderId } from "@/lib/payments/types";
import { addWeeks } from "@/lib/weeks";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

type Week = { key: string; label: string; range: string; remaining: number };

const providerLabels: Record<ProviderId, string> = { paystack: "Pay with card (Paystack)", paypal: "PayPal" };
const selectCls =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function BookingForm({
  products,
  categories,
  providers,
  initialWeeks,
  returnTo,
}: {
  products: Array<{ id: string; name: string }>;
  categories: Array<{ slug: string; name: string }>;
  providers: ProviderId[];
  initialWeeks: Week[];
  /** "dashboard": checkout comes back to the dashboard instead of the main site. */
  returnTo?: "dashboard";
}) {
  // Opened from a placement's card, the form starts on that placement.
  const startPlacement = useContext(BookingPlacementContext) ?? "leaderboard";
  const [placement, setPlacement] = useState<Placement>(startPlacement);
  const [chosenDuration, setDuration] = useState<Duration>("week");
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [weeks, setWeeks] = useState<Week[]>(initialWeeks);
  const [week, setWeek] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [paying, setPaying] = useState<ProviderId | null>(null);

  const config = PLACEMENTS[placement];
  const durations = (Object.keys(config.skus) as Duration[]).filter((d) => config.skus[d]);
  const duration: Duration = config.skus[chosenDuration] ? chosenDuration : "week";
  const sku = getSku(config.skus[duration]!)!;
  const span = WEEKS_PER[duration];

  function reload(nextPlacement: Placement, nextCategory: string) {
    setPlacement(nextPlacement);
    setCategory(nextCategory);
    setWeek(null);
    startLoading(async () =>
      setWeeks(await availabilityAction(nextPlacement, nextPlacement === "category" ? nextCategory : null)),
    );
  }

  // initialWeeks are the leaderboard's; any other starting placement needs its own.
  useEffect(() => {
    if (startPlacement === "leaderboard") return;
    startLoading(async () =>
      setWeeks(await availabilityAction(startPlacement, startPlacement === "category" ? categories[0]?.slug : null)),
    );
    // Only on opening; changing the placement afterwards goes through reload().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A multi-week booking needs room in every week it covers.
  const fits = (key: string) =>
    Array.from({ length: span }, (_, i) => weeks.find((w) => w.key === addWeeks(key, i))).every(
      (w) => w && w.remaining > 0,
    );

  async function pay(provider: ProviderId) {
    if (!week) return setError("Pick a start week.");
    setError(null);
    setPaying(provider);
    const res = await bookAction({
      placement,
      duration,
      productId,
      categorySlug: placement === "category" ? category : null,
      weekKey: week,
      provider,
      coupon: coupon || undefined,
      returnTo,
    });
    if (res.ok) {
      window.location.assign(res.url);
      return;
    }
    setPaying(null);
    setError(res.error);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="placement">Placement</Label>
          <Select
            id="placement"
            className={selectCls}
            value={placement}
            onChange={(e) => reload(e.target.value as Placement, category)}
          >
            {Object.values(PLACEMENTS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product">Promote</Label>
          <Select id="product" className={selectCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {placement === "category" && (
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Select
              id="category"
              className={selectCls}
              value={category}
              onChange={(e) => reload(placement, e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {durations.length > 1 && (
          <div className="space-y-1.5">
            <Label>Length</Label>
            <div className="flex gap-2">
              {durations.map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={d === duration ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setDuration(d)}
                >
                  {d === "week" ? "1 week" : "4 weeks"} · {formatUsd(getSku(config.skus[d]!)!.amountCents)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{config.description}</p>

      <div>
        <p className="mb-2 text-sm font-medium">
          {placement === "newsletter" ? "Issue (sent Monday of)" : "Start week"}{" "}
          <span className="font-normal text-muted-foreground">
            · {config.cap} slot{config.cap === 1 ? "" : "s"} per week
          </span>
        </p>
        <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", loading && "opacity-50")}>
          {weeks.map((w) => {
            const ok = fits(w.key);
            return (
              <button
                key={w.key}
                type="button"
                disabled={!ok}
                onClick={() => setWeek(w.key)}
                className={cn(
                  "rounded-md border p-2 text-left text-sm transition-colors",
                  week === w.key ? "border-primary bg-primary/10" : "border-border bg-card hover:border-foreground/30",
                  !ok && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="block font-medium">{w.label.replace(/, \d{4}$/, "")}</span>
                <span className="block text-xs text-muted-foreground">{w.range}</span>
                <span className={cn("text-xs", w.remaining === 0 ? "text-danger" : "text-muted-foreground")}>
                  {w.remaining === 0 ? "Sold out" : `${w.remaining} left`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-border pt-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coupon">Coupon</Label>
          <Input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="w-40" />
        </div>
        <p className="font-display text-2xl font-bold">{formatUsd(sku.amountCents)}</p>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {providers.length === 0 ? (
            <Button disabled variant="outline">
              Checkout opening soon
            </Button>
          ) : (
            providers.map((p) => (
              <Button key={p} onClick={() => pay(p)} disabled={!week || paying !== null}>
                {paying === p ? "Redirecting…" : providerLabels[p]}
              </Button>
            ))
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
