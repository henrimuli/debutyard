import Link from "next/link";
import { ProductLogo } from "@/components/board/product-logo";
import { Badge } from "@/components/ui/primitives";
import type { AdItem } from "@/lib/ads/service";
import { cn } from "@/lib/utils";
import { AdImpressions } from "./ad-impressions";

const REL = "sponsored noopener";

/** The rotating featured row between #3 and #4 on the board. */
export function SponsoredRow({ ad }: { ad: AdItem }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border border-accent/60 bg-accent/5 p-4">
      <span className="w-6 shrink-0 text-center text-xs text-muted-foreground" aria-hidden>
        ★
      </span>
      <ProductLogo name={ad.name} src={ad.logoUrl} />
      <div className="min-w-0 flex-1">
        {ad.bookingId ? (
          <a href={ad.href} rel={REL} target="_blank" className="font-semibold hover:text-primary">
            {ad.name}
          </a>
        ) : (
          <Link href={ad.href} className="font-semibold hover:text-primary">
            {ad.name}
          </Link>
        )}
        <p className="truncate text-sm text-muted-foreground">{ad.tagline}</p>
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <Badge tone="accent">Featured</Badge>
          <Link href={`/p/${ad.slug}`} className="text-muted-foreground hover:text-foreground">
            Listing
          </Link>
        </div>
      </div>
      {ad.bookingId && <AdImpressions ids={[ad.bookingId]} />}
    </li>
  );
}

const TINTS = [
  "border-amber-500/30 bg-amber-500/10",
  "border-sky-500/30 bg-sky-500/10",
  "border-rose-500/30 bg-rose-500/10",
  "border-emerald-500/30 bg-emerald-500/10",
  "border-violet-500/30 bg-violet-500/10",
];

/** A card in the homepage sidebar. `tint` picks its colour, so neighbours differ. */
export function SidebarSponsor({ ad, tint = 0 }: { ad: AdItem; tint?: number }) {
  return (
    <a
      href={ad.href}
      rel={REL}
      target="_blank"
      className={cn(
        "relative block rounded-xl border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
        TINTS[tint % TINTS.length],
      )}
    >
      <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Ad
      </span>
      <span className="flex items-center gap-3 pr-9">
        <ProductLogo name={ad.name} src={ad.logoUrl} className="size-10" />
        <span className="min-w-0 truncate font-display font-semibold text-foreground">{ad.name}</span>
      </span>
      <span className="mt-2.5 line-clamp-2 block text-sm text-muted-foreground">{ad.tagline}</span>
      {ad.bookingId && <AdImpressions ids={[ad.bookingId]} />}
    </a>
  );
}

/** Full-width sponsor banner (homepage top, category pages). */
export function SponsorBanner({ ad, label = "Sponsor" }: { ad: AdItem; label?: string }) {
  return (
    <a
      href={ad.href}
      rel={REL}
      target="_blank"
      className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <ProductLogo name={ad.name} src={ad.logoUrl} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-display font-semibold">{ad.name}</p>
        <p className="truncate text-sm text-muted-foreground">{ad.tagline}</p>
      </div>
      <span className="hidden text-sm font-medium text-primary sm:inline">Visit →</span>
      {ad.bookingId && <AdImpressions ids={[ad.bookingId]} />}
    </a>
  );
}
