import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DebutPageFlow } from "@/components/debut/debut-wizard";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { listingLimitReached } from "@/lib/products/service";

export const metadata: Metadata = { title: "Debut a product", robots: { index: false } };

/** The homepage's debut modal, step for step, without leaving the dashboard. */
export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← Products
      </Link>
      <div className="mt-3">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted/50" />}>
          <Flow />
        </Suspense>
      </div>
    </div>
  );
}

async function Flow() {
  const user = await requireUser("/dashboard/products/new");
  const full = await listingLimitReached(user.id);
  if (full) {
    return (
      <Card className="text-center">
        <p className="font-medium">{full}</p>
        <ButtonLink href="/dashboard/billing#plans" className="mt-4">
          See plans
        </ButtonLink>
      </Card>
    );
  }
  return <DebutPageFlow />;
}
