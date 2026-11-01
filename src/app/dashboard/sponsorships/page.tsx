import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingModalScope, BookSlotButton } from "@/components/ads/booking-modal";
import { BookingSection } from "@/components/ads/booking-section";
import { BookingStatsTable } from "@/components/ads/booking-stats";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge, Card } from "@/components/ui/primitives";
import { PLACEMENTS } from "@/lib/ads/placements";
import { bookingsForUser } from "@/lib/ads/service";
import { requireUser } from "@/lib/auth";
import { formatUsd, getSku } from "@/lib/payments/skus";

export const metadata: Metadata = { title: "Sponsorships", robots: { index: false } };

export default function SponsorshipsPage() {
  return (
    <BookingModalScope
      form={
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted/50" />}>
          <BookingSection area="dashboard" />
        </Suspense>
      }
    >
      <div className="mx-auto max-w-5xl space-y-10">
        <PageHeader
          title="Sponsorships"
          description="Featured slots on the leaderboard, homepage, categories and newsletter, with click stats."
          actions={<BookSlotButton placement="leaderboard">Book a slot</BookSlotButton>}
        />
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/50" />}>
          <Bookings />
        </Suspense>
        <Placements />
      </div>
    </BookingModalScope>
  );
}

async function Bookings() {
  const user = await requireUser("/dashboard/sponsorships");
  const rows = await bookingsForUser(user.id);
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">Your bookings</h2>
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-muted-foreground">
          No bookings yet. Pick a placement below to promote an approved listing.
        </Card>
      ) : (
        <BookingStatsTable rows={rows} />
      )}
    </section>
  );
}

/** Featured placement prices, shown here rather than on a public pricing page. */
function Placements() {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Featured placements</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Capped slots with click reporting. Where marked, if your cost per click isn&apos;t under $1 by the end, the slot
        stays up free until it is.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(PLACEMENTS).map((pl) => (
          <Card key={pl.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium">{pl.label}</h3>
              {pl.cpcGuarantee && <Badge tone="primary">CPC guarantee</Badge>}
            </div>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{pl.description}</p>
            <ul className="mt-4 space-y-1 text-sm">
              {Object.entries(pl.skus).map(([period, skuId]) => {
                const sku = getSku(skuId);
                return sku ? (
                  <li key={period} className="flex justify-between">
                    <span className="text-muted-foreground">Per {pl.id === "newsletter" ? "issue" : period}</span>
                    <span className="font-semibold">{formatUsd(sku.amountCents)}</span>
                  </li>
                ) : null;
              })}
            </ul>
            <BookSlotButton placement={pl.id} variant="outline" size="sm" className="mt-4">
              Pick dates
            </BookSlotButton>
          </Card>
        ))}
      </div>
    </section>
  );
}
