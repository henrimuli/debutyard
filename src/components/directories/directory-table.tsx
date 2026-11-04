"use client";

import Link from "next/link";
import { useState } from "react";
import { starDirectoryAction } from "@/app/admin/directories/actions";
import { DomainRating, DrAttribution } from "@/components/metrics/domain-rating";
import { Badge, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

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
  starred: boolean;
  auditFailures: number;
  auditError: string | null;
  acceptanceRate: number | null;
  liveCount: number;
};

/** The admin's directory list, with stars and a search over name, website, niche, link type and "starred". */
export function DirectoryTable({ rows }: { rows: DirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [starred, setStarred] = useState(() => new Set(rows.filter((d) => d.starred).map((d) => d.id)));
  const [problem, setProblem] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((d) =>
        [d.name, d.slug, d.url, d.niche, d.linkType, starred.has(d.id) ? "starred" : ""].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
    : rows;

  const setStar = (id: string, on: boolean) =>
    setStarred((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Shows right away, and the row stays put until the next visit, so starring several doesn't move them around. */
  async function toggle(d: DirectoryRow) {
    const on = !starred.has(d.id);
    setProblem(null);
    setStar(d.id, on);
    const res = await starDirectoryAction(d.id, on).catch(() => null);
    if (!res?.ok) {
      setStar(d.id, !on);
      setProblem(`Couldn't change the star on ${d.name}. ${res?.error ?? "Try again."}`);
    }
  }

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
          {starred.size > 0 && ` · ${starred.size} starred`}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Starred directories are picked first for new orders and replacements, as long as they&apos;re active, dofollow
        and not guided.
      </p>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2 font-medium">
                <span className="sr-only">Starred</span>
              </th>
              <th className="px-3 py-2 font-medium">Directory</th>
              <th className="px-3 py-2 font-medium">
                <DrAttribution />
              </th>
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
                  <button
                    type="button"
                    onClick={() => void toggle(d)}
                    aria-pressed={starred.has(d.id)}
                    aria-label={`Star ${d.name}`}
                    title={starred.has(d.id) ? "Starred: picked first for orders" : "Star this directory"}
                    className={cn(
                      "text-lg leading-none",
                      starred.has(d.id) ? "text-amber-500" : "text-muted-foreground hover:text-amber-500",
                    )}
                  >
                    {starred.has(d.id) ? "★" : "☆"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/directories/${d.id}`} className="font-medium hover:text-primary">
                    {d.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <DomainRating score={d.dr} />
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
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
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
