import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, asc, eq, ne } from "drizzle-orm";
import { PageHeader } from "@/components/app-shell/page-header";
import { ListingPicker, NO_LISTING } from "@/components/submissions/listing-picker";
import { NextSteps, PackageCards } from "@/components/submissions/packages-view";
import { CatalogFigures, Faq, ServiceDetails, TrustChips } from "@/components/submissions/service-pitch";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { catalogStats } from "@/lib/directories/service";

export const metadata: Metadata = { title: "Submission packages", robots: { index: false } };

/** The submission service's packages, bought without leaving the dashboard. */
export default function NewOrderPage(props: PageProps<"/dashboard/orders/new">) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← Submission orders
      </Link>
      <div className="mt-3">
        <PageHeader
          title="Get listed on 40–180 directories"
          description="We submit your product by hand to directories that fit it, then verify every link ourselves. Follow it live from your submission orders."
        />
      </div>
      <TrustChips className="-mt-3 justify-start" />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Packages searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div className="mt-8 h-24 animate-pulse rounded-lg bg-muted/50" />}>
        <Figures />
      </Suspense>
      <NextSteps />
      <ServiceDetails compact />
      <Faq compact />
    </div>
  );
}

async function Packages({ searchParams }: Pick<PageProps<"/dashboard/orders/new">, "searchParams">) {
  await connection();
  const user = await requireUser("/dashboard/orders/new");
  const { product } = await searchParams;
  const listings = await db()
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(and(eq(schema.products.createdBy, user.id), ne(schema.products.status, "archived")))
    .orderBy(asc(schema.products.name));
  // From the URL (the tracker links here with one), or their only listing.
  const selected =
    product === NO_LISTING
      ? null
      : (listings.find((l) => l.id === product)?.id ?? (listings.length === 1 ? listings[0].id : null));
  return (
    <>
      {listings.length > 0 && <ListingPicker listings={listings} selected={selected} />}
      <PackageCards product={selected ?? undefined} returnTo="dashboard" showBoostNote={false} className="mt-6" />
    </>
  );
}

async function Figures() {
  await connection();
  return <CatalogFigures stats={await catalogStats()} className="mt-8" />;
}
