import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ViewBeacon, VisitLink } from "@/components/board/client-bits";
import { Comments, type CommentView } from "@/components/board/comments";
import { ProductLogo } from "@/components/board/product-logo";
import { ClapButton } from "@/components/board/clap-button";
import { ScreenshotGallery } from "@/components/screenshots";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, Container } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { postsForProduct } from "@/lib/blog/service";
import { proUserIds } from "@/lib/billing/service";
import { listingRel, withRef } from "@/lib/board/links";
import { commentsFor, getProductPage, similarProducts, applauseByDay } from "@/lib/board/queries";
import { formatPeriodLabel } from "@/lib/periods";
import { formatWeekLabel, formatWeekRange } from "@/lib/weeks";

const pricingLabels: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  open_source: "Open source",
  trial: "Free trial",
};

const medals = ["", "🥇", "🥈", "🥉"];
const scopeOrder = { year: 0, month: 1, week: 2 } as const;

export async function generateMetadata(props: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getProductPage(slug, null).catch(() => null);
  if (!data) return { title: "Product", robots: { index: false } };
  const p = data.product;
  return {
    title: `${p.name}: ${p.tagline}`,
    description: p.description.slice(0, 160),
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: `${p.name} on ${site.name}`, description: p.tagline, type: "website" },
  };
}

export default function ProductPage(props: PageProps<"/p/[slug]">) {
  return (
    <Container className="py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Product params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Product({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const { slug } = await params;
  const viewer = await getCurrentUser().catch(() => null);
  const staff = viewer ? await isStaff(viewer) : false;
  const data = await getProductPage(slug, viewer ? { id: viewer.id, staff } : null);
  if (!data) notFound();

  const p = data.product;
  const [comments, similar, days, pro, stories] = await Promise.all([
    commentsFor(p.id),
    similarProducts(p.id),
    p.launchWeekKey && data.live ? applauseByDay(p.id, p.launchWeekKey) : Promise.resolve(null),
    proUserIds([p.createdBy]),
    postsForProduct(p.id).catch(() => ({ launch: null, featuredIn: [] })),
  ]);
  const rel = listingRel({ tier: p.tier, isWinner: p.isWinner, badgeStatus: data.badgeStatus });
  const href = withRef(p.websiteUrl);

  const commentViews: CommentView[] = comments.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    userId: c.userId,
    name: c.name,
    handle: c.handle,
    image: c.image,
    isMaker: c.userId === p.createdBy,
    canDelete: viewer ? viewer.id === c.userId || staff : false,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: p.name,
    description: p.tagline,
    url: p.websiteUrl,
    applicationCategory: data.categories[0]?.name ?? "Software",
    image: p.logoUrl ?? undefined,
    offers:
      p.pricingModel === "free" || p.pricingModel === "open_source"
        ? { "@type": "Offer", price: 0, priceCurrency: "USD" }
        : undefined,
  };

  return (
    <>
      {data.live && <ViewBeacon productId={p.id} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {!data.live && (
        <p className="mb-6 rounded-md bg-accent/20 p-3 text-sm">
          Preview: only you can see this page until it debuts
          {p.launchWeekKey ? ` in ${formatWeekLabel(p.launchWeekKey)}` : ""}. Status: {p.status}.
        </p>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-10">
          {/* Phones: logo and clap share the top row, the details go full width below. */}
          <header className="flex flex-wrap gap-6 sm:flex-nowrap sm:items-start">
            <ProductLogo name={p.name} src={p.logoUrl} className="size-20" />
            <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
              <h1 className="font-display text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{p.name}</h1>
              <p className="mt-1 text-lg text-muted-foreground [overflow-wrap:anywhere]">{p.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...data.awards]
                  .sort((a, b) => scopeOrder[a.scope] - scopeOrder[b.scope])
                  .map((a) => (
                    <Link key={a.id} href={`/${a.scope}/${a.periodKey}`}>
                      <Badge tone="accent">
                        {medals[a.place]} #{a.place} Debut of {a.scope === "week" ? "the week" : `the ${a.scope}`} ·{" "}
                        {formatPeriodLabel(a.scope, a.periodKey)}
                      </Badge>
                    </Link>
                  ))}
                {data.categories.map((c) => (
                  <Link key={c.slug} href={`/category/${c.slug}`}>
                    <Badge>{c.name}</Badge>
                  </Link>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <VisitLink
                  productId={p.id}
                  href={href}
                  rel={rel}
                  className={buttonVariants({ size: "lg", className: "max-w-full" })}
                >
                  <span className="truncate">Visit {p.domain}</span> ↗
                </VisitLink>
              </div>
            </div>
            {data.live && (
              <div className="ml-auto sm:ml-0">
                <ClapButton
                  productId={p.id}
                  applauded={data.applaudedByMe}
                  applause={data.applause}
                  final={data.applauseFinal}
                  signedIn={Boolean(viewer)}
                  size="lg"
                />
              </div>
            )}
          </header>

          <section>
            <h2 className="sr-only">About</h2>
            <p className="whitespace-pre-line leading-7 [overflow-wrap:anywhere]">{p.description}</p>
          </section>

          <BlogStories name={p.name} stories={stories} />

          {data.media.length > 0 && <ScreenshotGallery urls={data.media.map((m) => m.url)} name={p.name} />}

          <Comments productId={p.id} comments={commentViews} live={data.live} />
        </div>

        <aside className="space-y-6">
          <Card className="space-y-3 p-5 text-sm">
            {data.weekRank && p.launchWeekKey && (
              <Row label="Week rank">
                <Link href={`/week/${p.launchWeekKey}`} className="font-semibold hover:text-primary">
                  #{data.weekRank} in {formatWeekLabel(p.launchWeekKey)}
                </Link>
              </Row>
            )}
            {p.launchWeekKey && <Row label="Debuted">{formatWeekRange(p.launchWeekKey)}</Row>}
            <Row label="Pricing">{pricingLabels[p.pricingModel]}</Row>
            {data.maker && (
              <Row label="Maker">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={data.maker.name} src={data.maker.image} className="size-6 text-xs" />
                  {data.maker.handle ? (
                    <Link href={`/builders/${data.maker.handle}`} className="hover:text-primary">
                      {data.maker.name}
                    </Link>
                  ) : (
                    data.maker.name
                  )}
                  {pro.has(p.createdBy) && (
                    <Badge tone="primary" title="Maker Pro member">
                      Pro
                    </Badge>
                  )}
                </span>
              </Row>
            )}
            {p.twitterUrl && (
              <Row label="X">
                <a href={p.twitterUrl} rel="nofollow noopener" target="_blank" className="hover:text-primary">
                  {p.twitterUrl.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </Row>
            )}
            {p.githubUrl && (
              <Row label="GitHub">
                <a href={p.githubUrl} rel="nofollow noopener" target="_blank" className="hover:text-primary">
                  {p.githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                </a>
              </Row>
            )}
          </Card>

          {days && (
            <Card className="p-5">
              <h2 className="text-sm font-medium">Applause</h2>
              <p className="text-xs text-muted-foreground">Per day during its debut week</p>
              <ApplauseChart days={days} />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Debut week</dt>
                  <dd className="font-semibold tabular-nums">{data.debutApplause}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">All time</dt>
                  <dd className="font-semibold tabular-nums">{data.applause}</dd>
                </div>
              </dl>
            </Card>
          )}

          {data.sameWeek.length > 0 && (
            <MiniList
              title="Debuted the same week"
              items={data.sameWeek.map((s) => ({ slug: s.slug, name: s.name, tagline: s.tagline, logo: s.logoUrl }))}
            />
          )}
          {similar.length > 0 && (
            <MiniList
              title="Similar products"
              items={similar.map((s) => ({ slug: s.slug, name: s.name, tagline: s.tagline, logo: s.logo_url }))}
            />
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

function ApplauseChart({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="mt-3 flex h-24 items-end gap-1.5" role="img" aria-label={`Applause per day: ${days.join(", ")}`}>
      {days.map((n, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-sm bg-primary/80"
            style={{ height: `${Math.max(4, (n / max) * 72)}px` }}
            title={`${n}`}
          />
          <span className="text-[10px] text-muted-foreground">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function MiniList({
  title,
  items,
}: {
  title: string;
  items: Array<{ slug: string; name: string; tagline: string; logo: string | null }>;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((s) => (
          <li key={s.slug} className="flex items-center gap-3">
            <ProductLogo name={s.name} src={s.logo} className="size-8" />
            <div className="min-w-0">
              <Link href={`/p/${s.slug}`} className="block truncate text-sm font-medium hover:text-primary">
                {s.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{s.tagline}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The product's launch post (written with its maker) and other posts that cover it, under the description. */
function BlogStories({ name, stories }: { name: string; stories: Awaited<ReturnType<typeof postsForProduct>> }) {
  const { launch, featuredIn } = stories;
  if (!launch && featuredIn.length === 0) return null;
  return (
    <section className="space-y-3">
      {launch && (
        <Link
          href={`/blog/${launch.slug}`}
          className="group flex flex-col gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4 transition-colors hover:border-primary/50 sm:flex-row sm:items-center"
        >
          {launch.coverUrl && (
            // Blog covers live on R2, which next/image would need allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={launch.coverUrl}
              alt=""
              loading="lazy"
              className="aspect-video w-full shrink-0 rounded-md border border-border object-cover sm:w-40"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">The {name} launch story</p>
            <h2 className="mt-1 font-display text-lg font-semibold leading-snug group-hover:text-primary">
              {launch.title}
            </h2>
            {launch.authors.length > 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex -space-x-2">
                  {launch.authors.map((a) => (
                    <Avatar key={a.userId} name={a.name} src={a.avatarUrl} className="size-6 ring-2 ring-card" />
                  ))}
                </span>
                By {launch.authors.map((a) => a.name).join(" & ")}
              </p>
            )}
          </div>
          <span className="text-sm font-medium text-primary">Read the post →</span>
        </Link>
      )}
      {featuredIn.length > 0 && (
        <div className="text-sm">
          <h2 className="font-medium">Featured on the DebutYard blog</h2>
          <ul className="mt-1.5 space-y-1">
            {featuredIn.map((f) => (
              <li key={f.slug}>
                <Link href={`/blog/${f.slug}`} className="text-primary hover:underline">
                  {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
