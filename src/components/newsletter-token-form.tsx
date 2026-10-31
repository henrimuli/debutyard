"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Confirm/unsubscribe happen on a button press, not on page load, so email
 * link scanners that prefetch URLs can't flip a subscription.
 */
export function NewsletterTokenForm({
  token,
  action,
  label,
  done,
  failed,
}: {
  token: string;
  action: (prev: boolean | null, form: FormData) => Promise<boolean>;
  label: string;
  done: string;
  failed: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  if (state !== null) {
    return (
      <div className="space-y-3">
        <p className={state ? "text-success" : "text-danger"}>{state ? done : failed}</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back to this week&apos;s debuts
        </Link>
      </div>
    );
  }
  return (
    <form action={run}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
