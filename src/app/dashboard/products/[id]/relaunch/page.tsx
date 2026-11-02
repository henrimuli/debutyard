import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { RelaunchCheckout } from "@/components/products/relaunch-checkout";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { formatUsd } from "@/lib/payments/skus";
import { relaunchFor } from "@/lib/products/relaunch";

export const metadata: Metadata = { title: "Feature your listing again", robots: { index: false } };

/** Reached from the email a maker gets when a paid debut finishes; there's no link to it in the dashboard. */
export default function RelaunchPage(props: PageProps<"/dashboard/products/[id]/relaunch">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← Products
      </Link>
      <Suspense fallback={<div className="mt-3 h-64 animate-pulse rounded-lg bg-muted/50" />}>
        <Offer params={props.params} />
      </Suspense>
    </div>
  );
}

async function Offer({ params }: Pick<PageProps<"/dashboard/products/[id]/relaunch">, "params">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser(`/dashboard/products/${id}/relaunch`);
  const view = await relaunchFor(user.id, id);
  if (!view) notFound();
  const { product, offer, featuredUntil } = view;

  if (featuredUntil) {
    return (
      <div className="mt-3">
        <PageHeader title={`${product.name} is featured`} />
        <Card>
          <p className="text-muted-foreground">
            It&apos;s in the featured section until{" "}
            {featuredUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}. We&apos;ll
            email you how it did when that ends, and you can add more time then.
          </p>
          <ButtonLink href="/dashboard/products" variant="outline" className="mt-4">
            Back to your products
          </ButtonLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <PageHeader
        title={`Feature ${product.name} again`}
        description={
          <>
            Covered by our{" "}
            <Link href="/refund-policy" className="text-primary hover:underline">
              money-back guarantee
            </Link>
            .
          </>
        }
      />
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-medium">{offer.days} more days in the featured section</p>
          <p className="font-display text-2xl font-bold">{formatUsd(offer.amountCents)}</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Back on the homepage as soon as you pay</li>
          <li>We&apos;ll email you how it did when the {offer.days} days are up</li>
          <li>Your product page stays permanent either way, with its dofollow link and no badge required</li>
        </ul>
        <RelaunchCheckout productId={product.id} providers={enabledProviders()} />
      </Card>
    </div>
  );
}
