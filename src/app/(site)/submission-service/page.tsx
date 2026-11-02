import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PackageCards, ServiceSteps } from "@/components/submissions/packages-view";
import { COUNT_RANGE } from "@/lib/submissions/packages";
import {
  ClosingCta,
  Comparison,
  FAQ,
  Faq,
  PainPoints,
  ServiceDetails,
  TrustChips,
  ValueSection,
} from "@/components/submissions/service-pitch";
import { Container, Heading } from "@/components/ui/primitives";
import { catalogStats } from "@/lib/directories/service";

export const metadata: Metadata = {
  title: "Directory submission service",
  description: `We submit your product to ${COUNT_RANGE} niche-matched directories by hand, verify every link ourselves, and show it all on a live dashboard. No account needed.`,
  alternates: { canonical: "/submission-service" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

export default function SubmissionServicePage(props: PageProps<"/submission-service">) {
  return (
    <Container className="max-w-5xl py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />
      <Heading>Get listed on {COUNT_RANGE} directories. Done for you.</Heading>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        You keep building. We submit your product by hand to directories that fit it, verify every link ourselves, and
        you follow each one&apos;s progress on your dashboard.
      </p>
      <TrustChips />
      <ServiceSteps />
      <Suspense fallback={<div className="mt-12 h-80 animate-pulse rounded-lg bg-muted/50" />}>
        <Packages searchParams={props.searchParams} />
      </Suspense>
      <PainPoints />
      <Suspense fallback={<div className="mt-20 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Value />
      </Suspense>
      <Comparison />
      <ServiceDetails />
      <Faq />
      <ClosingCta />
    </Container>
  );
}

async function Packages({ searchParams }: Pick<PageProps<"/submission-service">, "searchParams">) {
  await connection();
  const { product } = await searchParams;
  return <PackageCards product={typeof product === "string" ? product : undefined} />;
}

async function Value() {
  await connection();
  return <ValueSection stats={await catalogStats()} />;
}
