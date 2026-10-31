"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { recheckAction, updateTrackerAction } from "@/app/dashboard/tracker/actions";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { LinkVerdict } from "./link-verdict";
import { Select } from "@/components/ui/select";

export type TrackerRow = {
  directory: {
    id: string;
    slug: string;
    name: string;
    url: string;
    submitUrl: string | null;
    dr: number | null;
    niche: string;
    pricing: string;
    badgeRequired: boolean;
    guided: boolean;
    link: string;
  };
  submission: {
    id: string;
    status: string;
    liveUrl: string | null;
    linkVerdict: "dofollow" | "nofollow" | "missing" | "unreachable" | null;
    linkAnchor: string | null;
    linkCheckedAt: Date | null;
  } | null;
};

const STATUSES = ["todo", "submitted", "pending", "live", "rejected", "skipped"] as const;
const LABELS: Record<string, string> = {
  todo: "To do",
  submitted: "Submitted",
  pending: "In review",
  live: "Live",
  rejected: "Rejected",
  skipped: "Skipped",
};

function Row({ productId, initial }: { productId: string; initial: TrackerRow }) {
  const router = useRouter();
  const [row, setRow] = useState(initial);
  const [url, setUrl] = useState(initial.submission?.liveUrl ?? "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = row.directory;
  const status = row.submission?.status ?? "todo";

  function update(next: string, liveUrl?: string) {
    setError(null);
    if (next === "live" && !liveUrl) {
      setEditingUrl(true);
      return;
    }
    start(async () => {
      const res = await updateTrackerAction({
        productId,
        directoryId: d.id,
        status: next as (typeof STATUSES)[number],
        liveUrl,
      });
      if (!res.ok) return setError(res.error);
      setRow((r) => ({ ...r, submission: res.row }));
      setEditingUrl(false);
      // Refresh the summary counts above the table.
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <AuthorityScore score={d.dr} />
          <a
            href={d.submitUrl ?? d.url}
            target="_blank"
            rel="noopener nofollow"
            className="font-medium hover:text-primary"
          >
            {d.name} ↗
          </a>
          <span className="text-xs text-muted-foreground">
            {d.pricing} · {d.link}
          </span>
          {d.badgeRequired && <Badge tone="accent">badge</Badge>}
          {d.guided && <Badge tone="accent">needs you</Badge>}
        </div>
        {status === "live" && !editingUrl && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {row.submission?.liveUrl && (
              <a
                href={row.submission.liveUrl}
                target="_blank"
                rel="noopener nofollow"
                className="max-w-64 truncate text-muted-foreground hover:text-foreground"
              >
                {row.submission.liveUrl}
              </a>
            )}
            <LinkVerdict
              verdict={row.submission?.linkVerdict ?? null}
              anchor={row.submission?.linkAnchor}
              checkedAt={row.submission?.linkCheckedAt}
            />
            <button
              type="button"
              className="text-primary hover:underline disabled:opacity-50"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await recheckAction(row.submission!.id);
                  if (res.ok) setRow((r) => ({ ...r, submission: res.row }));
                  else setError(res.error);
                })
              }
            >
              Re-check
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setEditingUrl(true)}
            >
              Edit URL
            </button>
          </div>
        )}
        {editingUrl && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update("live", url);
            }}
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… your live listing"
              className="h-8 min-w-0 flex-1 text-xs"
              autoFocus
            />
            <Button size="sm" type="submit" disabled={pending || !url}>
              {pending ? "Checking…" : "Save & verify"}
            </Button>
          </form>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <Select
        aria-label={`Status on ${d.name}`}
        value={editingUrl ? "live" : status}
        disabled={pending}
        onChange={(e) =>
          update(e.target.value, e.target.value === "live" ? row.submission?.liveUrl || undefined : undefined)
        }
        className={cn(
          "h-9 rounded-md border border-border bg-card px-2 text-sm sm:w-36",
          status === "live" && "border-success/50 text-success",
          status === "rejected" && "text-danger",
        )}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {LABELS[s]}
          </option>
        ))}
      </Select>
    </li>
  );
}

export function TrackerTable({ productId, rows }: { productId: string; rows: TrackerRow[] }) {
  const [filter, setFilter] = useState<"all" | "todo" | "active" | "live" | "nobadge">("all");
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        const st = r.submission?.status ?? "todo";
        if (filter === "todo") return st === "todo";
        if (filter === "active") return st === "submitted" || st === "pending";
        if (filter === "live") return st === "live";
        if (filter === "nobadge") return !r.directory.badgeRequired && !r.directory.guided;
        return true;
      }),
    [rows, filter],
  );
  const tabs = [
    ["all", "All"],
    ["todo", "To do"],
    ["active", "Submitted"],
    ["live", "Live"],
    ["nobadge", "No badge needed"],
  ] as const;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              filter === k
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-border">
        {shown.map((r) => (
          <Row key={r.directory.id} productId={productId} initial={r} />
        ))}
      </ul>
    </div>
  );
}
