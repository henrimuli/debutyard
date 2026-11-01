import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { SponsorBanner } from "@/components/ads/sponsored";
import { FeaturedRail } from "@/components/board/featured-rail";
import { HomeSidebar } from "@/components/board/home-sidebar";
import { PinnedSidebar } from "@/components/board/pinned-sidebar";
import { BoardSkeleton, WeekBoard } from "@/components/board/week-board";
import { DebutLink } from "@/components/debut/debut-link";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container } from "@/components/ui/primitives";
import { SectionWave } from "@/components/ui/section-wave";
import { liveAds, type AdItem } from "@/lib/ads/service";
import { getCurrentUser } from "@/lib/auth";
import { cardMediaForSlugs, featuredNow } from "@/lib/board/featured";
import { applauseForSlugs, categoriesWithCounts, recentWinners } from "@/lib/board/queries";
import { addWeeks, formatWeekLabel, formatWeekRange, weekBounds, weekKeyFor } from "@/lib/weeks";

export default function Home() {
  return (
    <>
      <section>
        <Container className="flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Where great products <span className="text-primary">debut</span>.
            </h1>
            <p className="mt-4 max-w-xl text-muted-foreground">
              A new class debuts every Monday. Applaud your favorites all week. The top three become Debut of the Week.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DebutLink size="lg">Debut your product</DebutLink>
            <ButtonLink href="/submission-service" size="lg" variant="outline">
              Get listed on 40+ directories
            </ButtonLink>
          </div>
        </Container>
      </section>

      <SectionWave />

      {/* Spotlight and featured span the page; renders nothing when there are none. */}
      <Suspense fallback={null}>
        <Sponsored />
      </Suspense>

      <Container className="grid grid-cols-1 items-start gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <Suspense
            fallback={
              <>
                <h2 className="mb-4 font-display text-2xl font-bold">This week&apos;s debuts</h2>
                <BoardSkeleton />
              </>
            }
          >
            <ThisWeek />
          </Suspense>
        </section>
        <PinnedSidebar>
          <Suspense fallback={<Card className="h-48 animate-pulse" />}>
            <Sidebar />
          </Suspense>
        </PinnedSidebar>
      </Container>
    </>
  );
}

/** One read of the featured listings per request, shared by the sponsored section and the board. */
const featuredToday = cache(() => featuredNow(new Date()));

/** The homepage sponsor banner, Spotlight and featured cards, full width above the board. */
async function Sponsored() {
  await connection();
  const now = new Date();
  const [featured, rail, [top], user] = await Promise.all([
    featuredToday(),
    liveAds("home_rail", { now }),
    liveAds("home_top", { now }),
    getCurrentUser().catch(() => null),
  ]);
  if (featured.length === 0 && rail.length === 0 && !top) return null;
  const [applause, media] = await Promise.all([
    applauseForSlugs(
      featured.map((f) => f.slug),
      user?.id ?? null,
    ),
    cardMediaForSlugs([...featured.map((f) => f.slug), ...rail.map((a) => a.slug)]),
  ]);
  return (
    <>
      <section aria-label="Sponsored">
        <Container className="py-12">
          {top && <SponsorBanner ad={top} />}
          <FeaturedRail items={featured} ads={rail} applause={applause} media={media} signedIn={Boolean(user)} />
        </Container>
      </section>
      <SectionWave />
    </>
  );
}

async function ThisWeek() {
  await connection();
  const now = new Date();
  const key = weekKeyFor(now);
  const daysLeft = Math.max(0, Math.ceil((weekBounds(key).endsAt.getTime() - now.getTime()) / 86_400_000));
  const [featured, leaderboard] = await Promise.all([featuredToday(), liveAds("leaderboard", { now })]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold">This week&apos;s debuts</h2>
        <p className="text-sm text-muted-foreground">
          {formatWeekLabel(key)} · {formatWeekRange(key)} · the week closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}
        </p>
      </div>
      <WeekBoard weekKey={key} sponsor={pickLeaderboardSponsor(leaderboard, featured)} />
      <p className="mt-6 text-sm">
        <Link href={`/week/${addWeeks(key, -1)}`} className="text-muted-foreground hover:text-foreground">
          ← Last week&apos;s debuts
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/weeks" className="text-muted-foreground hover:text-foreground">
          All weeks
        </Link>
      </p>
    </>
  );
}

/** Who goes first among the sidebar sponsors changes per request. `mixSidebar` wraps it to the sponsor count. */
const randomOffset = () => Math.floor(Math.random() * 1000);

async function Sidebar() {
  await connection();
  const [winners, categories, sponsors] = await Promise.all([
    recentWinners(3),
    categoriesWithCounts(),
    // A problem with the ads shouldn't take the rest of the sidebar down.
    liveAds("home_sidebar").catch((err) => {
      console.error("sidebar sponsors failed", err);
      return [];
    }),
  ]);
  return <HomeSidebar winners={winners} categories={categories} sponsors={sponsors} offset={randomOffset()} />;
}

/**
 * The rotating slot between #3 and #4: a random booked sponsor, or (Pro and
 * Premium perk) a random featured debut when nobody booked the slot.
 */
function pickLeaderboardSponsor(booked: AdItem[], featured: Awaited<ReturnType<typeof featuredNow>>): AdItem | null {
  const pool: AdItem[] = booked.length
    ? booked
    : featured
        .filter((f) => !f.hero)
        .map((f) => ({
          bookingId: null,
          placement: "leaderboard",
          slug: f.slug,
          name: f.name,
          tagline: f.tagline,
          logoUrl: f.logoUrl,
          href: `/p/${f.slug}`,
        }));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
