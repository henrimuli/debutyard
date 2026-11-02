"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { Badge, Input } from "@/components/ui/primitives";

export type DirectoryRow = {
  id: string;
  name: string;
  slug: string;
  url: string;
  dr: number | null;
  niche: string;
  linkType: string;
  badgeRequired: boolean;
  guided: boolean;
  hasInstructions: boolean;
  isActive: boolean;
  auditFailures: number;
  auditError: string | null;
  acceptanceRate: number | null;
  liveCount: number;
};

/** The admin's directory list, with a search over name, website, niche and link type. */
export function DirectoryTable({ rows }: { rows: DirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((d) => [d.name, d.slug, d.url, d.niche, d.linkType].some((v) => v.toLowerCase().includes(q)))
    : rows;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, website, niche or link type"
          aria-label="Search directories"
          className="max-w-md"
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {q ? `${shown.length} of ${rows.length}` : `${rows.length} directories`}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Directory</th>
              <th className="px-3 py-2 font-medium">Authority</th>
              <th className="px-3 py-2 font-medium">Niche</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Flags</th>
              <th className="px-3 py-2 text-right font-medium">Accepted</th>
              <th className="px-3 py-2 text-right font-medium">Live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((d) => (
              <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                <td className="px-3 py-2">
                  <Link href={`/admin/directories/${d.id}`} className="font-medium hover:text-primary">
                    {d.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <AuthorityScore score={d.dr} />
                </td>
                <td className="px-3 py-2">{d.niche}</td>
                <td className="px-3 py-2">{d.linkType}</td>
                <td className="space-x-1 px-3 py-2">
                  {d.badgeRequired && <Badge tone="accent">badge</Badge>}
                  {d.guided && <Badge tone="accent">guided</Badge>}
                  {d.hasInstructions && <Badge>instructions</Badge>}
                  {!d.isActive && <Badge>inactive</Badge>}
                  {d.auditFailures > 0 && (
                    <Badge tone="accent" title={d.auditError ?? undefined}>
                      {d.isActive ? `audit failed ×${d.auditFailures}` : "down (audit)"}
                    </Badge>
                  )}
                  {d.auditFailures === 0 && d.auditError && <Badge title={d.auditError}>blocked</Badge>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {d.acceptanceRate !== null ? `${Math.round(d.acceptanceRate * 100)}%` : "–"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{d.liveCount}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No directories match &ldquo;{query.trim()}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
