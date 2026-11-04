"use client";

import { useEffect, useRef, useState, useTransition, type ClipboardEvent } from "react";
import {
  addDirectoryAction,
  bulkAction,
  evidenceUploadAction,
  setBadgeCodeAction,
  swapDirectoryAction,
  updateRowAction,
} from "@/app/admin/submissions/actions";
import { LinkVerdict } from "@/components/directories/link-verdict";
import { DomainRating, DrAttribution } from "@/components/metrics/domain-rating";
import { DirectoryPicker, type DirectoryChoice } from "@/components/submissions/directory-picker";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Badge, Input } from "@/components/ui/primitives";
import { awaitsScreenshot } from "@/lib/submissions/progress";
import { pastedImage, screenshotProblem, SCREENSHOT_TYPES } from "@/lib/submissions/screenshot";
import { putToStorage } from "@/lib/upload";
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
  /** What this directory shows in the client's live block. */
  badgeCode: string | null;
  /** The client has the live block, so this row can have a badge code. */
  blockLive: boolean;
  siteUrl: string | null;
  directory: {
    name: string;
    url: string;
    submitUrl: string | null;
    dr: number | null;
    badgeRequired: boolean;
    needsAccount: boolean;
    instructions: string;
    linkType: string;
  };
};

const STATUSES = ["todo", "submitted", "pending", "needs_action", "live", "rejected", "skipped", "dead"] as const;
type Status = (typeof STATUSES)[number];

/** Not live and still meant to happen, so it can still be swapped for a dofollow directory. */
const isUpcoming = (r: OpsRow) => ["todo", "submitted", "pending", "needs_action"].includes(r.status);

/** Paste a directory's badge code and it's on the client's site, ready for the directory's Verify button. */
function BadgeCodeBox({ row, onMessage }: { row: OpsRow; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [open, setOpen] = useState(row.directory.badgeRequired && !row.badgeCode && isUpcoming(row));
  const [code, setCode] = useState(row.badgeCode ?? "");
  const [pending, start] = useTransition();

  function save(value: string) {
    start(async () => {
      const res = await setBadgeCodeAction(row.id, value);
      onMessage(
        res.ok
          ? { ok: true, text: `${row.directory.name}: ${res.message ?? "saved"}` }
          : { ok: false, text: `${row.directory.name}: ${res.error}` },
      );
      if (res.ok) {
        setCode(value);
        setOpen(false);
      }
    });
  }

  return (
    <div className="mt-2 text-xs">
      {!open ? (
        <div className="flex flex-wrap items-center gap-2">
          {row.badgeCode && <Badge tone="success">badge on client site</Badge>}
          <button type="button" onClick={() => setOpen(true)} className="text-primary hover:underline">
            {row.badgeCode ? "Edit badge code" : "Add badge code"}
          </button>
          {row.badgeCode && row.siteUrl && (
            <a href={row.siteUrl} target="_blank" rel="noopener" className="text-primary hover:underline">
              Client&apos;s site ↗
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={3}
            aria-label={`Badge code for ${row.directory.name}`}
            placeholder={`Paste the badge code from ${row.directory.name}`}
            className="w-full rounded-md border border-border bg-card p-2 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending || !code.trim()} onClick={() => save(code)}>
              {pending ? "Saving…" : "Save badge"}
            </Button>
            {row.badgeCode && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => save("")}>
                Remove
              </Button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The update panel's fields, with the screenshot uploading straight away from a
 * file or a paste anywhere in the panel. It saves on the row by itself, so
 * closing the panel can't lose it.
 */
function UpdatePanel({
  rowId,
  evidence,
  setEvidence,
  onMessage,
  children,
}: {
  rowId: string;
  evidence: string;
  setEvidence: (url: string) => void;
  onMessage: (m: { ok: boolean; text: string }) => void;
  children: (field: React.ReactNode) => React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  // Ready to paste into as soon as it opens.
  useEffect(() => panel.current?.focus({ preventScroll: true }), []);

  async function upload(file: File) {
    if (uploading) return;
    const problem = screenshotProblem(file);
    if (problem) return onMessage({ ok: false, text: problem });
    setUploading(true);
    try {
      const target = await evidenceUploadAction(file.type, file.size);
      if (!target.ok) return onMessage({ ok: false, text: target.error });
      await putToStorage(target.uploadUrl, file);
      const saved = await updateRowAction(rowId, { evidenceUrl: target.publicUrl });
      if (!saved.ok) return onMessage({ ok: false, text: saved.error });
      setEvidence(target.publicUrl);
      onMessage({ ok: true, text: "Screenshot saved." });
    } catch (err) {
      onMessage({ ok: false, text: err instanceof Error ? err.message : "The upload failed. Try again." });
    } finally {
      setUploading(false);
    }
  }

  function paste(e: ClipboardEvent) {
    const image = pastedImage(e.clipboardData);
    if (!image) return;
    e.preventDefault();
    void upload(image);
  }

  const field = (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="https:// screenshot URL"
          className="h-9 min-w-48 flex-1 text-sm"
        />
        <label
          className={cn(
            "inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-card px-3 text-sm hover:bg-muted",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept={SCREENSHOT_TYPES.join(",")}
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Or paste a screenshot anywhere in this panel with Ctrl+V (⌘V on a Mac).
        {evidence && (
          <>
            {" "}
            <a href={evidence} target="_blank" rel="noopener" className="text-primary hover:underline">
              View current ↗
            </a>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div
      ref={panel}
      tabIndex={-1}
      onPaste={paste}
      className="mt-3 space-y-2 rounded-md bg-muted/40 p-3 focus:outline-none"
    >
      {children(field)}
    </div>
  );
}

function RowEditor({
  row,
  choices,
  onMessage,
}: {
  row: OpsRow;
  /** What it can be swapped for. Null when it can't be swapped. */
  choices: DirectoryChoice[] | null;
  onMessage: (m: { ok: boolean; text: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
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

  async function swap(choice: DirectoryChoice) {
    if (
      row.status !== "todo" &&
      !(await confirmDialog({
        title: `Swap ${row.directory.name} for ${choice.name}?`,
        message: `Work on ${row.directory.name} has started (${row.status}). It leaves the client's list, and ${choice.name} starts from queued.`,
        confirmLabel: "Swap",
      }))
    ) {
      return;
    }
    start(async () => {
      const res = await swapDirectoryAction(row.id, choice.id);
      onMessage(
        res.ok
          ? { ok: true, text: `${row.directory.name}: ${res.message ?? "swapped"}` }
          : { ok: false, text: `${row.directory.name}: ${res.error}` },
      );
      if (res.ok) setSwapping(false);
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
        {row.directory.dr !== null && <DomainRating score={row.directory.dr} />}
        {row.directory.badgeRequired && <Badge tone="accent">badge</Badge>}
        {row.directory.needsAccount && <Badge>account</Badge>}
        {row.replaces && <Badge>replacement</Badge>}
        {row.held && (
          <Badge tone="accent" title="Waiting for the client's badge on their site">
            held: badge
          </Badge>
        )}
        {isUpcoming(row) && row.directory.linkType !== "dofollow" && (
          <Badge tone="accent" title="Only dofollow directories should be on an order. Swap this one.">
            {row.directory.linkType === "nofollow" ? "nofollow" : "link unknown"}
          </Badge>
        )}
        <Badge tone={row.status === "live" ? "success" : row.status === "needs_action" ? "accent" : "default"}>
          {row.status}
        </Badge>
        {awaitsScreenshot({ status: row.status, evidenceUrl: row.evidenceUrl }) && (
          <Badge tone="accent" title="This doesn't count toward the order's progress until it has a screenshot.">
            needs screenshot
          </Badge>
        )}
        {row.status === "live" && (
          <LinkVerdict verdict={row.linkVerdict} anchor={row.linkAnchor} checkedAt={row.linkCheckedAt} />
        )}
        <span className="ml-auto flex gap-3">
          {choices && (
            <button
              type="button"
              onClick={() => {
                setSwapping((o) => !o);
                setOpen(false);
              }}
              className="text-xs text-primary hover:underline"
            >
              {swapping ? "Cancel swap" : "Swap"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setSwapping(false);
            }}
            className="text-xs text-primary hover:underline"
          >
            {open ? "Close" : "Update"}
          </button>
        </span>
      </div>
      {row.blockLive && (isUpcoming(row) || row.status === "live") && <BadgeCodeBox row={row} onMessage={onMessage} />}
      {swapping && choices && (
        <div className="mt-3">
          <DirectoryPicker
            label={`Directory to swap ${row.directory.name} for`}
            choices={choices}
            disabled={pending}
            onPick={swap}
          />
        </div>
      )}
      {open && (
        <UpdatePanel rowId={row.id} evidence={evidence} setEvidence={setEvidence} onMessage={onMessage}>
          {(field) => (
            <>
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
                {field}
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
            </>
          )}
        </UpdatePanel>
      )}
    </div>
  );
}

export function OpsRows({
  orderId,
  rows,
  target,
  canChange,
  choices,
}: {
  orderId: string;
  rows: OpsRow[];
  target: number;
  /** The order is active, so staff can change its directories. */
  canChange: boolean;
  choices: DirectoryChoice[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = rows.filter((r) => r.status !== "replaced");
  const q = query.trim().toLowerCase();
  const matches = (r: OpsRow) =>
    !q || [r.directory.name, r.directory.url, r.status].some((v) => v.toLowerCase().includes(q));
  const matching = rows.filter(matches);
  // What "Select all" covers: never rows the search is hiding.
  const selectable = matching.filter((r) => r.status !== "live" && r.status !== "replaced");
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

  function add(choice: DirectoryChoice) {
    start(async () => {
      const res = await addDirectoryAction(orderId, choice.id);
      setMessage(res.ok ? { ok: true, text: res.message ?? "Added." } : { ok: false, text: res.error });
      if (res.ok) setAdding(false);
    });
  }

  const notDofollow = rows.filter((r) => isUpcoming(r) && r.directory.linkType !== "dofollow").length;

  return (
    <div className="space-y-3">
      {canChange && notDofollow > 0 && (
        <p className="rounded-md bg-muted/40 p-3 text-sm">
          {notDofollow} {notDofollow === 1 ? "directory on this order isn't" : "directories on this order aren't"}{" "}
          dofollow, and the client can see {notDofollow === 1 ? "it" : "them"}. Use Swap to choose dofollow ones.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, website or status"
          aria-label="Search this order's directories"
          className="max-w-md"
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {q ? `${matching.length} of ${rows.length}` : `${rows.length} directories`}
        </p>
        <DrAttribution />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectable.length > 0 && selectable.every((r) => selected.has(r.id))}
            onChange={(e) =>
              setSelected((s) => {
                const next = new Set(s);
                for (const r of selectable) {
                  if (e.target.checked) next.add(r.id);
                  else next.delete(r.id);
                }
                return next;
              })
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
        {canChange && active.length < target && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding((o) => !o)}>
            {adding ? "Cancel" : `Add directory (${target - active.length} short)`}
          </Button>
        )}
      </div>
      {adding && canChange && (
        <DirectoryPicker label="Directory to add" choices={choices} disabled={pending} onPick={add} />
      )}
      {message && <p className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p>}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          // Hidden rather than removed, so a search can't lose what's being typed in an open row.
          <li
            key={r.id}
            className={cn("flex gap-3 py-3", r.status === "replaced" && "opacity-50", !matches(r) && "hidden")}
          >
            <input
              type="checkbox"
              className="mt-1"
              aria-label={`Select ${r.directory.name}`}
              disabled={r.status === "live" || r.status === "replaced"}
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
            />
            <RowEditor
              row={r}
              choices={canChange && r.status !== "live" && r.status !== "replaced" ? choices : null}
              onMessage={setMessage}
            />
          </li>
        ))}
      </ul>
      {matching.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No directories match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}
    </div>
  );
}
