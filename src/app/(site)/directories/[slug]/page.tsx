import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DirectoryBadges } from "@/components/directories/directory-badges";
import { DomainRating, DrAttribution } from "@/components/metrics/domain-rating";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container } from "@/components/ui/primitives";
import { getDirectory } from "@/lib/directories/service";

export async function generateMetadata(props: PageProps<"/directories/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getDirectory(slug).catch(() => null);
  if (!d) return { title: "Directory", robots: { index: false } };
  return {
    title: `${d.name}: how to submit your product`,
    description: `Submitting to ${d.name}: pricing, link type, badge requirements and how long listings take to go live.`,
    alternates: { canonical: `/directories/${d.slug}` },
  };
}

export default function DirectoryPage(props: PageProps<"/directories/[slug]">) {
  return (
    <Container className="max-w-3xl py-12">
      <Link href="/directories" className="text-sm text-muted-foreground hover:text-foreground">
        ← All directories
      </Link>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-lg bg-muted/50" />}>
        <Detail params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Detail({ params }: Pick<PageProps<"/directories/[slug]">, "params">) {
  const { slug } = await params;
  const d = await getDirectory(slug);
  if (!d) notFound();
  const host = new URL(d.url).hostname.replace(/^www\./, "");
  const facts: Array<[string, string]> = [
    ["Pricing", d.pricing],
    [
      "Link type",
      d.linkTypeObserved !== "unknown"
        ? `${d.linkTypeObserved} (verified on live listings)`
        : d.linkTypeClaimed !== "unknown"
          ? `${d.linkTypeClaimed} (as stated)`
          : "Unknown",
    ],
    ["Badge required", d.badgeRequired ? "Yes, for the free listing" : "No"],
    ["Account needed", d.needsAccount ? "Yes" : "No"],
    ["Typical queue", d.queueEstimateDays !== null ? `${d.queueEstimateDays} days` : "Unknown"],
    ["Acceptance (our data)", d.acceptanceRate !== null ? `${Math.round(d.acceptanceRate * 100)}%` : "Not enough data"],
    ["Days to live (our data)", d.avgDaysToLive !== null ? d.avgDaysToLive.toFixed(1) : "Not enough data"],
  ];
  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight">{d.name}</h1>
            <a href={d.url} target="_blank" rel="noopener nofollow" className="text-sm text-primary hover:underline">
              {host} ↗
            </a>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <DomainRating score={d.dr} size="md" />
            <DrAttribution className="text-[11px]" />
          </div>
        </div>
        {d.description && <p className="mt-3 text-muted-foreground">{d.description}</p>}
        <div className="mt-3">
          <DirectoryBadges directory={d} />
        </div>
      </div>
      <Card className="p-0">
        <dl className="divide-y divide-border text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-5 py-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right first-letter:uppercase">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {d.submissionNotes && (
        <Card className="p-5 text-sm">
          <p className="font-medium">Before you submit</p>
          <p className="mt-1 text-muted-foreground">{d.submissionNotes}</p>
        </Card>
      )}
      {d.guided && (
        <p className="rounded-md bg-accent/15 p-4 text-sm">
          {d.name} needs you personally (your own account or vendor verification), so we don&apos;t submit here for you.
          Our packages include a checklist for it instead.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={d.submitUrl ?? d.url} target="_blank" rel="noopener nofollow" variant="outline">
          Submit on {d.name}
        </ButtonLink>
        <ButtonLink href="/dashboard/tracker">Track it in your free tracker</ButtonLink>
      </div>
    </div>
  );
}
