import type { Metadata } from "next";
import Link from "next/link";
import { CouponCard } from "@/components/kit/coupon-card";
import { Container } from "@/components/ui/primitives";
import { KIT_ITEMS, KIT_NAME, kitItemPath } from "@/lib/kit";

// Shared by link from the confirm email and page, not listed in search.
export const metadata: Metadata = { title: KIT_NAME, robots: { index: false, follow: false } };

export default function FounderKitPage() {
  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Your kit</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">The {KIT_NAME}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Thanks for subscribing. Bookmark this page: the guides get updated as we learn from each week&apos;s launches.
      </p>
      <CouponCard className="mt-8" />
      <ol className="mt-10 grid gap-4 sm:grid-cols-2">
        {KIT_ITEMS.map((item, i) => (
          <li key={item.slug}>
            <Link
              href={kitItemPath(item.slug)}
              className="group block h-full rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="text-xs font-semibold text-primary">0{i + 1}</span>
              <span className="mt-1 block font-display text-lg font-semibold group-hover:text-primary">
                {item.title}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.blurb}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Container>
  );
}
