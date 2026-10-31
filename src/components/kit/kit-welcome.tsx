"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const HIDE_AFTER_MS = 8_000;

/**
 * The "you're in" toast after the one-click confirm in the kit email, which lands here with
 * ?welcome=1. The param is dropped from the address bar so a bookmark or reload doesn't repeat it.
 */
export function KitWelcome() {
  const welcome = useSearchParams().get("welcome") === "1";
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!welcome) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(window.history.state, "", url);
    const t = setTimeout(() => setDismissed(true), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [welcome]);

  if (!welcome || dismissed) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-success/40 bg-card p-4 shadow-lg"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        className="mt-0.5 size-5 shrink-0 text-success"
      >
        <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="flex-1 text-sm">
        <span className="font-semibold">You&apos;re confirmed.</span> Your free kit is below, and the digest lands every
        Monday.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
