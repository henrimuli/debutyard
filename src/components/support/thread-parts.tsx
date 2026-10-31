"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { assignAction, starAction, statusAction, unreadAction } from "@/app/admin/email/actions";
import { Icon, type IconName } from "@/components/app-shell/icons";
import { Button } from "@/components/ui/button";
import { displayHtml, hasRemoteImages } from "@/lib/support/rules";
import { cn } from "@/lib/utils";
import { Composer, type ComposeMode } from "./composer";
import { pollInbox } from "./live-inbox";
import { Select } from "@/components/ui/select";

type Status = "open" | "done" | "spam" | "trash";

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <Icon name={icon} className="size-[18px]" />
    </button>
  );
}

/** Back to the list, then done, spam, trash, mark unread, and who's on it. */
export function ThreadToolbar({
  threadId,
  status,
  assigneeId,
  staff,
  backHref,
}: {
  threadId: string;
  status: Status;
  assigneeId: string | null;
  staff: Array<{ id: string; name: string }>;
  backHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Opening the conversation marked it read: update the sidebar badge now.
  useEffect(() => {
    void pollInbox();
  }, [threadId]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, leave = true) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      if (leave) router.push(backHref);
    });

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
      <Link
        href={backHref}
        title="Back"
        aria-label="Back"
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name="back" className="size-[18px]" />
      </Link>
      <span className="mx-1 h-5 w-px bg-border" />
      {status === "done" || status === "trash" || status === "spam" ? (
        <ToolButton
          icon="inbox"
          label={status === "spam" ? "Not spam" : "Move to inbox"}
          disabled={pending}
          onClick={() => act(() => statusAction([threadId], "open"))}
        />
      ) : (
        <ToolButton
          icon="check"
          label="Done"
          disabled={pending}
          onClick={() => act(() => statusAction([threadId], "done"))}
        />
      )}
      {status !== "spam" && (
        <ToolButton
          icon="alert"
          label="Report spam"
          disabled={pending}
          onClick={() => act(() => statusAction([threadId], "spam"))}
        />
      )}
      {status !== "trash" && (
        <ToolButton
          icon="trash"
          label="Delete"
          disabled={pending}
          onClick={() => act(() => statusAction([threadId], "trash"))}
        />
      )}
      <ToolButton
        icon="mail"
        label="Mark as unread"
        disabled={pending}
        onClick={() => act(() => unreadAction([threadId], true))}
      />
      <label className="ml-auto flex items-center gap-2 pr-1 text-sm text-muted-foreground">
        <span className="hidden sm:inline">Assignee</span>
        <Select
          defaultValue={assigneeId ?? ""}
          disabled={pending}
          onChange={(e) => act(() => assignAction(threadId, e.target.value || null), false)}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      {error && <p className="w-full px-2 pb-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** A star that toggles without leaving the page; works in list rows and the thread header. */
export function StarToggle({
  threadId,
  starred,
  className,
}: {
  threadId: string;
  starred: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={on ? "Unstar" : "Star"}
      aria-pressed={on}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await starAction(threadId, next);
          if (!res.ok) setOn(!next);
        });
      }}
      className={cn(
        "rounded p-1 hover:bg-muted",
        on ? "text-accent" : "text-muted-foreground/60 hover:text-foreground",
        className,
      )}
    >
      <Icon name="star" className={cn("size-[18px]", on && "fill-current")} />
    </button>
  );
}

/**
 * A received HTML email in a sandboxed frame: no scripts, links open in a new
 * tab, and remote images stay blocked until someone asks for them, since
 * they're how senders track opens.
 */
export function MessageHtml({ html }: { html: string }) {
  const [images, setImages] = useState(false);
  const [height, setHeight] = useState(160);
  const frame = useRef<HTMLIFrameElement>(null);
  const remote = hasRemoteImages(html);
  return (
    <div>
      {remote && !images && (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Images from the web are hidden.
          <button type="button" onClick={() => setImages(true)} className="font-medium text-primary hover:underline">
            Show images
          </button>
        </p>
      )}
      <iframe
        ref={frame}
        title="Message"
        key={String(images)}
        srcDoc={displayHtml(html, images)}
        // Same origin (with scripts still off) only so the frame's height can be read.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => {
          const doc = frame.current?.contentDocument;
          if (doc) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 80), 4000));
        }}
        style={{ height }}
        className="w-full rounded-md border border-border bg-white"
      />
    </div>
  );
}

/** The sent email as the recipient saw it, behind a toggle. */
export function SentEmail({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-primary hover:underline"
      >
        {open ? "Hide sent email" : "Show sent email"}
      </button>
      {open && (
        <iframe
          title="Sent email"
          srcDoc={html}
          sandbox=""
          className="mt-2 h-[32rem] w-full rounded-md border border-border bg-white"
        />
      )}
    </div>
  );
}

type Defaults = Record<Exclude<ComposeMode, "new">, { to: string[]; cc: string[]; subject: string }>;

/** Reply, Reply all and Forward under the conversation, opening an inline composer. */
export function ReplyBox({ threadId, defaults }: { threadId: string; defaults: Defaults }) {
  const [mode, setMode] = useState<Exclude<ComposeMode, "new"> | null>(null);
  const [key, setKey] = useState(0);
  const buttons: Array<[Exclude<ComposeMode, "new">, IconName, string]> = [
    ["reply", "reply", "Reply"],
    ...(defaults.replyAll.to.length + defaults.replyAll.cc.length > 1
      ? [["replyAll", "reply", "Reply all"] as [Exclude<ComposeMode, "new">, IconName, string]]
      : []),
    ["forward", "forward", "Forward"],
  ];
  if (!mode)
    return (
      <div className="flex flex-wrap gap-2">
        {buttons.map(([m, icon, label]) => (
          <Button key={m} variant="outline" className="rounded-full" onClick={() => setMode(m)}>
            <Icon name={icon} />
            {label}
          </Button>
        ))}
      </div>
    );
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm text-muted-foreground">
        <Icon name={mode === "forward" ? "forward" : "reply"} />
        {buttons.find(([m]) => m === mode)?.[2]}
      </div>
      <Composer
        key={`${mode}-${key}`}
        mode={mode}
        threadId={threadId}
        initial={defaults[mode]}
        onDone={() => {
          setMode(null);
          setKey((k) => k + 1);
        }}
      />
    </div>
  );
}
