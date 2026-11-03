"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { replyAction, saveSettingsAction, type ActionResult } from "@/app/admin/outreach/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/outreach", label: "Overview" },
  { href: "/admin/outreach/inbox", label: "Inbox" },
  { href: "/admin/outreach/sent", label: "Emails" },
  { href: "/admin/outreach/prospects", label: "Prospects" },
  { href: "/admin/outreach/experiments", label: "Experiments" },
];

export function OutreachTabs() {
  const path = usePathname();
  return (
    <nav
      aria-label="Outreach sections"
      className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
    >
      {TABS.map((t) => {
        const active = t.href === "/admin/outreach" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  const text = result.ok ? result.message : result.error;
  if (!text) return null;
  return (
    <p role="status" className={cn("text-sm", result.ok ? "text-muted-foreground" : "text-red-600 dark:text-red-400")}>
      {text}
    </p>
  );
}

/** A button that runs a server action and shows how it went. */
export function ActionButton({
  action,
  label,
  variant = "outline",
  ask,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  variant?: "primary" | "outline" | "secondary" | "ghost";
  /** Asks first: for things that can't be taken back. */
  ask?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (ask && !window.confirm(ask)) return;
          start(async () => setResult(await action()));
        }}
      >
        {pending ? "Working…" : label}
      </Button>
      <Feedback result={result} />
    </div>
  );
}

export function SettingsForm({
  initial,
  canGoLive,
  mailboxCount,
  capacity,
}: {
  initial: { mode: string; dailyLimit: number; maxAuthority: number };
  canGoLive: boolean;
  mailboxCount: number;
  /** Emails a day the mailboxes allow between them. */
  capacity: number;
}) {
  const [mode, setMode] = useState(initial.mode);
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [maxAuthority, setMaxAuthority] = useState(String(initial.maxAuthority));
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const over = mailboxCount > 0 && Number(dailyLimit) > capacity;
  return (
    <form
      className="grid gap-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction({ mode, dailyLimit, maxAuthority });
          setResult(r.ok ? { ok: true, message: "Saved." } : r);
        });
      }}
    >
      <div>
        <Label htmlFor="outreach-mode">Mode</Label>
        <Select id="outreach-mode" className="mt-1" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="off">Off: only reads replies</option>
          <option value="dry_run">Dry run: writes drafts, sends nothing</option>
          <option value="live" disabled={!canGoLive}>
            Live: sends email
          </option>
        </Select>
      </div>
      <div>
        <Label htmlFor="outreach-limit">Emails per day</Label>
        <Input
          id="outreach-limit"
          className="mt-1"
          type="number"
          min={0}
          max={5000}
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="outreach-authority">Skip sites above this Authority Score</Label>
        <Input
          id="outreach-authority"
          className="mt-1"
          type="number"
          min={1}
          max={100}
          value={maxAuthority}
          onChange={(e) => setMaxAuthority(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Feedback result={result} />
      </div>
      {over && (
        <p className="text-sm text-amber-700 dark:text-amber-400 sm:col-span-3">
          Only {capacity} a day will go out:{" "}
          {mailboxCount === 1 ? "this mailbox allows" : `these ${mailboxCount} mailboxes allow`} that many. Add
          mailboxes to send more.
        </p>
      )}
      {mode === "live" && (
        <p className="text-sm text-muted-foreground sm:col-span-3">
          Drafts under three days old go out first, so check or discard them under Emails before saving.
        </p>
      )}
    </form>
  );
}

export function ReplyBox({ threadId, disabled }: { threadId: string; disabled?: boolean }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <form
      className="mt-4 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyAction(threadId, body);
          setResult(r);
          if (r.ok) setBody("");
        });
      }}
    >
      <Label htmlFor="outreach-reply">Reply</Label>
      <textarea
        id="outreach-reply"
        rows={6}
        value={body}
        disabled={disabled}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        placeholder={disabled ? "Set up the outreach mailbox to reply from here." : "Write your reply…"}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || disabled || !body.trim()}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
        <Feedback result={result} />
      </div>
    </form>
  );
}
