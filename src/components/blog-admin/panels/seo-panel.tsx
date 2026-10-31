"use client";

import { useState } from "react";
import { IconAlert, IconCheckCircle, IconChevronDown, IconWarning } from "@/components/blog-admin/icons";
import { ChipInput, Counter, Field, TextArea, TextInput } from "@/components/blog-admin/ui";
import { DESCRIPTION_RANGE, TITLE_RANGE, type CheckGroup, type SeoCheck, type SeoReport } from "@/lib/blog/seo/analyze";
import type { BlogFields } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<CheckGroup, string> = {
  meta: "Metadata",
  content: "Content",
  structure: "Structure",
  links: "Links",
  media: "Media",
  technical: "Technical",
  conversion: "Conversion",
};

function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone =
    score === null ? "stroke-border" : score >= 80 ? "stroke-success" : score >= 55 ? "stroke-accent" : "stroke-danger";
  return (
    <div
      className="relative h-24 w-24 shrink-0"
      role="img"
      aria-label={score === null ? "No score yet" : `SEO score ${score} out of 100`}
    >
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          className={cn("transition-[stroke-dashoffset] duration-500", tone)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{score ?? "–"}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">SEO</span>
      </div>
    </div>
  );
}

function SerpPreview({ fields, slug, siteHost }: { fields: BlogFields; slug: string; siteHost: string }) {
  const title = (fields.seo_title.trim() || fields.title.trim() || "Untitled article") + " | DebutYard";
  const desc =
    fields.seo_description.trim() ||
    fields.excerpt.trim() ||
    "Add a meta description to control how this article appears in search results.";
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="truncate text-xs text-muted-foreground">
        {siteHost} › blog › {slug || "…"}
      </p>
      <p className="mt-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{clip(title, 62)}</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{clip(desc, 160)}</p>
    </div>
  );
}

const ICON = {
  pass: (
    <span role="img" aria-label="Passed">
      <IconCheckCircle className="size-5 text-success" />
    </span>
  ),
  warn: (
    <span role="img" aria-label="Needs attention">
      <IconWarning className="size-5 text-amber-500" />
    </span>
  ),
  fail: (
    <span role="img" aria-label="Failed">
      <IconAlert className="size-5 text-danger" />
    </span>
  ),
};

function CheckRow({ check, showGroup }: { check: SeoCheck; showGroup?: boolean }) {
  return (
    <li className="flex gap-2.5 py-2">
      {ICON[check.status]}
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {check.title}
          {showGroup ? (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABEL[check.group]}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
        {check.status !== "pass" && check.fix ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{check.fix}</p>
        ) : null}
      </div>
    </li>
  );
}

export function SeoPanel({
  report,
  fields,
  slug,
  siteHost,
  update,
}: {
  report: SeoReport;
  fields: BlogFields;
  slug: string;
  siteHost: string;
  update: (patch: Partial<BlogFields>) => void;
}) {
  const [showPassed, setShowPassed] = useState(false);
  const issues = report.checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : 1));
  const passed = report.checks.filter((c) => c.status === "pass");
  const s = report.stats;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={report.score} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {report.score === null
              ? "Start writing to see your score"
              : report.counts.fail + report.counts.warn === 0
                ? "Everything checks out"
                : `${report.counts.fail} to fix · ${report.counts.warn} to improve`}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <dt>Words</dt>
              <dd className="font-medium tabular-nums">{s.words}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Readability</dt>
              <dd className="font-medium tabular-nums">{s.readingEase}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Keyword</dt>
              <dd className="font-medium tabular-nums">
                {s.keywordCount}× · {s.keywordDensity}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Links</dt>
              <dd className="font-medium tabular-nums">
                {s.internalLinks} in · {s.externalLinks} out
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Focus keyword" htmlFor="seo-kw" hint="The one phrase a searcher would type to find this article.">
          <TextInput
            id="seo-kw"
            value={fields.focus_keyword}
            onChange={(e) => update({ focus_keyword: e.target.value })}
            placeholder="e.g. best ai coding tools"
          />
        </Field>
        <Field label="Secondary keywords" hint="Related phrases to weave in naturally. Press Enter to add.">
          <ChipInput
            label="Secondary keyword"
            values={fields.secondary_keywords}
            onChange={(v) => update({ secondary_keywords: v })}
            placeholder="Add a keyword"
            max={15}
          />
        </Field>
        <Field
          label="SEO title"
          htmlFor="seo-title"
          right={
            <Counter value={(fields.seo_title || fields.title).length} min={TITLE_RANGE.min} max={TITLE_RANGE.max} />
          }
          hint="Shown in search results. “ | DebutYard” is added automatically. Leave blank to use the headline."
        >
          <TextInput
            id="seo-title"
            value={fields.seo_title}
            onChange={(e) => update({ seo_title: e.target.value })}
            placeholder={fields.title || "SEO title"}
          />
        </Field>
        <Field
          label="Meta description"
          htmlFor="seo-desc"
          right={
            <Counter value={fields.seo_description.length} min={DESCRIPTION_RANGE.min} max={DESCRIPTION_RANGE.max} />
          }
        >
          <TextArea
            id="seo-desc"
            rows={3}
            value={fields.seo_description}
            onChange={(e) => update({ seo_description: e.target.value })}
            placeholder="Summarize the payoff and include the focus keyword."
          />
        </Field>
        <SerpPreview fields={fields} slug={slug} siteHost={siteHost} />
      </div>

      <section aria-label="SEO checklist">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          To improve ({issues.length})
        </h3>
        {issues.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">No open issues.</p>
        ) : (
          <ul className="divide-y divide-border">
            {issues.map((c) => (
              <CheckRow key={c.id} check={c} showGroup />
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setShowPassed((v) => !v)}
          aria-expanded={showPassed}
          className="mt-3 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:"
        >
          Passed ({passed.length})
          <IconChevronDown className={cn("transition-transform", showPassed && "rotate-180")} />
        </button>
        {showPassed ? (
          <ul className="divide-y divide-border">
            {passed.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
