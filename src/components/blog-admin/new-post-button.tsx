"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { blogApi, BlogApiError } from "@/lib/blog/client";

/** Creates an empty draft and opens it; `draft` also opens the writer panel. */
export function NewPostButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { id } = await blogApi.createPost();
            router.push(`/admin/blog/${id}`);
          } catch (e) {
            setError(e instanceof BlogApiError ? e.message : "Could not create the post.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Creating…" : "New post"}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
