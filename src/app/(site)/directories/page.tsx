import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DirectoryBadges } from "@/components/directories/directory-badges";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Heading } from "@/components/ui/primitives";
import { listDirectories, NICHE_LABELS, NICHES, PRICINGS, type DirectoryFilters } from "@/lib/directories/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Launch directories",
  description:
    "Where to list your product after launch: launch boards, startup directories and review sites, with pricing, badge requirements and the link type we've actually seen.",
  alternates: { canonical: "/directories" },
};

export default function DirectoriesPage(props: PageProps<"/directories">) {
  return (
    <Container className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Launch directories</Heading>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Where to list your product after it debuts. Track your own submissions for free, or let us do them and
            verify every link.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/dashboard/tracker" variant="outline">
            Free tracker
          </ButtonLink>
          <ButtonLink href="/submission-service">Done for you</ButtonLink>
        </div>
      </div>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function List({ searchParams }: Pick<PageProps<"/directories">, "searchParams">) {
  const sp = await searchParams;
  const filters: DirectoryFilters = {
    niche: NICHES.find((n) => n === one(sp.niche)),
    pricing: PRICINGS.find((p) => p === one(sp.pricing)),
    noBadge: one(sp.badge) === "no",
    dofollow: one(sp.link) === "dofollow",
    q: one(sp.q)?.slice(0, 60) || undefined,
  };
  const items = await listDirectories(filters);
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const current = {
      niche: filters.niche,
      pricing: filters.pricing,
      badge: filters.noBadge ? "no" : undefined,
      link: filters.dofollow ? "dofollow" : undefined,
      q: filters.q,
      ...patch,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/directories?${s}` : "/directories";
  };
  const chip = (label: string, active: boolean, to: string) => (
    <Link
      key={label}
      href={to}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap gap-2">
        {chip("All niches", !filters.niche, href({ niche: undefined }))}
        {NICHES.map((n) =>
          chip(NICHE_LABELS[n], filters.niche === n, href({ niche: filters.niche === n ? undefined : n })),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRICINGS.map((p) =>
          chip(
            p[0].toUpperCase() + p.slice(1),
            filters.pricing === p,
            href({ pricing: filters.pricing === p ? undefined : p }),
          ),
        )}
        {chip("No badge needed", Boolean(filters.noBadge), href({ badge: filters.noBadge ? undefined : "no" }))}
        {chip("Dofollow", Boolean(filters.dofollow), href({ link: filters.dofollow ? undefined : "dofollow" }))}
        <form action="/directories" className="ml-auto">
          {filters.niche && <input type="hidden" name="niche" value={filters.niche} />}
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search…"
            aria-label="Search directories"
            className="h-10 w-40 rounded-full border border-border bg-card px-3 text-base sm:h-8 sm:text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
      </div>
      <p className="text-sm text-muted-foreground">{items.length} directories</p>
      {items.length === 0 ? (
        <Card className="text-center text-muted-foreground">Nothing matches those filters.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/directories/${d.slug}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{d.name}</span>
                  <AuthorityScore score={d.dr} />
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {new URL(d.url).hostname.replace(/^www\./, "")}
                </span>
                <DirectoryBadges directory={d} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
