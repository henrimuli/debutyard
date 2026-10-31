import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CouponCard } from "@/components/kit/coupon-card";
import { GuideBody } from "@/components/kit/guide-body";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { Container } from "@/components/ui/primitives";
import { KIT_ITEMS, KIT_NAME, KIT_PATH } from "@/lib/kit";
import { atlasTiers } from "@/lib/kit-atlas";
import { GUIDES } from "@/lib/kit-guides";
import { atlasDirectories } from "../atlas-data";

const itemFor = (slug: string) => KIT_ITEMS.find((i) => i.slug === slug);

export async function generateMetadata(props: PageProps<"/resources/founder-kit/[item]">): Promise<Metadata> {
  const item = itemFor((await props.params).item);
  return { title: item ? `${item.title} · ${KIT_NAME}` : KIT_NAME, robots: { index: false, follow: false } };
}

export default function KitItemPage(props: PageProps<"/resources/founder-kit/[item]">) {
  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <Link href={KIT_PATH} className="text-sm text-muted-foreground hover:text-foreground">
        ← {KIT_NAME}
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Item params={props.params} />
      </Suspense>
      <CouponCard className="mt-14" />
    </Container>
  );
}

async function Item({ params }: Pick<PageProps<"/resources/founder-kit/[item]">, "params">) {
  const { item: slug } = await params;
  const item = itemFor(slug);
  if (!item) notFound();
  if (item.slug === "directory-atlas") return <Atlas />;
  const guide = GUIDES[item.slug];
  return (
    <article>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">{guide.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{guide.minutes} min read</p>
      <p className="mt-5 text-lg leading-relaxed">{guide.intro}</p>
      <GuideBody blocks={guide.blocks} className="mt-8" />
    </article>
  );
}

const PRICING = { free: "Free", freemium: "Free tier", paid: "Paid" } as const;
const LINK = { dofollow: "Followed", nofollow: "Nofollow", unknown: "Unverified" } as const;

async function Atlas() {
  await connection();
  const dirs = await atlasDirectories();
  const tiers = atlasTiers(dirs).filter((t) => t.items.length > 0);
  return (
    <article>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Directory Atlas</h1>
      <p className="mt-5 text-lg leading-relaxed">
        All {dirs.length} directories we track, in the order we&apos;d submit to them. Authority is measured monthly,
        and &ldquo;Followed&rdquo; means our own checks saw a followed link on live listings, not just the
        directory&apos;s claim.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={`${KIT_PATH}/directory-atlas.csv`}
          className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Download CSV
        </a>
        <Link
          href="/dashboard/tracker"
          className="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:border-primary/50"
        >
          Track submissions free
        </Link>
      </div>
      {tiers.map((t, i) => (
        <section key={t.id} className="mt-12" aria-labelledby={`tier-${t.id}`}>
          <h2 id={`tier-${t.id}`} className="font-display text-2xl font-bold tracking-tight">
            {i + 1}. {t.title}
          </h2>
          <p className="mt-2 text-muted-foreground">{t.advice}</p>
          <ul className="mt-5 divide-y divide-border rounded-lg border border-border bg-card">
            {t.items.map((d) => (
              <li key={d.slug} className="flex items-center gap-4 px-4 py-3">
                <AuthorityScore score={d.dr} size="sm" />
                <div className="min-w-0 flex-1">
                  <a
                    href={d.submitUrl || d.url}
                    target="_blank"
                    rel="noopener nofollow"
                    className="font-semibold hover:text-primary"
                  >
                    {d.name}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      PRICING[d.pricing],
                      LINK[d.linkType],
                      d.badgeRequired ? "Badge required" : null,
                      d.queueEstimateDays ? `~${d.queueEstimateDays} days to go live` : null,
                      d.submissionNotes || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
