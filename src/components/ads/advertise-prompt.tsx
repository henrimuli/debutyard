import { LogoMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { PLACEMENTS } from "@/lib/ads/placements";
import { formatUsd, getSku } from "@/lib/payments/skus";

const placements = Object.values(PLACEMENTS);
/** The cheapest week across every placement sold by the week (the newsletter is per issue). */
const fromCents = Math.min(
  ...placements.filter((p) => p.id !== "newsletter").map((p) => getSku(p.skus.week!)!.amountCents),
);

/** Top of the homepage sidebar: what advertisers can buy, and where to buy it. */
export function AdvertisePrompt() {
  return (
    <Card className="relative overflow-hidden p-5">
      <div aria-hidden className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/25 to-transparent" />
      <div aria-hidden className="relative -rotate-2 rounded-xl border border-border bg-card p-2.5 shadow-md">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground">
            <LogoMark className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">Your product</span>
            <span className="block truncate text-xs text-muted-foreground">Seen first</span>
          </span>
          <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
            Sponsored
          </span>
        </div>
      </div>
      <h2 className="relative mt-5 font-display text-lg font-semibold">Get your product seen</h2>
      <p className="relative mt-1 text-sm text-muted-foreground">Visibility maxxing on steroids:</p>
      <ul className="mt-3 space-y-2 text-sm">
        {placements.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor">
                <path d="m3.5 8.5 3 3 6-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {p.label}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        From <span className="font-display text-xl font-bold text-foreground">{formatUsd(fromCents)}</span> /week
      </p>
      <ButtonLink href="/advertise" className="mt-3 w-full">
        Advertise
        <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor">
          <path d="M3 8h10M9 4l4 4-4 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ButtonLink>
    </Card>
  );
}
