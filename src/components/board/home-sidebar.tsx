import Link from "next/link";
import { AdvertisePrompt } from "@/components/ads/advertise-prompt";
import { SidebarSponsor } from "@/components/ads/sponsored";
import { NewsletterForm } from "@/components/newsletter-form";
import { Card } from "@/components/ui/primitives";
import type { AdItem } from "@/lib/ads/service";
import type { categoriesWithCounts, recentWinners } from "@/lib/board/queries";
import { mixSidebar } from "@/lib/board/sidebar";
import { ProductLogo } from "./product-logo";

/** The homepage sidebar: the advertise prompt first, then sponsors mixed in among the regular cards. */
export function HomeSidebar({
  winners,
  categories,
  sponsors,
  offset = 0,
}: {
  winners: Awaited<ReturnType<typeof recentWinners>>;
  categories: Awaited<ReturnType<typeof categoriesWithCounts>>;
  sponsors: AdItem[];
  /** Rotates which sponsor goes first. */
  offset?: number;
}) {
  const blocks = [
    ...(winners.length > 0
      ? [
          <Card key="winners" className="p-5">
            <h2 className="font-display font-semibold">Last week&apos;s winners</h2>
            <ol className="mt-3 space-y-3">
              {winners.map((w) => (
                <li key={`${w.period_key}-${w.place}`} className="flex items-center gap-3">
                  <span>{["🥇", "🥈", "🥉"][w.place - 1]}</span>
                  <ProductLogo name={w.name} src={w.logo_url} className="size-8" />
                  <Link href={`/p/${w.slug}`} className="truncate text-sm font-medium hover:text-primary">
                    {w.name}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>,
        ]
      : []),
    <Card key="categories" className="p-5">
      <h2 className="font-display font-semibold">Browse by category</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {categories
          .filter((c) => c.count > 0)
          .slice(0, 16)
          .map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="inline-block rounded-full bg-muted px-3 py-1 text-xs hover:text-primary"
              >
                {c.name} <span className="text-muted-foreground">{c.count}</span>
              </Link>
            </li>
          ))}
      </ul>
      <Link href="/categories" className="mt-3 inline-block text-sm text-primary hover:underline">
        All categories
      </Link>
    </Card>,
    <Card key="digest" className="p-5">
      <h2 className="font-display font-semibold">Get the Monday digest</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">
        Last week&apos;s winners and this week&apos;s debuts. One email, no spam.
      </p>
      <NewsletterForm source="home" />
    </Card>,
    <Card key="fair" className="p-5">
      <h2 className="font-display font-semibold">Fair by design</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Paid debuts buy placement, never applause. No multipliers, no head starts.{" "}
        <Link href="/how-ranking-works" className="text-primary hover:underline">
          How ranking works
        </Link>
      </p>
    </Card>,
  ];
  const cards = sponsors.map((ad, i) => <SidebarSponsor key={ad.bookingId ?? ad.slug} ad={ad} tint={i} />);
  return (
    <>
      <AdvertisePrompt />
      {mixSidebar(cards, blocks, offset)}
    </>
  );
}
