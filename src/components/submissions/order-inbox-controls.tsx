"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { markMessageUnreadAction } from "@/app/admin/submissions/actions";
import { Icon } from "@/components/app-shell/icons";
import { pollInbox } from "@/components/support/live-inbox";
import { ToolButton } from "@/components/support/thread-parts";

/** The order's inbox address in a box, one click from the clipboard. */
export function AddressBox({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted py-1 pl-3 pr-1">
      <code className="min-w-0 break-all font-mono text-sm">{address}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Icon name={copied ? "check" : "copy"} className="size-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Back to the list, and putting the email back to unread for someone else to pick up. */
export function MessageToolbar({ messageId, backHref }: { messageId: string; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Opening the email marked it read: update the sidebar badge now.
  useEffect(() => {
    void pollInbox();
  }, [messageId]);

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
      <ToolButton
        icon="mail"
        label="Mark as unread"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markMessageUnreadAction(messageId);
            if (!res.ok) return setError(res.error);
            router.push(backHref);
            void pollInbox();
          })
        }
      />
      {error && <p className="w-full px-2 pb-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
