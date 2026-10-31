"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addLinkAction, linkHistoryAction, recheckLinkAction, removeLinkAction } from "@/app/dashboard/links/actions";
import { LinkVerdict } from "@/components/directories/link-verdict";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Badge, Input, Label } from "@/components/ui/primitives";

type Verdict = "dofollow" | "nofollow" | "missing" | "unreachable";

export type LinkRow = {
  id: string;
  url: string;
  target: string;
  directory: string | null;
  source: "tracker" | "order" | "manual";
  active: boolean;
  paused: boolean;
  verdict: Verdict | null;
  anchor: string | null;
  statusCode: number | null;
  checkedAt: Date | null;
  nextCheckAt: Date | null;
  /** Google index status from the weekly SERP check; null until checked. */
  indexed: boolean | null;
};

type Check = {
  id: string;
  checkedAt: Date;
  verdict: Verdict;
  httpStatus: number | null;
  rel: string | null;
  error: string | null;
  evidenceUrl: string | null;
};

const SOURCE: Record<LinkRow["source"], string> = { tracker: "tracker", order: "order", manual: "added" };
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function AddLink() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await addLinkAction({ url, domain });
          if (!res.ok) return setError(res.error);
          setUrl("");
          router.refresh();
        });
      }}
    >
      <div className="min-w-0">
        <Label htmlFor="link-url">Page that links to you</Label>
        <Input
          id="link-url"
          className="mt-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://directory.example/your-listing"
        />
      </div>
      <div className="min-w-0">
        <Label htmlFor="link-domain">Your domain</Label>
        <Input
          id="link-domain"
          className="mt-1"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="acme.io"
        />
      </div>
      <Button type="submit" disabled={pending || !url || !domain}>
        {pending ? "Checking…" : "Add & check"}
      </Button>
      {error && <p className="text-sm text-danger sm:col-span-3">{error}</p>}
    </form>
  );
}

function Row({ initial }: { initial: LinkRow }) {
  const router = useRouter();
  const [row, setRow] = useState(initial);
  const [history, setHistory] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <a
              href={row.url}
              target="_blank"
              rel="noopener nofollow"
              className="max-w-full truncate font-medium hover:text-primary"
            >
              {row.directory ?? row.url.replace(/^https?:\/\//, "")}
            </a>
            <span className="text-xs text-muted-foreground">→ {row.target}</span>
            <Badge>{SOURCE[row.source]}</Badge>
            {!row.active && <Badge tone="accent">not monitored</Badge>}
            {row.paused && <Badge tone="accent">over plan</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <LinkVerdict verdict={row.verdict} anchor={row.anchor} checkedAt={row.checkedAt} />
            {row.statusCode && <span className="text-muted-foreground">HTTP {row.statusCode}</span>}
            {row.indexed !== null && (
              <span className={row.indexed ? "text-success" : "text-muted-foreground"}>
                {row.indexed ? "indexed by Google" : "not indexed yet"}
              </span>
            )}
            {row.nextCheckAt && <span className="text-muted-foreground">next check {day(row.nextCheckAt)}</span>}
          </div>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            className="text-primary hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await recheckLinkAction(row.id);
                if (!res.ok) return setError(res.error);
                setRow((r) => ({
                  ...r,
                  verdict: res.data.lastVerdict,
                  anchor: res.data.lastAnchor,
                  statusCode: res.data.lastStatusCode,
                  checkedAt: res.data.lastCheckedAt,
                  nextCheckAt: res.data.active ? res.data.nextCheckAt : null,
                }));
                setHistory(null);
              })
            }
          >
            {pending ? "Checking…" : "Re-check"}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() =>
              history
                ? setHistory(null)
                : start(async () => {
                    const res = await linkHistoryAction(row.id);
                    if (res.ok) setHistory(res.data);
                    else setError(res.error);
                  })
            }
          >
            {history ? "Hide history" : "History"}
          </button>
          {row.source === "manual" && (
            <button
              type="button"
              className="text-muted-foreground hover:text-danger"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Stop monitoring this link?",
                  message: "We'll stop checking it, and it no longer counts toward your plan.",
                  confirmLabel: "Stop monitoring",
                  danger: true,
                });
                if (!ok) return;
                start(async () => {
                  const res = await removeLinkAction(row.id);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                });
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {history && (
        <ol className="mt-2 space-y-1 rounded-md bg-muted/40 p-3 text-xs">
          {history.length === 0 && <li className="text-muted-foreground">No checks yet.</li>}
          {history.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-2">
              <span className="w-14 text-muted-foreground">{day(c.checkedAt)}</span>
              <span className="font-medium">{c.verdict}</span>
              {c.rel && <span className="text-muted-foreground">rel=&quot;{c.rel}&quot;</span>}
              {c.httpStatus && <span className="text-muted-foreground">HTTP {c.httpStatus}</span>}
              {c.error && <span className="text-muted-foreground">{c.error}</span>}
              {c.evidenceUrl && (
                <a href={c.evidenceUrl} target="_blank" rel="noopener" className="text-primary hover:underline">
                  screenshot
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** The Link Monitor table: add a URL, re-check, see history, remove, export. */
export function LinksTable({ rows, canAdd }: { rows: LinkRow[]; canAdd: boolean }) {
  return (
    <div>
      {canAdd ? (
        <AddLink />
      ) : (
        <p className="text-sm text-muted-foreground">Remove a link or upgrade your plan to add more.</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Your links</h2>
        {rows.length > 0 && (
          <a href="/dashboard/links/export.csv" className="text-sm text-primary hover:underline">
            Export CSV
          </a>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing yet. Mark a directory live in your tracker, or add a page that links to you above.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((r) => (
            <Row key={r.id} initial={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
