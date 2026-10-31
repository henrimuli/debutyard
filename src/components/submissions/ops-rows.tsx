"use client";

import { useState, useTransition } from "react";
import { bulkAction, updateRowAction } from "@/app/admin/submissions/actions";
import { LinkVerdict } from "@/components/directories/link-verdict";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export type OpsRow = {
  id: string;
  status: string;
  liveUrl: string | null;
  notes: string;
  actionNeeded: string | null;
  evidenceUrl: string | null;
  linkVerdict: "dofollow" | "nofollow" | "missing" | "unreachable" | null;
  linkAnchor: string | null;
  linkCheckedAt: Date | null;
  replaces: boolean;
  accountLogin: string | null;
  hasPassword: boolean;
  /** Badge-gated and the client's badge isn't on their site yet. */
  held: boolean;
  badgeSeen: boolean;
  directory: {
    name: string;
    url: string;
    submitUrl: string | null;
    dr: number | null;
    badgeRequired: boolean;
    needsAccount: boolean;
    instructions: string;
  };
};

const STATUSES = ["todo", "submitted", "pending", "needs_action", "live", "rejected", "skipped", "dead"] as const;
type Status = (typeof STATUSES)[number];

function RowEditor({ row, onMessage }: { row: OpsRow; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(row.status as Status);
  const [liveUrl, setLiveUrl] = useState(row.liveUrl ?? "");
  const [notes, setNotes] = useState(row.notes);
  const [action, setAction] = useState(row.actionNeeded ?? "");
  const [evidence, setEvidence] = useState(row.evidenceUrl ?? "");
  const [login, setLogin] = useState(row.accountLogin ?? "");
  const [password, setPassword] = useState("");
  const [badgeSeen, setBadgeSeen] = useState(row.badgeSeen);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateRowAction(row.id, {
        status,
        liveUrl,
        notes,
        actionNeeded: action,
        evidenceUrl: evidence,
        accountLogin: login,
        accountPassword: password || undefined,
        ...(row.directory.badgeRequired ? { badgeSeen } : {}),
      });
      onMessage(
        res.ok
          ? { ok: true, text: `${row.directory.name}: ${res.message ?? "saved"}` }
          : { ok: false, text: `${row.directory.name}: ${res.error}` },
      );
      if (res.ok) setOpen(false);
    });
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={row.directory.submitUrl ?? row.directory.url}
          target="_blank"
          rel="noopener nofollow"
          className="font-medium hover:text-primary"
        >
          {row.directory.name} ↗
        </a>
        {row.directory.dr !== null && <AuthorityScore score={row.directory.dr} />}
        {row.directory.badgeRequired && <Badge tone="accent">badge</Badge>}
        {row.directory.needsAccount && <Badge>account</Badge>}
        {row.replaces && <Badge>replacement</Badge>}
        {row.held && (
          <Badge tone="accent" title="Waiting for the client's badge on their site">
            held: badge
          </Badge>
        )}
        <Badge tone={row.status === "live" ? "success" : row.status === "needs_action" ? "accent" : "default"}>
          {row.status}
        </Badge>
        {row.status === "live" && (
          <LinkVerdict verdict={row.linkVerdict} anchor={row.linkAnchor} checkedAt={row.linkCheckedAt} />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-xs text-primary hover:underline"
        >
          {open ? "Close" : "Update"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
          {row.directory.instructions && (
            <p className="whitespace-pre-line rounded bg-card p-2 text-xs text-muted-foreground">
              {row.directory.instructions}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Input
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="Live listing URL (required for live)"
              className="h-9 text-sm"
            />
            <span className="self-center text-xs text-muted-foreground">Client sees</span>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Action needed from the client (needs_action)"
              className="h-9 text-sm"
            />
            <span className="self-center text-xs text-muted-foreground">Evidence</span>
            <Input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="https:// screenshot URL"
              className="h-9 text-sm"
            />
            <span className="self-center text-xs text-muted-foreground">Account</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Login email or username"
                className="h-9 text-sm"
                autoComplete="off"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={row.hasPassword ? "Password saved (type to replace)" : "Password (encrypted)"}
                className="h-9 text-sm"
                autoComplete="new-password"
              />
            </div>
            {row.directory.badgeRequired && (
              <>
                <span className="self-center text-xs text-muted-foreground">Badge</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={badgeSeen} onChange={(e) => setBadgeSeen(e.target.checked)} />
                  The client&apos;s badge for this directory is on their site
                </label>
              </>
            )}
            <span className="self-center text-xs text-muted-foreground">Internal notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-md border border-border bg-card p-2 text-sm"
              placeholder="Captcha, verification, anything odd…"
            />
          </div>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : status === "live" ? "Save & verify link" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function OpsRows({ orderId, rows }: { orderId: string; rows: OpsRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = rows.filter((r) => r.status !== "replaced");
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function bulk(status: "submitted" | "pending" | "skipped" | "todo") {
    start(async () => {
      const res = await bulkAction(orderId, [...selected], status);
      setMessage(res.ok ? { ok: true, text: res.message ?? "Updated." } : { ok: false, text: res.error });
      if (res.ok) setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === active.filter((r) => r.status !== "live").length}
            onChange={(e) =>
              setSelected(
                e.target.checked ? new Set(active.filter((r) => r.status !== "live").map((r) => r.id)) : new Set(),
              )
            }
          />
          Select all
        </label>
        <span className="text-muted-foreground">{selected.size} selected</span>
        {(["submitted", "pending", "skipped", "todo"] as const).map((s) => (
          <Button key={s} size="sm" variant="outline" disabled={pending || selected.size === 0} onClick={() => bulk(s)}>
            Mark {s}
          </Button>
        ))}
      </div>
      {message && <p className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p>}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex gap-3 py-3", r.status === "replaced" && "opacity-50")}>
            <input
              type="checkbox"
              className="mt-1"
              aria-label={`Select ${r.directory.name}`}
              disabled={r.status === "live" || r.status === "replaced"}
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
            />
            <RowEditor row={r} onMessage={setMessage} />
          </li>
        ))}
      </ul>
    </div>
  );
}
