"use client";

import { useState } from "react";
import { IconAlert, IconWarning } from "@/components/blog-admin/icons";
import { Modal, ScoreChip, TextInput } from "@/components/blog-admin/ui";
import { Button } from "@/components/ui/button";
import type { SeoReport } from "@/lib/blog/seo/analyze";

/** `datetime-local` wants local wall time without a zone: 2026-10-31T14:30 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublishDialog({
  report,
  blockers,
  serverBlockers,
  isLive,
  hasChanges,
  scheduledFor,
  launchNote,
  busy,
  onConfirm,
  onClose,
}: {
  report: SeoReport;
  blockers: string[];
  serverBlockers: string[];
  isLive: boolean;
  hasChanges: boolean;
  /** Existing future publish date, if the post is already scheduled. */
  scheduledFor: string | null;
  /** Launch posts: what happens for the maker when it goes live. */
  launchNote: string | null;
  busy: boolean;
  onConfirm: (publishedAt: string | null) => void;
  onClose: () => void;
}) {
  // The dialog is short-lived, so "in the past" is judged against when it opened.
  const [openedAt] = useState(Date.now);
  const [when, setWhen] = useState<"now" | "later">(scheduledFor ? "later" : "now");
  const [date, setDate] = useState(() =>
    toLocalInput(scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 3_600_000)),
  );

  const all = [...new Set([...blockers, ...serverBlockers])];
  const fails = report.checks.filter((c) => c.status === "fail");
  const warns = report.checks.filter((c) => c.status === "warn");
  const scheduledDate = new Date(date);
  const badDate = when === "later" && (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= openedAt);
  const verb = isLive ? "Update post" : when === "later" ? "Schedule" : "Publish";

  return (
    <Modal
      title={isLive ? "Update the live post" : "Publish post"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || all.length > 0 || badDate || (isLive && !hasChanges && when === "now")}
            onClick={() => onConfirm(when === "later" ? scheduledDate.toISOString() : null)}
          >
            {busy ? "Working…" : verb}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {all.length > 0 ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-danger">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <IconAlert className="size-5" /> Fix these before publishing
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {all.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
          <ScoreChip score={report.score} className="text-base" />
          <p className="text-sm">
            {fails.length + warns.length === 0
              ? "The SEO checklist is clear."
              : `${fails.length} to fix and ${warns.length} to improve. These don't block publishing.`}
          </p>
        </div>

        {fails.length > 0 ? (
          <ul className="space-y-1.5">
            {fails.slice(0, 4).map((c) => (
              <li key={c.id} className="flex gap-2 text-sm">
                <IconWarning className="mt-0.5 text-amber-500" />
                <span>
                  <strong className="font-medium">{c.title}:</strong> {c.detail}
                </span>
              </li>
            ))}
            {fails.length > 4 ? (
              <li className="pl-6 text-sm text-muted-foreground">…and {fails.length - 4} more in the SEO tab</li>
            ) : null}
          </ul>
        ) : null}

        {launchNote ? (
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{launchNote}</p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="when"
              checked={when === "now"}
              onChange={() => setWhen("now")}
              className="accent-primary"
            />
            {isLive ? "Update the live post now" : "Publish now"}
          </label>
          {!isLive || scheduledFor ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="when"
                checked={when === "later"}
                onChange={() => setWhen("later")}
                className="accent-primary"
              />
              Schedule for later
            </label>
          ) : null}
          {when === "later" ? (
            <div>
              <TextInput
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Publish date and time"
              />
              {badDate ? <p className="mt-1 text-sm text-danger">Choose a time in the future.</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Goes live automatically at this time (your time zone).
              </p>
            </div>
          ) : null}
        </fieldset>
      </div>
    </Modal>
  );
}
