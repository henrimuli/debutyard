"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/blog-admin/ui";
import { Button } from "@/components/ui/button";
import { BlogApiError, blogApi, type Revision } from "@/lib/blog/client";

const REASON: Record<string, string> = {
  autosave: "Autosave",
  manual: "Saved version",
  publish: "Published",
  restore: "Restored",
};

export function RevisionsDialog({
  postId,
  onRestore,
  onClose,
}: {
  postId: string;
  onRestore: (revisionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    blogApi
      .revisions(postId)
      .then((r) => setItems(r.revisions))
      .catch((e) => setError(e instanceof BlogApiError ? e.message : "Could not load the history."));
  }, [postId]);

  return (
    <Modal title="Version history" onClose={onClose} size="md">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!items && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No versions yet. A snapshot is taken every few minutes while you write, when you publish, and when you choose
          “Save version”.
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title || "Untitled"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()} · {REASON[r.reason] ?? r.reason}
                  {r.by ? ` · ${r.by}` : ""} · {r.words} words
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Restore this version? Your current draft stays in the history, so you can undo this.",
                    )
                  )
                    return;
                  setBusy(r.id);
                  await onRestore(r.id);
                  setBusy(null);
                }}
              >
                {busy === r.id ? "Restoring…" : "Restore"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}
