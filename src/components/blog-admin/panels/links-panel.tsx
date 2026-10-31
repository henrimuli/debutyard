"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconExternal, IconSparkles } from "@/components/blog-admin/icons";
import { Button } from "@/components/ui/button";
import { BlogApiError, aiFields, blogApi } from "@/lib/blog/client";
import type { InboundSuggestion, LinkSuggestion } from "@/lib/blog/links";
import type { SeoReport } from "@/lib/blog/seo/analyze";
import type { BlogFields } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

/** The sentence with its anchor picked out, so the editor sees exactly what will become a link. */
function Context({ text, anchor }: { text: string; anchor: string }) {
  const i = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (i === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <mark className="rounded bg-accent/40 px-0.5 text-inherit">{text.slice(i, i + anchor.length)}</mark>
      {text.slice(i + anchor.length)}
    </span>
  );
}

type Ranked = LinkSuggestion & { note?: string };

export function LinksPanel({
  active,
  postId,
  slug,
  fields,
  report,
  contentVersion,
  onApply,
  notify,
}: {
  /** The tab is visible. Suggestions load the first time it opens, when there is text to scan. */
  active: boolean;
  postId: string;
  slug: string;
  fields: BlogFields;
  report: SeoReport;
  /** Changes whenever the article body changes (used to mark suggestions as stale). */
  contentVersion: number;
  onApply: (s: LinkSuggestion) => boolean;
  notify: (message: string, kind?: "info" | "error") => void;
}) {
  const [outbound, setOutbound] = useState<Ranked[]>([]);
  const [inbound, setInbound] = useState<InboundSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [ranked, setRanked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRanked(false);
    try {
      const f = fieldsRef.current;
      const res = await blogApi.links({
        slug,
        fields: {
          title: f.title,
          content_json: f.content_json,
          focus_keyword: f.focus_keyword,
          secondary_keywords: f.secondary_keywords,
          cluster: f.cluster,
        },
      });
      setOutbound(res.outbound);
      setInbound(res.inbound);
      setLoadedAt(contentVersion);
    } catch (e) {
      setError(e instanceof BlogApiError ? e.message : "Could not look for link opportunities.");
    } finally {
      setLoading(false);
    }
    // contentVersion is read once at load time on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (active && !loadedOnce.current) {
      loadedOnce.current = true;
      void load();
    }
  }, [active, load]);

  async function rank() {
    setRanking(true);
    setError(null);
    try {
      const f = fieldsRef.current;
      const result = await blogApi.ai({ action: "interlinks", postId, fields: aiFields(f) });
      const r = (result as { ranked: Ranked[] }).ranked;
      setOutbound(r);
      setRanked(true);
      if (r.length === 0) notify("The AI found none of the candidates worth adding.", "info");
    } catch (e) {
      setError(e instanceof BlogApiError ? e.message : "The AI ranking failed.");
    } finally {
      setRanking(false);
    }
  }

  const stale = loadedAt !== null && loadedAt !== contentVersion;
  const linkCheck = report.checks.find((c) => c.id === "internal-links");
  const broken = report.checks.find((c) => c.id === "broken-links");
  const inboundCheck = report.checks.find((c) => c.id === "inbound-links");

  return (
    <div className="space-y-6 p-4">
      <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
        <p className="font-medium">
          {report.stats.internalLinks} internal · {report.stats.externalLinks} external links
        </p>
        <p className="mt-0.5 text-muted-foreground">{linkCheck?.detail}</p>
        {broken && broken.status !== "pass" ? <p className="mt-1 text-danger">{broken.detail}</p> : null}
        {inboundCheck && inboundCheck.status !== "pass" ? (
          <p className="mt-1 text-amber-700">{inboundCheck.detail}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Searching…" : stale ? "Refresh (article changed)" : "Find opportunities"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void rank()}
          disabled={ranking || loading || outbound.length === 0}
        >
          <IconSparkles />
          {ranking ? "Ranking…" : ranked ? "Re-rank with AI" : "Rank with AI"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section aria-label="Links to add">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add to this article ({outbound.length})
        </h3>
        {outbound.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Looking through your posts, pages and listings…"
              : "No unlinked mentions found. Write more, or set focus keywords on your other posts so they can be matched."}
          </p>
        ) : (
          <ul className="space-y-3">
            {outbound.map((s) => (
              <li key={s.id} className="rounded-lg border border-border p-3">
                <p className="text-sm">
                  <Context text={s.context} anchor={s.anchor} />
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide",
                      s.kind === "post" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-primary/10 text-primary",
                    )}
                  >
                    {s.kind === "post" ? "Article" : "Page"}
                  </span>
                  <span className="truncate">{s.targetTitle}</span>
                  <span className="shrink-0 text-muted-foreground">{s.href}</span>
                </p>
                {s.note || s.reason ? <p className="mt-1 text-xs text-muted-foreground">{s.note || s.reason}</p> : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (onApply(s)) setOutbound((list) => list.filter((x) => x.id !== s.id));
                      else notify("That text has changed. Refresh the suggestions.", "error");
                    }}
                  >
                    Add link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOutbound((list) => list.filter((x) => x.id !== s.id))}
                  >
                    Skip
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Links from other articles">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link here from other articles ({inbound.length})
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">
          These articles mention this topic but do not link to it. Open one and link the highlighted phrase.
        </p>
        {inbound.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No opportunities yet. Set a focus keyword so other articles can be matched.
          </p>
        ) : (
          <ul className="space-y-3">
            {inbound.map((s) => (
              <li key={s.postId} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{s.postTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Context text={s.context} anchor={s.anchor} />
                </p>
                <Link
                  href={`/admin/blog/${s.postId}`}
                  target="_blank"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Open article
                  <IconExternal />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
