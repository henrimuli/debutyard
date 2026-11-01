import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon, type IconName } from "@/components/app-shell/icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { ProductLogo } from "@/components/board/product-logo";
import { DrChart } from "@/components/metrics/dr-chart";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { bookingsForUser } from "@/lib/ads/service";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/billing/entitlements";
import { formatLimit } from "@/lib/billing/plans";
import { isFollowed } from "@/lib/board/links";
import { linkUsage } from "@/lib/links/service";
import { drEnabled, drHistory } from "@/lib/metrics/service";
import { dashboardProducts } from "@/lib/products/dashboard";
import { TIERS } from "@/lib/products/input";
import { hasStarted } from "@/lib/products/service";
import { statusLabel, statusTone } from "@/lib/products/status";
import { ordersForUser } from "@/lib/submissions/service";
import { formatWeekLabel } from "@/lib/weeks";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardOverview(props: PageProps<"/dashboard">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
    </div>
  );
}

type Task = { text: string; href: string; cta: string };

async function Overview({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const user = await requireUser("/dashboard");
  const params = await searchParams;
  const [items, orders, bookings, usage] = await Promise.all([
    dashboardProducts(user.id),
    ordersForUser(user.id, user.email),
    bookingsForUser(user.id),
    linkUsage(user.id),
  ]);

  const sum = (k: "applause" | "views_30d" | "clicks_30d") => items.reduce((n, i) => n + i.stats[k], 0);
  const live = items.filter((i) => i.product.status === "approved" && hasStarted(i.product.launchWeekKey));
  const firstName = user.name?.split(" ")[0];

  const tasks: Task[] = [];
  for (const { product: p, badge } of items) {
    if (p.status === "draft")
      tasks.push({ text: `${p.name} is a draft.`, href: `/dashboard/products/${p.id}/plan`, cta: "Choose a plan" });
    if (p.status === "rejected")
      tasks.push({ text: `${p.name} wasn't approved.`, href: `/dashboard/products/${p.id}`, cta: "Edit and resubmit" });
    const followed = isFollowed({ tier: p.tier, isWinner: p.isWinner, badgeStatus: badge?.status ?? "unverified" });
    if (badge && p.tier === "free" && !p.isWinner && !followed && p.status !== "rejected" && p.status !== "archived")
      tasks.push({
        text: `Add the badge to ${p.domain} to keep ${p.name}'s link followed.`,
        href: `/dashboard/products#product-${p.id}`,
        cta: "Get the badge",
      });
  }
  for (const { o } of orders) {
    if (o.status === "awaiting_intake")
      tasks.push({
        text: "A directory submission order is waiting for your product details.",
        href: `/dashboard/orders/${o.intakeToken}`,
        cta: "Add details",
      });
  }

  const activeAds = bookings.filter((b) => b.b.status === "active" || b.b.status === "held").length;
  const liveSubmissions = orders.reduce((n, o) => n + o.live, 0);

  const stats: Array<{ label: string; value: string | number; note: string; icon: IconName }> = [
    { label: "Products", value: items.length, note: `${live.length} live`, icon: "products" },
    { label: "Applause", value: sum("applause"), note: "all time", icon: "review" },
    { label: "Views", value: sum("views_30d"), note: "last 30 days", icon: "overview" },
    { label: "Clicks to your sites", value: sum("clicks_30d"), note: "last 30 days", icon: "external" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Overview"}
        description="How your debuts are doing, and what needs you next."
        actions={
          <ButtonLink href="/dashboard/products/new">
            <Icon name="plus" />
            Debut a product
          </ButtonLink>
        }
      />

      {params.submitted && (
        <p className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          Submitted! We review new listings within 24 hours and will email you when it&apos;s scheduled. Paid debuts go
          live the moment they&apos;re approved.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <p className="text-sm">{s.label}</p>
              <Icon name={s.icon} />
            </div>
            <p className="mt-2 font-display text-3xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-6">
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Your products</h2>
              <Link href="/dashboard/products" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="font-medium">You haven&apos;t submitted anything yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Paste your URL and we&apos;ll fill in what we can.</p>
                <ButtonLink href="/dashboard/products/new" className="mt-4">
                  Debut your product
                </ButtonLink>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.slice(0, 6).map(({ product: p, stats: st }) => {
                  const isLive = p.status === "approved" && hasStarted(p.launchWeekKey);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/products#product-${p.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50"
                      >
                        <ProductLogo name={p.name} src={p.logoUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            <Badge tone={statusTone[p.status]}>{isLive ? "Live" : statusLabel[p.status]}</Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {TIERS[p.tier].label}
                            {p.launchWeekKey && ` · ${formatWeekLabel(p.launchWeekKey)}`}
                          </p>
                        </div>
                        <div className="hidden gap-5 text-right text-xs text-muted-foreground sm:flex">
                          <span>
                            <span className="block font-display text-base font-semibold text-foreground">
                              {st.applause}
                            </span>
                            applause
                          </span>
                          <span>
                            <span className="block font-display text-base font-semibold text-foreground">
                              {st.clicks_30d}
                            </span>
                            clicks
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Suspense fallback={null}>
            <DomainRating userId={user.id} domains={items.map((i) => i.product.domain)} />
          </Suspense>
        </section>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Next steps</h2>
            {tasks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {tasks.slice(0, 6).map((t, i) => (
                  <li key={i} className="rounded-md border border-border p-3 text-sm">
                    <p>{t.text}</p>
                    <Link href={t.href} className="mt-1 inline-block font-medium text-primary hover:underline">
                      {t.cta} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Growth</h2>
            <ul className="mt-3 divide-y divide-border text-sm">
              <GrowthRow
                href="/dashboard/links"
                icon="links"
                label="Link Monitor"
                value={`${usage.used} / ${formatLimit(usage.limit)}`}
              />
              <GrowthRow
                href="/dashboard/orders"
                icon="orders"
                label="Directory listings live"
                value={orders.length ? String(liveSubmissions) : "–"}
              />
              <GrowthRow
                href="/dashboard/sponsorships"
                icon="megaphone"
                label="Active sponsorships"
                value={String(activeAds)}
              />
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function GrowthRow({ href, icon, label, value }: { href: string; icon: IconName; label: string; value: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-2.5 hover:text-primary">
        <Icon name={icon} className="size-4 text-muted-foreground" />
        <span className="flex-1">{label}</span>
        <span className="font-medium">{value}</span>
      </Link>
    </li>
  );
}

/** Maker Pro: Authority Score over time for each of the maker's product domains. */
async function DomainRating({ userId, domains }: { userId: string; domains: Array<string | null> }) {
  if (!drEnabled() || !(await can(userId, "dr_tracking"))) return null;
  const unique = domains.filter((d, i, all): d is string => !!d && all.indexOf(d) === i);
  const histories = await Promise.all(unique.map(async (d) => ({ domain: d, points: await drHistory(d) })));
  if (histories.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">Authority Score</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Measured weekly. We email you if it drops by 5 points or more.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {histories.map((h) => (
          <div key={h.domain} className="rounded-md border border-border p-4">
            <p className="mb-2 text-sm font-medium">{h.domain}</p>
            {h.points.length ? (
              <DrChart points={h.points} since="first check" />
            ) : (
              <p className="text-sm text-muted-foreground">First reading within a day.</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
