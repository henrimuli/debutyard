"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewAction, sendAction } from "@/app/admin/email/actions";
import { Icon } from "@/components/app-shell/icons";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BodyEditor } from "./body-editor";
import type { ComposeInput } from "@/lib/support/service";

export type ComposeMode = ComposeInput["mode"];

const split = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);

const field = "w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground";

/**
 * To, Cc, subject and message, with a preview of the branded email and Send.
 * Typed text becomes the template's paragraphs, and
 * selected text can be made a link. The template adds the sign-off.
 */
export function Composer({
  mode,
  threadId,
  initial,
  onDone,
  className,
}: {
  mode: ComposeMode;
  threadId?: string;
  initial: { to: string[]; cc: string[]; subject: string };
  /** Called after sending or discarding. */
  onDone: (sent: { threadId?: string } | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [to, setTo] = useState(initial.to.join(", "));
  const [cc, setCc] = useState(initial.cc.join(", "));
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const [pending, start] = useTransition();

  const input = (): ComposeInput => ({ mode, threadId, to: split(to), cc: split(cc), subject, body });

  const send = () =>
    start(async () => {
      setError(null);
      const res = await sendAction(input());
      if (!res.ok) return setError(res.error);
      onDone({ threadId: res.threadId });
      if (mode === "new" && res.threadId) router.push(`/admin/email?folder=sent&t=${res.threadId}`);
    });

  const showPreview = () =>
    start(async () => {
      const res = await previewAction(input());
      if (res.ok) setPreview({ html: res.html, subject: res.subject });
      else setError(res.error);
    });

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="divide-y divide-border border-b border-border px-3">
        <label className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-sm text-muted-foreground">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={field}
            placeholder="name@example.com"
            autoFocus={mode === "new" || mode === "forward"}
          />
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cc
            </button>
          )}
        </label>
        {showCc && (
          <label className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">Cc</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} className={field} />
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-sm text-muted-foreground">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
      </div>
      <BodyEditor
        onChange={setBody}
        onSubmit={send}
        autoFocus={mode === "reply" || mode === "replyAll"}
        className="min-h-0 flex-1"
      />
      {error && <p className="px-3 pb-2 text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <Button size="sm" onClick={send} disabled={pending} className="rounded-full px-5">
          <Icon name="send" />
          {pending ? "Sending…" : "Send"}
        </Button>
        <Button size="sm" variant="ghost" onClick={showPreview} disabled={pending}>
          Preview
        </Button>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          Sent from support@, signed by you
        </span>
        <button
          type="button"
          aria-label="Discard"
          title="Discard"
          onClick={async () => {
            if (
              body.trim() &&
              !(await confirmDialog({ title: "Discard this message?", confirmLabel: "Discard", danger: true }))
            )
              return;
            onDone(null);
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="trash" />
        </button>
      </div>
      {preview && (
        <Dialog onClose={() => setPreview(null)} size="md" label="Email preview" className="p-0">
          <p className="truncate border-b border-border py-4 pl-4 pr-14 text-sm font-medium">{preview.subject}</p>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[70vh] w-full bg-white" />
        </Dialog>
      )}
    </div>
  );
}
