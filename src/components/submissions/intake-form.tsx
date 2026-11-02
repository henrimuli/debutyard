"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { intakePrefillAction, submitIntakeAction } from "@/app/(site)/orders/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

type Values = {
  productName: string;
  websiteUrl: string;
  tagline: string;
  shortDescription: string;
  longDescription: string;
  categories: string[];
  logoUrl: string;
  founderName: string;
  contactEmail: string;
  clientNotes: string;
  badgePreference: "none" | "allow";
  allowAccounts: boolean;
};

/** What each field is called by the button, where its own label is a long way up the form. */
const FIELD_LABELS: Record<string, string> = {
  websiteUrl: "Website",
  productName: "Product name",
  logoUrl: "Logo URL",
  tagline: "Tagline",
  shortDescription: "Short description",
  longDescription: "Long description",
  categories: "Categories",
  founderName: "Founder name",
  contactEmail: "Contact email",
  badgePreference: "Badge directories",
  clientNotes: "Notes",
  allowAccounts: "Account permission",
};

const areaCls =
  "w-full rounded-md border border-border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function IntakeForm({
  token,
  initial,
  categories,
}: {
  token: string;
  initial: Values;
  categories: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));

  function prefill() {
    setNote(null);
    start(async () => {
      const res = await intakePrefillAction(token, v.websiteUrl);
      if (!res.ok) return setNote(res.error);
      const d = res.data;
      setV((s) => ({
        ...s,
        websiteUrl: d.url,
        productName: s.productName || d.name || "",
        tagline: s.tagline || (d.tagline ?? "").slice(0, 60),
        shortDescription: s.shortDescription || (d.shortDescription ?? d.description ?? "").slice(0, 160),
        longDescription: s.longDescription || (d.description ?? "").slice(0, 500),
        logoUrl: s.logoUrl || (d.logoUrl?.startsWith("https://") ? d.logoUrl : ""),
        categories: s.categories.length
          ? s.categories
          : d.categories.filter((c) => categories.some((k) => k.slug === c)).slice(0, 3),
      }));
      setNote("Filled in from your site. Check and adjust the wording.");
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const res = await submitIntakeAction(token, { ...v, allowAccounts: v.allowAccounts as true });
        if (!res.ok) return setError({ text: res.error, field: res.field });
        router.refresh();
      } catch {
        setError({
          text: `We couldn't save your details. Try again in a moment, or email ${site.supportEmail} if it keeps happening.`,
        });
      }
    });
  }

  const count = (s: string, max: number) => (
    <span className={cn("text-xs", s.length > max ? "text-danger" : "text-muted-foreground")}>
      {s.length}/{max}
    </span>
  );
  const err = (field: string) => error?.field === field && <p className="text-xs text-danger">{error.text}</p>;
  const errorLabel = error?.field && FIELD_LABELS[error.field];

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="websiteUrl">Website</Label>
        <div className="flex gap-2">
          <Input
            id="websiteUrl"
            value={v.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            placeholder="https://yourproduct.com"
          />
          <Button type="button" variant="outline" onClick={prefill} disabled={pending || !v.websiteUrl}>
            Fill from site
          </Button>
        </div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {err("websiteUrl")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="productName">Product name</Label>
          <Input id="productName" value={v.productName} onChange={(e) => set("productName", e.target.value)} />
          {err("productName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logoUrl">Logo URL (square, https)</Label>
          <Input
            id="logoUrl"
            value={v.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            placeholder="https://…/logo.png"
          />
          {err("logoUrl")}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label htmlFor="tagline">Tagline</Label>
          {count(v.tagline, 60)}
        </div>
        <Input
          id="tagline"
          value={v.tagline}
          onChange={(e) => set("tagline", e.target.value)}
          placeholder="What it does, in one line"
        />
        {err("tagline")}
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label htmlFor="short">Short description</Label>
          {count(v.shortDescription, 160)}
        </div>
        <textarea
          id="short"
          rows={2}
          className={areaCls}
          value={v.shortDescription}
          onChange={(e) => set("shortDescription", e.target.value)}
        />
        {err("shortDescription")}
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label htmlFor="long">Long description</Label>
          {count(v.longDescription, 500)}
        </div>
        <textarea
          id="long"
          rows={5}
          className={areaCls}
          value={v.longDescription}
          onChange={(e) => set("longDescription", e.target.value)}
        />
        {err("longDescription")}
      </div>
      <div className="space-y-2">
        <Label>Categories (up to 3)</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = v.categories.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() =>
                  set(
                    "categories",
                    on
                      ? v.categories.filter((x) => x !== c.slug)
                      : v.categories.length < 3
                        ? [...v.categories, c.slug]
                        : v.categories,
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        {err("categories")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="founder">Founder name (optional)</Label>
          <Input id="founder" value={v.founderName} onChange={(e) => set("founderName", e.target.value)} />
          {err("founderName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact">Contact email for updates</Label>
          <Input
            id="contact"
            type="email"
            value={v.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
          {err("contactEmail")}
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Badge directories</legend>
        {(
          [
            ["none", "No badges (recommended)", "We only use directories that don't ask for a badge on your site."],
            [
              "allow",
              "Allow up to 5 badges",
              "More directories. You paste one HTML block into your footer once; we check it's there.",
            ],
          ] as const
        ).map(([val, title, desc]) => (
          <label
            key={val}
            className={cn(
              "flex cursor-pointer gap-3 rounded-md border p-3",
              v.badgePreference === val ? "border-primary" : "border-border",
            )}
          >
            <input
              type="radio"
              name="badges"
              checked={v.badgePreference === val}
              onChange={() => set("badgePreference", val)}
            />
            <span className="text-sm">
              <span className="font-medium">{title}</span>
              <span className="block text-muted-foreground">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Anything we should know? (optional)</Label>
        <textarea
          id="notes"
          rows={3}
          className={areaCls}
          value={v.clientNotes}
          onChange={(e) => set("clientNotes", e.target.value)}
          placeholder="Directories to skip, launch date, wording to avoid…"
        />
        {err("clientNotes")}
      </div>
      <label className="flex gap-3 text-sm">
        <input type="checkbox" checked={v.allowAccounts} onChange={(e) => set("allowAccounts", e.target.checked)} />
        <span>
          I allow {"DebutYard"} to create directory accounts in my product&apos;s name. Logins are handed over when the
          order is delivered.
        </span>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={submit} disabled={pending} size="lg" className="shrink-0 self-start sm:self-auto">
          {pending ? "Saving…" : "Start my submissions"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {errorLabel && <span className="font-medium">{errorLabel}: </span>}
            {/[.!?]$/.test(error.text) ? error.text : `${error.text}.`}
            {error.field && " Fix that above, then try again."}
          </p>
        )}
      </div>
    </div>
  );
}
