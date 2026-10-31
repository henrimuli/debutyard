"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  joinSpotlightWaitlistAction,
  redeemFastTrackAction,
  startTierCheckoutAction,
  submitFreeAction,
} from "@/app/submit/actions";
import { BadgePanel } from "@/components/badge-panel";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/primitives";
import type { PlanChoices } from "@/lib/products/plan-choices";
import type { Tier } from "@/lib/products/input";
import type { ProviderId } from "@/lib/payments/types";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export type { PlanOption } from "@/lib/products/plan-choices";

const providerLabels: Record<ProviderId, string> = { paystack: "Pay with card", paypal: "PayPal" };

/**
 * The plan step. On its own page it redirects to the dashboard or the
 * provider; the debut modal passes callbacks instead and opens checkout in a
 * new tab.
 */
export function PlanPicker({
  productId,
  productName,
  status,
  options,
  weeks,
  providers,
  freeFastTrack = null,
  spotlightWaitlisted = false,
  badge,
  onSubmitted,
  onCheckout,
  onEditDetails,
}: PlanChoices & {
  /** Free debut or Fast Track credit went through. */
  onSubmitted?: () => void;
  /** A paid checkout opened in `tab` (null if the browser blocked it). */
  onCheckout?: (checkout: { orderId: string; url: string; tab: Window | null }) => void;
  onEditDetails?: () => void;
}) {
  const router = useRouter();
  const firstAvailable = options.find((o) => o.available)?.tier ?? "pro";
  const [selected, setSelected] = useState<Tier>(firstAvailable);
  const [week, setWeek] = useState(weeks[0]?.key ?? "");
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [badgeFound, setBadgeFound] = useState(badge.verified);
  // Owners and admins can submit without the badge (the server checks their role again).
  const badgeOk = badgeFound || badge.override;
  const [pending, start] = useTransition();
  const option = options.find((o) => o.tier === selected)!;

  const submitted = onSubmitted ?? (() => router.push(`/dashboard?submitted=${productId}`));

  function submitFree() {
    setError(null);
    start(async () => {
      const res = await submitFreeAction(productId);
      if (!res.ok) return setError(res.error);
      submitted();
    });
  }

  function redeem() {
    setError(null);
    start(async () => {
      const res = await redeemFastTrackAction(productId);
      if (!res.ok) return setError(res.error);
      submitted();
    });
  }

  function pay(provider: ProviderId) {
    setError(null);
    // In the modal, open the tab inside the click so it isn't blocked, then point it at the provider.
    const tab = onCheckout ? window.open("", "_blank") : null;
    if (tab) tab.document.title = "Opening checkout…";
    start(async () => {
      const res = await startTierCheckoutAction({
        productId,
        tier: selected as Exclude<Tier, "free">,
        provider,
        weekKey: option.picksWeek ? week : undefined,
        coupon: coupon || undefined,
      });
      if (!res.ok) {
        tab?.close();
        return setError(res.error);
      }
      if (!onCheckout) return window.location.assign(res.data.url);
      if (tab) {
        // The provider page shouldn't be able to reach back into this one.
        tab.opener = null;
        tab.location.href = res.data.url;
      }
      onCheckout({ ...res.data, tab });
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Listing: <span className="font-medium text-foreground">{productName}</span>{" "}
        {onEditDetails ? (
          <button type="button" onClick={onEditDetails} className="text-primary hover:underline">
            Edit details
          </button>
        ) : (
          <Link href={`/dashboard/products/${productId}`} className="text-primary hover:underline">
            Edit details
          </Link>
        )}
        {status === "pending" && <Badge className="ml-2">In review</Badge>}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {options.map((o) =>
          o.soldOut ? (
            <SoldOutCard key={o.tier} option={o} productId={productId} waitlisted={spotlightWaitlisted} />
          ) : (
            <button
              key={o.tier}
              type="button"
              disabled={!o.available}
              onClick={() => setSelected(o.tier)}
              aria-pressed={selected === o.tier}
              className={cn(
                "flex flex-col rounded-lg border bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                selected === o.tier
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span className="font-medium">{o.label}</span>
              <span className="mt-1 font-display text-2xl font-bold">{o.price}</span>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {o.perks.map((perk) => (
                  <li key={perk}>• {perk}</li>
                ))}
              </ul>
            </button>
          ),
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">
            {option.label} · {option.price}
          </h3>
          {option.note && <p className="text-sm text-muted-foreground">{option.note}</p>}
        </div>

        {option.picksWeek && (
          <label className="block max-w-md space-y-1.5">
            <span className="text-sm font-medium">Debut week</span>
            <Select
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-base sm:h-10 sm:text-sm"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            >
              {weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        {selected === "fast_track" && freeFastTrack !== null && (
          <div className="rounded-md bg-primary/10 p-4 text-sm">
            {freeFastTrack ? (
              <>
                <p className="font-medium">Maker Pro: your free Fast Track for this quarter is available.</p>
                <Button className="mt-3" onClick={redeem} disabled={pending || !option.available}>
                  {pending ? "Applying…" : "Use my free Fast Track"}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                You&apos;ve used this quarter&apos;s free Fast Track. The next one comes with the new quarter.
              </p>
            )}
          </div>
        )}

        {selected === "free" && option.available && (
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
            {badgeFound ? (
              <p className="text-sm font-medium text-success">Badge found on your site. You can submit now.</p>
            ) : badge.override ? (
              <p className="text-sm">
                <span className="font-medium">Admin override:</span> you can submit without the badge, and past the
                limit of waiting free debuts. The listing&apos;s link stays nofollow until a badge is found.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Free debuts need our badge on your site. Add it, and you can submit once our check finds it.
                </p>
                <BadgePanel
                  productId={productId}
                  required
                  snippets={badge.snippets}
                  previewUrls={badge.previewUrls}
                  dnsHost={badge.dnsHost}
                  dnsValue={badge.dnsValue}
                  onVerified={() => setBadgeFound(true)}
                />
              </>
            )}
          </div>
        )}

        {selected === "free" ? (
          <div className="space-y-1.5">
            <Button onClick={submitFree} disabled={pending || !option.available || !badgeOk}>
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
            {option.available && !badgeOk && (
              <p className="text-xs text-muted-foreground">
                Locked until we find the badge. Paste it, then click “Check my site”. Paid plans don&apos;t need it.
              </p>
            )}
          </div>
        ) : providers.length === 0 ? (
          <Button disabled variant="outline">
            Payments opening soon
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Coupon (optional)"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              className="max-w-48"
            />
            {providers.map((p) => (
              <Button
                key={p}
                variant={p === "paystack" ? "primary" : "outline"}
                disabled={pending || !option.available}
                onClick={() => pay(p)}
              >
                {pending ? "Opening checkout…" : providerLabels[p]}
              </Button>
            ))}
          </div>
        )}
        {onCheckout && selected !== "free" && providers.length > 0 && (
          <p className="text-xs text-muted-foreground">Checkout opens in a new tab. Keep this one open.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Spotlight with every spot taken: it can't be picked, but the maker can ask
 * to be emailed when one of the spots opens.
 */
function SoldOutCard({
  option,
  productId,
  waitlisted,
}: {
  option: PlanChoices["options"][number];
  productId: string;
  waitlisted: boolean;
}) {
  const [joined, setJoined] = useState(waitlisted);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function join() {
    setError(null);
    start(async () => {
      const res = await joinSpotlightWaitlistAction(productId);
      if (!res.ok) return setError(res.error);
      setJoined(true);
    });
  }

  return (
    <div className="flex flex-col rounded-lg border-2 border-dashed border-accent bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{option.label}</span>
        <Badge tone="accent">Sold out</Badge>
      </div>
      <span className="mt-1 font-display text-2xl font-bold text-muted-foreground line-through decoration-1">
        {option.price}
      </span>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground opacity-70">
        {option.perks.map((perk) => (
          <li key={perk}>• {perk}</li>
        ))}
      </ul>
      <div className="mt-auto space-y-1.5 pt-4">
        <p className="text-xs font-medium">All Spotlight spots are taken right now.</p>
        {joined ? (
          <p className="rounded-md bg-primary/10 px-2.5 py-2 text-xs text-primary">
            You&apos;re on the waitlist. We&apos;ll email you when a spot opens.
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-auto min-h-8 w-full whitespace-normal py-1.5 text-center leading-snug"
            onClick={join}
            disabled={pending}
          >
            {pending ? "Adding you…" : "Notify me when one opens"}
          </Button>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
