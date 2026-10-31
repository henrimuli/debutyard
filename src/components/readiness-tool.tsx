"use client";

import Link from "next/link";
import { useActionState } from "react";
import { readinessAction } from "@/app/(site)/tools/launch-readiness/actions";
import { DebutLink } from "@/components/debut/debut-link";
import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const icon = { pass: "✓", warn: "!", fail: "✕" } as const;
const tone = {
  pass: "bg-success/15 text-success",
  warn: "bg-accent/20 text-accent-foreground",
  fail: "bg-danger/15 text-danger",
} as const;

export function ReadinessTool() {
  const [state, action, pending] = useActionState(readinessAction, null);
  const report = state?.ok ? state.report : null;

  return (
    <div className="space-y-6">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          placeholder="https://yourproduct.com"
          required
          className="min-w-0 flex-1"
          aria-label="Website URL"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Check my site"}
        </Button>
      </form>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

      {report && (
        <Card className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div
              className={cn(
                "flex size-20 items-center justify-center rounded-full font-display text-3xl font-bold",
                report.score >= 80 ? tone.pass : report.score >= 50 ? tone.warn : tone.fail,
              )}
            >
              {report.score}
            </div>
            <div>
              <p className="font-display text-xl font-semibold">{report.domain}</p>
              <p className="text-sm text-muted-foreground">
                {report.ready
                  ? "Ready to debut. Fix the warnings for a stronger launch."
                  : "Fix the red items before you submit."}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-3 py-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    tone[c.status],
                  )}
                >
                  {icon[c.status]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-sm break-words text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <p className="font-medium">Next weeks with room</p>
              <p className="mt-1 text-muted-foreground">
                Free debut: <span className="text-foreground">{report.nextWeeks.free.label}</span>
              </p>
              <p className="text-muted-foreground">
                Paid debut: <span className="text-foreground">live as soon as it&apos;s approved</span>, or pick a later
                week
              </p>
            </div>
            {report.suggested?.name && (
              <div className="rounded-lg bg-muted/60 p-4 text-sm">
                <p className="font-medium">Suggested listing</p>
                <p className="mt-1">{report.suggested.name}</p>
                {report.suggested.tagline && <p className="text-muted-foreground">{report.suggested.tagline}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <DebutLink url={report.url}>Debut it on DebutYard</DebutLink>
            <Link href="/badge" className="self-center text-sm text-primary hover:underline">
              Get the badge
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
