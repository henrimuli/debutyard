"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { dofollowAction } from "@/app/(site)/tools/dofollow-checker/actions";
import { drAction } from "@/app/(site)/tools/dr-checker/actions";
import { AuthorityScore } from "@/components/metrics/authority-score";
import { useTurnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/primitives";
import { providerLabels, type DrProviderId } from "@/lib/metrics/providers";
import { cn } from "@/lib/utils";

const VERDICT = {
  dofollow: { label: "Dofollow", tone: "bg-success/15 text-success" },
  nofollow: { label: "Nofollow", tone: "bg-accent/20 text-accent-foreground" },
  missing: { label: "No link found", tone: "bg-danger/15 text-danger" },
  unreachable: { label: "Couldn't load", tone: "bg-danger/15 text-danger" },
} as const;

export function DofollowChecker() {
  const [state, action, pending] = useActionState(dofollowAction, null);
  const r = state?.ok ? state.result : null;
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pageUrl">Page with the link</Label>
          <Input id="pageUrl" name="pageUrl" required placeholder="https://directory.com/listing/your-product" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target">Your site</Label>
          <Input id="target" name="target" required placeholder="yourproduct.com" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Check the link"}
        </Button>
      </form>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {r && (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", VERDICT[r.verdict].tone)}>
              {VERDICT[r.verdict].label}
            </span>
            <span className="text-sm break-all text-muted-foreground">{r.domain}</span>
          </div>
          <p className="text-sm">{r.explanation}</p>
          {(r.rel || r.anchor) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {r.rel && (
                <>
                  <dt className="text-muted-foreground">rel</dt>
                  <dd className="font-mono break-all">{r.rel}</dd>
                </>
              )}
              {r.anchor && (
                <>
                  <dt className="text-muted-foreground">Anchor</dt>
                  <dd className="break-words">{r.anchor}</dd>
                </>
              )}
            </dl>
          )}
          <p className="text-sm text-muted-foreground">
            Want this checked every week, with an email when a link breaks?{" "}
            <Link href="/dashboard/links" className="text-primary hover:underline">
              Try Link Monitor
            </Link>
            .
          </p>
        </Card>
      )}
    </div>
  );
}

/** `turnstileSiteKey`: the invisible bot check runs before each check (null in development). */
export function DrChecker({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState(drAction, null);
  const [verifying, setVerifying] = useState(false);
  const { containerRef: turnstileRef, getToken } = useTurnstile(turnstileSiteKey);
  const r = state?.ok ? state.result : null;
  const busy = pending || verifying;
  return (
    <div className="space-y-6">
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
        <Input name="domain" required placeholder="yourproduct.com" className="min-w-0 sm:flex-1" aria-label="Domain" />
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Check score"}
        </Button>
      </form>
      {/* Empty unless Cloudflare needs a click to confirm the visitor. */}
      <div ref={turnstileRef} />
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {r && (
        <Card className="flex flex-wrap items-center gap-5 p-6">
          <AuthorityScore key={`${r.domain}-${r.measuredAt}`} score={r.dr} size="lg" />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authority Score</p>
            <p className="font-display text-xl font-semibold break-all">{r.domain}</p>
            {r.referringDomains !== null && (
              <p className="text-sm text-muted-foreground">
                {r.referringDomains.toLocaleString("en-US")} referring domains
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Measured {new Date(r.measuredAt).toLocaleDateString("en-GB", { timeZone: "UTC" })} · Source:{" "}
              {providerLabels[r.provider as DrProviderId] ?? r.provider}. Scores are refreshed at most weekly.
            </p>
          </div>
        </Card>
      )}
      {r && (
        <p className="text-xs text-muted-foreground">
          {r.remaining.hour > 0
            ? `${r.remaining.hour} more ${r.remaining.hour === 1 ? "check" : "checks"} this hour, ${r.remaining.day} today.`
            : r.remaining.day > 0
              ? `That was your last check this hour. ${r.remaining.day} left today.`
              : "That was your last check today."}
        </p>
      )}
    </div>
  );
}
