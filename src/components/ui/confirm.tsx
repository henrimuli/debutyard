"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  /** A sentence on what happens, under the title. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Deletes, revokes or otherwise can't be taken back: a red button, and focus starts on Cancel. */
  danger?: boolean;
};

/**
 * The site's stand-in for `window.confirm()`: our Dialog instead of the browser's box at the top
 * of the page. Resolves true when confirmed, false when cancelled, closed or dismissed.
 *
 *   if (!(await confirmDialog({ title: "Delete this post?", danger: true }))) return;
 *
 * It mounts its own root, so it works from any client component without a provider.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (ok: boolean) => {
      resolve(ok);
      // Unmount after this event finishes, so the Dialog can hand focus back first.
      setTimeout(() => {
        root.unmount();
        host.remove();
      });
    };
    root.render(<ConfirmView {...options} onDone={done} />);
  });
}

function ConfirmView({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onDone,
}: ConfirmOptions & { onDone: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);
  const finish = (ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    onDone(ok);
  };

  useEffect(() => {
    // The Dialog focuses its panel on mount; move on to the button that's safe to press with Enter.
    // A timeout, not requestAnimationFrame, which doesn't fire in a background tab.
    const id = setTimeout(() => (danger ? cancelRef : confirmRef).current?.focus());
    return () => clearTimeout(id);
  }, [danger]);

  return (
    <Dialog onClose={() => finish(false)} label={title} size="sm">
      <div className="p-6">
        <h2 className="pr-8 font-display text-lg font-semibold tracking-tight">{title}</h2>
        {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="outline" onClick={() => finish(false)}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            onClick={() => finish(true)}
            className={cn(danger && "bg-danger text-white hover:bg-danger/90")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
