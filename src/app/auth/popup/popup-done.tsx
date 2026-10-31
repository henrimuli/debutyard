"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { safeNext } from "@/components/sign-in-form";
import { AUTH_MESSAGE, type AuthMessage } from "@/lib/auth-popup";

const errorText: Record<string, string> = {
  access_denied: "You cancelled the sign-in.",
  account_not_linked: "That email already has an account with a different sign-in method.",
};

export function PopupDone() {
  const params = useSearchParams();
  const error = params.get("error");
  const next = safeNext(params.get("next"), "/dashboard");

  useEffect(() => {
    const opener = window.opener as Window | null;
    // Opened as a popup: tell the page that opened it, then close.
    if (opener && !opener.closed) {
      try {
        const message: AuthMessage = error
          ? { type: AUTH_MESSAGE, ok: false, error: errorText[error] ?? "Sign-in didn't complete. Try again." }
          : { type: AUTH_MESSAGE, ok: true };
        opener.postMessage(message, window.location.origin);
        window.close();
        return;
      } catch {
        // Cross-origin opener: fall through to a normal redirect.
      }
    }
    // Popup was blocked, so this was a full-page redirect.
    window.location.replace(error ? `/sign-in?next=${encodeURIComponent(next)}&error=${error}` : next);
  }, [error, next]);

  return (
    <p>{error ? "Sign-in didn't complete. You can close this window." : "Signed in. You can close this window."}</p>
  );
}
