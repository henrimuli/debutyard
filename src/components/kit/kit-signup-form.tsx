"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { subscribeKitAction } from "@/app/(site)/newsletter/actions";
import { useTurnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import type { KitSource } from "@/lib/kit";
import { cn } from "@/lib/utils";

/** Email in, Founder Kit out (after the confirm email). `onDone` fires once the sign-up succeeds. */
export function KitSignupForm({
  source,
  turnstileSiteKey,
  className,
  onDone,
  autoFocus = false,
}: {
  source: KitSource;
  turnstileSiteKey: string | null;
  className?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const [state, action, pending] = useActionState(subscribeKitAction, null);
  const [verifying, setVerifying] = useState(false);
  const { containerRef, getToken } = useTurnstile(turnstileSiteKey);
  const busy = pending || verifying;
  const ok = state?.ok === true;
  useEffect(() => {
    if (ok) onDone?.();
  }, [ok, onDone]);

  if (state?.ok) return <p className={cn("text-sm text-success", className)}>{state.message}</p>;

  return (
    <div className={className}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setVerifying(true);
          const token = await getToken();
          setVerifying(false);
          if (token) form.set("cf-turnstile-response", token);
          startTransition(() => action(form));
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          type="email"
          name="email"
          required
          autoFocus={autoFocus}
          placeholder="you@example.com"
          aria-label="Email"
          className="min-w-0 flex-1"
        />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <input type="hidden" name="source" value={source} />
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send me the kit"}
        </Button>
      </form>
      {/* Empty unless Cloudflare needs a click to confirm the visitor. */}
      <div ref={containerRef} />
      {state && !state.ok ? <p className="mt-2 text-sm text-danger">{state.message}</p> : null}
    </div>
  );
}
