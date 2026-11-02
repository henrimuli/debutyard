import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { COUNT_RANGE, PACKAGES } from "@/lib/submissions/packages";
import { ordersForUser } from "@/lib/submissions/service";

export const metadata: Metadata = { title: "Submission orders", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Submission orders"
        description="Done-for-you directory submissions. We submit by hand, then verify every listing is live, dofollow and indexed."
        actions={
          <ButtonLink href="/dashboard/orders/new" variant="outline">
            See packages
          </ButtonLink>
        }
      />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/50" />}>
        <Orders />
      </Suspense>
    </div>
  );
}

async function Orders() {
  const user = await requireUser("/dashboard/orders");
  const orders = await ordersForUser(user.id, user.email);
  if (orders.length === 0) {
    return (
      <Card className="text-center">
        <p className="font-medium">No submission orders yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Get listed on {COUNT_RANGE} niche-matched directories, with every link tracked here.
        </p>
        <ButtonLink href="/dashboard/orders/new" className="mt-4">
          Get listed on {PACKAGES.starter.count}+ directories
        </ButtonLink>
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map(({ o, live, total }) => (
        <li key={o.id}>
          <Link
            href={`/dashboard/orders/${o.intakeToken}`}
            className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{o.productName ?? "Waiting for your product details"}</p>
              <p className="text-sm text-muted-foreground">{PACKAGES[o.package].label} package</p>
            </div>
            {o.status === "awaiting_intake" ? (
              <Badge tone="accent">Add your details →</Badge>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${total ? Math.round((live / total) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-muted-foreground">
                  {live}/{total} live
                </span>
                <Badge>{o.status.replace("_", " ")}</Badge>
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
