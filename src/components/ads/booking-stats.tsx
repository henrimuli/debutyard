import { Badge } from "@/components/ui/primitives";
import { cpcCents, PLACEMENTS } from "@/lib/ads/placements";
import type { Booking } from "@/lib/ads/service";
import { formatUsd } from "@/lib/payments/skus";
import { formatWeekLabel } from "@/lib/weeks";

const tone = { held: "accent", active: "success", completed: "default", cancelled: "default" } as const;

export function BookingStatsTable({
  rows,
  showBuyer = false,
}: {
  rows: Array<{ b: Booking; productName: string; paidCents: number | null; email?: string | null }>;
  showBuyer?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Slot</th>
            <th className="px-3 py-2 font-medium">Listing</th>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 text-right font-medium">Impressions</th>
            <th className="px-3 py-2 text-right font-medium">Clicks</th>
            <th className="px-3 py-2 text-right font-medium">CPC</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ b, productName, paidCents, email }) => {
            const cpc = cpcCents(paidCents ?? 0, b.clicks);
            return (
              <tr key={b.id}>
                <td className="px-3 py-2">
                  {PLACEMENTS[b.placement].label}
                  {b.categorySlug && <span className="text-muted-foreground"> · {b.categorySlug}</span>}
                </td>
                <td className="px-3 py-2">
                  {productName}
                  {showBuyer && email && <span className="block text-xs text-muted-foreground">{email}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatWeekLabel(b.weekKey)}
                  {b.subscriptionId ? " · recurring" : b.weeks > 1 && ` +${b.weeks - 1}w`}
                  {b.extensions > 0 && <span className="text-success"> +{b.extensions} free</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{b.impressions}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.clicks}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {cpc !== null && paidCents ? formatUsd(cpc) : "–"}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={tone[b.status]}>{b.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
