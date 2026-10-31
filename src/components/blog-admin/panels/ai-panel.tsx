"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RewriteInstruction } from "@/components/blog-admin/editor/editor-bubble";
import {
  applyTextEdit,
  generateSpots,
  htmlToText,
  replaceSelectionWithHtml,
  streamAnchor,
  streamHtmlInto,
} from "@/components/blog-admin/editor/editor-actions";
import {
  IconArrowRight,
  IconBulb,
  IconSearch,
  IconSend,
  IconSparkles,
  IconStop,
  IconWand,
} from "@/components/blog-admin/icons";
import { ChipInput, Field, Select, TextArea, TextInput } from "@/components/blog-admin/ui";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Spinner } from "@/components/ui/primitives";
import type {
  ContentIdea,
  IdeasResult,
  KeywordSignal,
  MetadataResult,
  OptimizeResult,
  OutlineResult,
} from "@/lib/blog/ai/types";
import { aiFields, blogApi, describeAiError, streamAi } from "@/lib/blog/client";
import type { BlogFields, PostKind, StaffCategory, StaffPost } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

export type RewriteRequest = { id: number; instruction: RewriteInstruction; from: number; to: number; text: string };

type Card =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "reply"; text: string; streaming: boolean; error?: string }
  | { id: number; kind: "draft"; label: string; status: string; streaming: boolean; error?: string }
  | {
      id: number;
      kind: "rewrite";
      label: string;
      req: RewriteRequest;
      html: string;
      streaming: boolean;
      error?: string;
    }
  | { id: number; kind: "loading"; label: string }
  | { id: number; kind: "error"; error: string }
  | { id: number; kind: "ideas"; data: IdeasResult }
  | { id: number; kind: "outline"; data: OutlineResult }
  | { id: number; kind: "metadata"; data: MetadataResult }
  | { id: number; kind: "optimize"; data: OptimizeResult; applied: string[] };

const KIND_LABEL: Record<PostKind, string> = {
  post: "Article",
  roundup: "Roundup",
  comparison: "Comparison",
  alternatives: "Alternatives",
  launch: "Launch post",
  recap: "Weekly recap",
};

const shell = "rounded-lg border border-border bg-card p-3";

function Heading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </h4>
  );
}

function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0 text-sm">{children}</span>
      {action}
    </li>
  );
}

const Use = ({ onClick, label = "Use" }: { onClick: () => void; label?: string }) => (
  <Button size="sm" variant="secondary" onClick={onClick} className="shrink-0">
    {label}
  </Button>
);

function ErrorNote({ error, onDismiss, className }: { error: string; onDismiss?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger", className)}
    >
      <p className="whitespace-pre-line break-words">{error}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="mt-2 font-semibold underline">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

const SIGNAL_STYLE: Record<KeywordSignal["opportunity"], string> = {
  high: "bg-success/10 text-success",
  medium: "bg-accent/25 text-foreground",
  low: "bg-muted text-muted-foreground",
};

function Signal({ s, keyword }: { s: KeywordSignal; keyword?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn("rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide", SIGNAL_STYLE[s.opportunity])}
      >
        {s.opportunity}
      </span>
      {keyword ? <span className="font-medium text-foreground">{keyword}</span> : null}
      {s.volume !== null ? <span>~{s.volume.toLocaleString()}/mo</span> : <span>no volume data</span>}
      {s.competition !== "UNKNOWN" ? <span>· {s.competition.toLowerCase()} competition</span> : null}
      {s.autocompleted ? <span>· Google suggests it</span> : null}
    </span>
  );
}

/** The brief: edit what the draft will cover, then write it. */
function OutlineCard({
  d,
  onDraft,
  onDismiss,
}: {
  d: OutlineResult;
  onDraft: (brief: {
    title: string;
    keyword: string;
    angle: string;
    outsideTools: string[];
    productSlugs: string[];
  }) => void;
  onDismiss: () => void;
}) {
  const [title, setTitle] = useState(d.titleOptions[0] ?? "");
  const [keyword, setKeyword] = useState(d.primaryKeyword);
  const [angle, setAngle] = useState(d.angle);
  const [tools, setTools] = useState(d.outsideTools);
  const [slugs, setSlugs] = useState(d.productSlugs);
  const listsProducts = d.kind === "roundup" || d.kind === "comparison" || d.kind === "alternatives";

  return (
    <div className={shell}>
      <Heading>{KIND_LABEL[d.kind]} brief</Heading>
      <p className="text-xs text-muted-foreground">
        Intent: <strong className="capitalize">{d.searchIntent}</strong> · {d.audience} · ~{d.suggestedWordCount} words
      </p>
      <div className="mt-2">
        <Signal s={d.keyword} keyword={keyword} />
        {!d.keywordDataAvailable ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Keyword Planner isn&apos;t returning data, so volume is unknown. See docs/blog.md to connect it.
          </p>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Headline" htmlFor="brief-title">
          <TextInput id="brief-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {d.titleOptions.length > 1 ? (
          <ul className="-mt-1">
            {d.titleOptions.map((t) => (
              <Row
                key={t}
                action={
                  <Button size="sm" variant={t === title ? "primary" : "ghost"} onClick={() => setTitle(t)}>
                    {t === title ? "Selected" : "Use"}
                  </Button>
                }
              >
                {t} <span className="text-xs text-muted-foreground">({t.length})</span>
              </Row>
            ))}
          </ul>
        ) : null}
        <Field label="Focus keyword" htmlFor="brief-keyword">
          <TextInput id="brief-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </Field>
        <Field label="Angle" htmlFor="brief-angle">
          <TextArea id="brief-angle" rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} />
        </Field>
        {listsProducts ? (
          <>
            <Field label="DebutYard listings" hint="Checked to be live. Remove any you don't want in it.">
              <ChipInput label="Listing slug" values={slugs} onChange={setSlugs} max={12} placeholder="product-slug" />
            </Field>
            <Field
              label="Outside tools"
              hint="Well-known tools the keyword needs. They get a “Screenshot needed” box for you to fill by hand."
            >
              <ChipInput label="Outside tool" values={tools} onChange={setTools} max={6} placeholder="e.g. Notion" />
            </Field>
          </>
        ) : null}
      </div>

      <Heading>Outline</Heading>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        {d.outline.map((s) => (
          <li key={s.h2}>
            <span className="font-medium">{s.h2}</span>
            {s.h3s.length ? (
              <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">
                {s.h3s.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      {d.ranking.length ? (
        <>
          <Heading>Ranking today</Heading>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
            {d.ranking.slice(0, 6).map((r) => (
              <li key={r.url} className="truncate">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-foreground hover:underline"
                >
                  {r.title}
                </a>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {d.longTailQuestions.length ? (
        <>
          <Heading>Questions people ask</Heading>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {d.longTailQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!title.trim() || !keyword.trim()}
          onClick={() =>
            onDraft({
              title: title.trim(),
              keyword: keyword.trim(),
              angle: angle.trim(),
              outsideTools: tools,
              productSlugs: slugs,
            })
          }
        >
          <IconSparkles /> Write the draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

type Plan = { kind: PostKind; topic: string; keyword: string; notes: string };

export function AiPanel({
  post,
  fields,
  update,
  getEditor,
  categories,
  onSlug,
  rewriteRequest,
  autoStart,
  generateAll,
  generatingImages,
  notify,
}: {
  post: Pick<StaffPost, "id" | "kind" | "product" | "review">;
  fields: BlogFields;
  update: (patch: Partial<BlogFields>) => void;
  getEditor: () => Editor | null;
  categories: StaffCategory[];
  onSlug: (slug: string) => void;
  rewriteRequest: RewriteRequest | null;
  /** Opened from "Draft with AI": plan the launch post right away. */
  autoStart: boolean;
  /** Draws every "image to generate" box, and the banner when there is none. */
  generateAll: (opts: { cover: boolean }) => Promise<void>;
  generatingImages: boolean;
  notify: (message: string, kind?: "info" | "error") => void;
}) {
  const fixedKind = post.kind === "launch" || post.kind === "recap" ? post.kind : null;
  const [cards, setCards] = useState<Card[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "write">("chat");
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>({ kind: fixedKind ?? "post", topic: "", keyword: "", notes: "" });
  const [ideasFocus, setIdeasFocus] = useState<"any" | "post" | "roundup" | "comparison" | "alternatives">("any");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  });

  const nextId = () => idRef.current++;
  const patchCard = useCallback((id: number, patch: Partial<Card>) => {
    setCards((cs) => cs.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cards.length]);

  const base = () => ({ postId: post.id, fields: aiFields(fieldsRef.current) });
  const spots = getEditor() ? generateSpots(getEditor()!).length : 0;

  // ---- structured actions ---------------------------------------------------
  async function structured<T>(label: string, call: () => Promise<unknown>, toCard: (result: T, id: number) => Card) {
    const loadingId = nextId();
    setCards((cs) => [...cs, { id: loadingId, kind: "loading", label }]);
    setBusy(true);
    try {
      const result = (await call()) as T;
      setCards((cs) => cs.map((c) => (c.id === loadingId ? toCard(result, loadingId) : c)));
    } catch (e) {
      setCards((cs) =>
        cs.map((c) => (c.id === loadingId ? { id: loadingId, kind: "error", error: describeAiError(e) } : c)),
      );
    } finally {
      setBusy(false);
    }
  }

  const runIdeas = () =>
    structured<IdeasResult>(
      "Reading the board and checking real search data…",
      () => blogApi.ai({ action: "ideas", ...base(), focus: ideasFocus }),
      (data, id) => ({ id, kind: "ideas", data }),
    );

  const runOutline = (p: {
    kind: PostKind;
    topic: string;
    keyword?: string;
    notes?: string;
    productSlugs?: string[];
    outsideTools?: string[];
  }) =>
    structured<OutlineResult>(
      "Researching who ranks and planning the post…",
      () =>
        blogApi.ai({
          action: "outline",
          ...base(),
          kind: p.kind,
          topic: p.topic,
          keyword: p.keyword || undefined,
          notes: p.notes || undefined,
          productSlugs: p.productSlugs ?? [],
          outsideTools: p.outsideTools ?? [],
        }),
      (data, id) => ({ id, kind: "outline", data }),
    ).then(() => setPlanOpen(false));

  const runMetadata = () =>
    structured<MetadataResult>(
      "Writing metadata…",
      () => blogApi.ai({ action: "metadata", ...base() }),
      (data, id) => ({
        id,
        kind: "metadata",
        data,
      }),
    );

  const runOptimize = () =>
    structured<OptimizeResult>(
      "Checking SEO issues…",
      () => blogApi.ai({ action: "optimize", ...base() }),
      (data, id) => ({
        id,
        kind: "optimize",
        data,
        applied: [],
      }),
    );

  // ---- streamed actions -------------------------------------------------------
  async function stream(
    card: Card & { kind: "reply" | "rewrite" },
    body: Parameters<typeof streamAi>[0],
    field: "text" | "html",
  ) {
    setCards((cs) => [...cs, card]);
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      await streamAi(body, (t) => patchCard(card.id, { [field]: t } as Partial<Card>), { signal: ctl.signal });
      patchCard(card.id, { streaming: false } as Partial<Card>);
    } catch (e) {
      patchCard(card.id, {
        streaming: false,
        ...(ctl.signal.aborted ? {} : { error: describeAiError(e) }),
      } as Partial<Card>);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  /** Streams HTML straight into the article. `where: "all"` replaces the body. Resolves true on success. */
  async function streamIntoEditor(
    label: string,
    body: Parameters<typeof streamAi>[0],
    where: "end" | "cursor" | "all",
  ) {
    const id = nextId();
    setCards((cs) => [...cs, { id, kind: "draft", label, status: "Starting…", streaming: true }]);
    const editor = getEditor();
    if (!editor) {
      patchCard(id, { streaming: false, error: "The editor isn't ready yet. Try again in a moment." });
      return false;
    }
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    let range = where === "all" ? { from: 0, to: editor.state.doc.content.size } : streamAnchor(editor, where);
    try {
      await streamAi(
        body,
        (t) => {
          range = streamHtmlInto(editor, range, t);
          patchCard(id, { status: "Writing…" });
        },
        { signal: ctl.signal, onStatus: (s) => patchCard(id, { status: s }) },
      );
      patchCard(id, { streaming: false, status: "Done" });
      return !ctl.signal.aborted;
    } catch (e) {
      patchCard(id, {
        streaming: false,
        ...(ctl.signal.aborted ? { status: "Stopped" } : { error: describeAiError(e) }),
      });
      return false;
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const categoryId = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;

  /** Applies the brief's metadata, writes the body, then draws the images it asked for. */
  async function draftFromBrief(
    cardId: number,
    d: OutlineResult,
    b: Parameters<Parameters<typeof OutlineCard>[0]["onDraft"]>[0],
  ) {
    const patch: Partial<BlogFields> = {
      title: b.title,
      focus_keyword: b.keyword,
      secondary_keywords: d.secondaryKeywords,
      excerpt: d.excerpt || fieldsRef.current.excerpt,
      seo_description: d.seoDescription || fieldsRef.current.seo_description,
    };
    if (d.tags.length) patch.tags = d.tags;
    const cid = categoryId(d.category);
    if (cid) patch.category_id = cid;
    update(patch);
    if (d.slug && post.kind !== "recap") onSlug(d.slug);
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    const ok = await streamIntoEditor(
      b.title,
      {
        action: "draftArticle",
        ...base(),
        kind: d.kind,
        title: b.title,
        keyword: b.keyword,
        secondaryKeywords: d.secondaryKeywords,
        angle: b.angle,
        productSlugs: b.productSlugs,
        outsideTools: b.outsideTools,
        outline: d.outline.map((o) => ({ h2: o.h2, h3s: o.h3s })),
      },
      post.kind === "launch" || post.kind === "recap" ? "all" : "end",
    );
    if (ok) await generateAll({ cover: !fieldsRef.current.cover_url });
  }

  async function reviseWithNotes() {
    const notes = post.review?.notes;
    if (!notes) return;
    const ok = await confirmDialog({
      title: "Rewrite the post with the maker's notes?",
      message: "The current version stays in the history.",
      confirmLabel: "Rewrite",
    });
    if (!ok) return;
    await streamIntoEditor("Applying the maker's notes", { action: "revise", ...base(), notes }, "all");
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setCards((cs) => [...cs, { id: nextId(), kind: "user", text }]);
    if (mode === "write") {
      void streamIntoEditor(text, { action: "write", ...base(), instruction: text, mode: "section" }, "cursor");
      return;
    }
    const history = cards
      .filter(
        (c): c is Extract<Card, { kind: "user" | "reply" }> =>
          (c.kind === "user" || c.kind === "reply") && !("error" in c && c.error),
      )
      .slice(-10)
      .map((c) => ({ role: c.kind === "user" ? ("user" as const) : ("assistant" as const), content: c.text }));
    void stream(
      { id: nextId(), kind: "reply", text: "", streaming: true },
      { action: "chat", ...base(), messages: [...history, { role: "user", content: text }] },
      "text",
    );
  }

  // A rewrite requested from the selection menu.
  const handledRewrite = useRef(0);
  useEffect(() => {
    if (!rewriteRequest || rewriteRequest.id === handledRewrite.current || busy) return;
    handledRewrite.current = rewriteRequest.id;
    void stream(
      {
        id: nextId(),
        kind: "rewrite",
        label: rewriteRequest.instruction,
        req: rewriteRequest,
        html: "",
        streaming: true,
      },
      { action: "rewrite", ...base(), selection: rewriteRequest.text, instruction: rewriteRequest.instruction },
      "html",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewriteRequest]);

  // "Draft with AI" from the blog list: plan the launch post straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || post.kind !== "launch" || !post.product) return;
    autoStarted.current = true;
    void runOutline({ kind: "launch", topic: `${post.product.name}: ${fieldsRef.current.title || post.product.name}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  function applyMetadata(d: MetadataResult) {
    const patch: Partial<BlogFields> = {};
    const t = d.seoTitleOptions.find((o) => o.ok) ?? d.seoTitleOptions[0];
    const desc = d.seoDescriptionOptions.find((o) => o.ok) ?? d.seoDescriptionOptions[0];
    if (t) patch.seo_title = t.text;
    if (desc) patch.seo_description = desc.text;
    if (d.excerpt) patch.excerpt = d.excerpt;
    if (d.tags.length) patch.tags = d.tags;
    const cid = categoryId(d.category);
    if (cid) patch.category_id = cid;
    if (d.secondaryKeywords.length) patch.secondary_keywords = d.secondaryKeywords;
    if (d.coverAlt && fieldsRef.current.cover_url && !fieldsRef.current.cover_alt) patch.cover_alt = d.coverAlt;
    update(patch);
    notify("Recommended metadata applied.");
  }

  function applyEdit(cardId: number, e: OptimizeResult["edits"][number]) {
    const editor = getEditor();
    if (editor && applyTextEdit(editor, e.find, e.replace)) {
      setCards((cs) =>
        cs.map((c) => (c.id === cardId && c.kind === "optimize" ? { ...c, applied: [...c.applied, e.id] } : c)),
      );
    } else {
      notify("That passage has changed since the suggestion was made.", "error");
    }
  }

  const planIdea = (cardId: number, idea: ContentIdea) => {
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    void runOutline({
      kind: idea.kind,
      topic: idea.title,
      keyword: idea.keyword,
      notes: idea.angle,
      productSlugs: idea.productSlugs,
      outsideTools: idea.outsideTools,
    });
  };

  const chip =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {post.kind === "launch" ? (
          <button
            type="button"
            className={chip}
            disabled={busy || !post.product}
            onClick={() =>
              post.product &&
              void runOutline({ kind: "launch", topic: `${post.product.name}: ${fieldsRef.current.title}` })
            }
          >
            <IconSparkles className="text-primary" /> Plan launch post
          </button>
        ) : null}
        {post.kind === "recap" ? (
          <button
            type="button"
            className={chip}
            disabled={busy}
            onClick={() =>
              void streamIntoEditor(
                "Polishing the recap",
                {
                  action: "draftArticle",
                  ...base(),
                  kind: "recap",
                  title: fieldsRef.current.title || "Weekly recap",
                  keyword: fieldsRef.current.focus_keyword || "new startup launches this week",
                },
                "all",
              )
            }
          >
            <IconSparkles className="text-primary" /> Polish recap
          </button>
        ) : null}
        {!fixedKind ? (
          <>
            <button type="button" className={chip} disabled={busy} onClick={() => void runIdeas()}>
              <IconBulb className="text-primary" /> Find ideas
            </button>
            <button type="button" className={chip} disabled={busy} onClick={() => setPlanOpen((v) => !v)}>
              <IconSearch className="text-primary" /> Plan a post
            </button>
          </>
        ) : null}
        <button type="button" className={chip} disabled={busy} onClick={() => void runOptimize()}>
          <IconArrowRight className="text-primary" /> Optimize SEO
        </button>
        <button type="button" className={chip} disabled={busy} onClick={() => void runMetadata()}>
          <IconSparkles className="text-primary" /> Metadata
        </button>
        <button
          type="button"
          className={chip}
          disabled={busy || generatingImages || spots === 0}
          title={spots === 0 ? "No “image to generate” boxes in the post" : undefined}
          onClick={() => void generateAll({ cover: false })}
        >
          <IconWand className="text-primary" />{" "}
          {generatingImages ? "Drawing…" : `Draw images${spots ? ` (${spots})` : ""}`}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {post.review?.status === "changes_requested" && post.review.notes ? (
          <div className="rounded-lg border border-accent/60 bg-accent/10 p-3 text-sm">
            <p className="font-semibold">The maker sent notes</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{post.review.notes}</p>
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => void reviseWithNotes()}>
              <IconSparkles /> Apply the maker&apos;s notes
            </Button>
          </div>
        ) : null}

        {!fixedKind && !busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor="ideas-focus">Ideas for</label>
            <Select
              id="ideas-focus"
              value={ideasFocus}
              onChange={(e) => setIdeasFocus(e.target.value as typeof ideasFocus)}
              className="h-8 w-auto text-xs"
            >
              <option value="any">any kind of post</option>
              <option value="post">keyword articles</option>
              <option value="roundup">roundups</option>
              <option value="comparison">comparisons</option>
              <option value="alternatives">alternatives</option>
            </Select>
          </div>
        ) : null}

        {planOpen ? (
          <div className={cn(shell, "space-y-3")}>
            <Field label="Kind of post" htmlFor="plan-kind">
              <Select
                id="plan-kind"
                value={plan.kind}
                onChange={(e) => setPlan({ ...plan, kind: e.target.value as PostKind })}
              >
                <option value="post">Keyword article</option>
                <option value="roundup">Roundup (N best X for Y)</option>
                <option value="comparison">Comparison (X vs Y)</option>
                <option value="alternatives">Alternatives (X alternatives)</option>
              </Select>
            </Field>
            <Field label="What is it about?" htmlFor="plan-topic">
              <TextInput
                id="plan-topic"
                value={plan.topic}
                onChange={(e) => setPlan({ ...plan, topic: e.target.value })}
                placeholder="e.g. best AI tools for writing landing pages"
              />
            </Field>
            <Field
              label="Target keyword (optional)"
              htmlFor="plan-kw"
              hint="Leave blank and the agent picks one from real search data."
            >
              <TextInput
                id="plan-kw"
                value={plan.keyword}
                onChange={(e) => setPlan({ ...plan, keyword: e.target.value })}
              />
            </Field>
            <Field label="Notes (optional)" htmlFor="plan-notes">
              <TextArea
                id="plan-notes"
                rows={2}
                value={plan.notes}
                onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
                placeholder="Angle, audience, products to include or leave out"
              />
            </Field>
            <Button disabled={busy || plan.topic.trim().length < 3} onClick={() => void runOutline(plan)}>
              <IconSparkles /> Create brief
            </Button>
          </div>
        ) : null}

        {cards.length === 0 && !planOpen ? (
          <div className="rounded-lg bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">The DebutYard writer</p>
            <p className="mt-1">
              It reads the live board, checks real search volume and who ranks, researches on Google, and writes to the
              same rules the SEO checklist enforces. It only links to pages that exist. Charts and diagrams it asks for
              are drawn by Nano Banana; real screenshots are left for you.
            </p>
            <p className="mt-2 text-xs">
              Tip: select text in the post and choose <strong>Ask AI</strong> to rewrite it in place.
            </p>
          </div>
        ) : null}

        {cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            categories={categories}
            onDismiss={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}
            onReplace={(card) => {
              const ed = getEditor();
              if (ed && replaceSelectionWithHtml(ed, card.req.from, card.req.to, card.req.text, card.html)) {
                setCards((cs) => cs.filter((x) => x.id !== card.id));
                notify("Selection rewritten.");
              } else notify("The selected text changed. Select it again and retry.", "error");
            }}
            onDraft={(d, b) => void draftFromBrief(c.id, d, b)}
            onPlanIdea={(idea) => planIdea(c.id, idea)}
            onSlug={onSlug}
            onApplyMetadata={applyMetadata}
            onPatch={update}
            onApplyEdit={applyEdit}
            onApplyAllEdits={(card) =>
              card.data.edits.filter((e) => !card.applied.includes(e.id)).forEach((e) => applyEdit(card.id, e))
            }
          />
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3">
        <div
          className="mb-2 flex items-center gap-1 rounded-md bg-muted p-0.5 text-sm"
          role="tablist"
          aria-label="Writer mode"
        >
          {(["chat", "write"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded px-3 py-1 font-medium",
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "chat" ? "Ask" : "Write into post"}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <TextArea
            rows={2}
            value={input}
            aria-label={mode === "chat" ? "Ask the writer" : "Describe what to write"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "chat" ? "Ask about keywords, structure, or what to improve…" : "e.g. Write a section on pricing"
            }
            className="resize-none"
          />
          {busy ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <IconStop className="size-5" />
            </Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()} aria-label="Send">
              <IconSend className="size-5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          The writer can be wrong. Check facts, prices and links before publishing.
        </p>
      </div>
    </div>
  );
}

type ViewProps = {
  card: Card;
  categories: StaffCategory[];
  onDismiss: () => void;
  onReplace: (card: Extract<Card, { kind: "rewrite" }>) => void;
  onDraft: (d: OutlineResult, b: Parameters<Parameters<typeof OutlineCard>[0]["onDraft"]>[0]) => void;
  onPlanIdea: (idea: ContentIdea) => void;
  onSlug: (s: string) => void;
  onApplyMetadata: (d: MetadataResult) => void;
  onPatch: (p: Partial<BlogFields>) => void;
  onApplyEdit: (cardId: number, e: OptimizeResult["edits"][number]) => void;
  onApplyAllEdits: (card: Extract<Card, { kind: "optimize" }>) => void;
};

function CardView(p: ViewProps) {
  const c = p.card;
  switch (c.kind) {
    case "user":
      return <div className="ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm">{c.text}</div>;

    case "loading":
      return (
        <div className={cn(shell, "flex items-center gap-2 text-sm text-muted-foreground")} role="status">
          <Spinner className="text-primary" />
          {c.label}
        </div>
      );

    case "error":
      return <ErrorNote error={c.error} onDismiss={p.onDismiss} />;

    case "reply":
      return (
        <div className="mr-6 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed">
          {c.text || (c.streaming ? "…" : "")}
          {c.error ? <ErrorNote error={c.error} className="mt-2 whitespace-normal" /> : null}
        </div>
      );

    case "draft":
      return (
        <div className={shell}>
          <Heading>{c.streaming ? "Writing in the post" : "Written into the post"}</Heading>
          <p className="text-sm">{c.label}</p>
          {c.streaming ? (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Spinner className="size-3.5 text-primary" /> {c.status}
            </p>
          ) : null}
          {c.error ? <ErrorNote error={c.error} className="mt-2" /> : null}
          {!c.streaming ? (
            <Button size="sm" variant="ghost" className="mt-2" onClick={p.onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      );

    case "rewrite":
      return (
        <div className={shell}>
          <Heading>
            Rewrite: {c.label}
            {c.streaming ? " (writing…)" : ""}
          </Heading>
          <p className="mb-2 line-clamp-3 rounded-md bg-danger/5 px-3 py-2 text-sm text-muted-foreground line-through decoration-danger/40">
            {c.req.text}
          </p>
          <p className="whitespace-pre-line rounded-md bg-muted/60 px-3 py-2 text-sm">{htmlToText(c.html) || "…"}</p>
          {c.error ? <ErrorNote error={c.error} className="mt-2" /> : null}
          {!c.streaming && c.html ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => p.onReplace(c)}>
                Replace selection
              </Button>
              <Button size="sm" variant="ghost" onClick={p.onDismiss}>
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      );

    case "outline":
      return <OutlineCard d={c.data} onDraft={(b) => p.onDraft(c.data, b)} onDismiss={p.onDismiss} />;

    case "ideas":
      return (
        <div className={shell}>
          <Heading>Post ideas</Heading>
          {c.data.ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas came back. Try again or change the focus.</p>
          ) : (
            <div className="space-y-3">
              {c.data.ideas.map((idea) => (
                <div key={idea.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                      {KIND_LABEL[idea.kind]}
                    </span>
                    <Signal s={idea.signal} />
                  </div>
                  <p className="mt-1.5 text-sm font-semibold">{idea.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Keyword: {idea.keyword}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{idea.angle}</p>
                  {idea.productSlugs.length || idea.outsideTools.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Covers {[...idea.productSlugs, ...idea.outsideTools].slice(0, 8).join(", ")}
                    </p>
                  ) : null}
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => p.onPlanIdea(idea)}>
                    Plan this post
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!c.data.keywordDataAvailable ? (
            <p className="mt-2 rounded-md bg-accent/15 p-2.5 text-xs">
              Keyword Planner isn&apos;t returning data, so these are ranked by autocomplete and intent only. The setup
              is in docs/blog.md.
            </p>
          ) : null}
          <Button size="sm" variant="ghost" className="mt-2" onClick={p.onDismiss}>
            Dismiss
          </Button>
        </div>
      );

    case "metadata": {
      const d = c.data;
      const len = (o: { length: number; ok: boolean }) => (
        <span className={cn("text-xs", o.ok ? "text-success" : "text-amber-600")}>({o.length})</span>
      );
      return (
        <div className={shell}>
          <Heading>SEO title options</Heading>
          <ul>
            {d.seoTitleOptions.map((o) => (
              <Row key={o.text} action={<Use onClick={() => p.onPatch({ seo_title: o.text })} />}>
                {o.text} {len(o)}
              </Row>
            ))}
          </ul>
          <Heading>Meta description options</Heading>
          <ul>
            {d.seoDescriptionOptions.map((o) => (
              <Row key={o.text} action={<Use onClick={() => p.onPatch({ seo_description: o.text })} />}>
                {o.text} {len(o)}
              </Row>
            ))}
          </ul>
          {d.slug ? (
            <>
              <Heading>URL</Heading>
              <ul>
                <Row action={<Use onClick={() => p.onSlug(d.slug)} />}>/blog/{d.slug}</Row>
              </ul>
            </>
          ) : null}
          {d.excerpt ? (
            <>
              <Heading>Excerpt</Heading>
              <ul>
                <Row action={<Use onClick={() => p.onPatch({ excerpt: d.excerpt })} />}>{d.excerpt}</Row>
              </ul>
            </>
          ) : null}
          {d.tags.length ? (
            <>
              <Heading>Tags</Heading>
              <ul>
                <Row action={<Use onClick={() => p.onPatch({ tags: d.tags })} />}>{d.tags.join(", ")}</Row>
              </ul>
            </>
          ) : null}
          {d.category ? (
            <>
              <Heading>Category</Heading>
              <ul>
                <Row
                  action={
                    <Use
                      onClick={() => {
                        const id = p.categories.find((x) => x.name === d.category)?.id;
                        if (id) p.onPatch({ category_id: id });
                      }}
                    />
                  }
                >
                  {d.category}
                </Row>
              </ul>
            </>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => p.onApplyMetadata(d)}>
              Apply recommended
            </Button>
            <Button size="sm" variant="ghost" onClick={p.onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      );
    }

    case "optimize": {
      const d = c.data;
      const fu = d.fieldUpdates;
      const nothing = !Object.keys(fu).length && d.edits.length === 0 && d.advice.length === 0;
      const pending = d.edits.filter((e) => !c.applied.includes(e.id));
      const field = (label: string, value: string, apply: () => void) => (
        <ul>
          <Row action={<Use onClick={apply} />}>
            <span className="text-xs uppercase text-muted-foreground">{label}</span>
            <br />
            {value}
          </Row>
        </ul>
      );
      return (
        <div className={shell}>
          <Heading>
            SEO fixes ({d.issuesConsidered} issue{d.issuesConsidered === 1 ? "" : "s"} reviewed)
          </Heading>
          {nothing ? (
            <p className="text-sm text-muted-foreground">
              {d.issuesConsidered === 0 ? "No fixable issues. Nice work." : "No safe automatic fixes. See the SEO tab."}
            </p>
          ) : null}
          {fu.seo_title ? field("SEO title", fu.seo_title, () => p.onPatch({ seo_title: fu.seo_title })) : null}
          {fu.seo_description
            ? field("Meta description", fu.seo_description, () => p.onPatch({ seo_description: fu.seo_description }))
            : null}
          {fu.excerpt ? field("Excerpt", fu.excerpt, () => p.onPatch({ excerpt: fu.excerpt })) : null}
          {fu.tags ? field("Tags", fu.tags.join(", "), () => p.onPatch({ tags: fu.tags })) : null}
          {d.edits.map((e) => {
            const done = c.applied.includes(e.id);
            return (
              <div
                key={e.id}
                className={cn(
                  "mt-2 rounded-md border p-2.5 text-sm",
                  done ? "border-success/40 bg-success/5" : "border-border",
                )}
              >
                <p className="text-danger line-through decoration-danger/40">{e.find}</p>
                <p className="mt-1 text-success">{e.replace}</p>
                <p className="mt-1 text-xs text-muted-foreground">{e.why}</p>
                {done ? (
                  <p className="mt-1 text-xs font-semibold text-success">Applied</p>
                ) : (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => p.onApplyEdit(c.id, e)}>
                    Apply edit
                  </Button>
                )}
              </div>
            );
          })}
          {d.advice.length ? (
            <>
              <Heading>Needs a human touch</Heading>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {d.advice.map((a, i) => (
                  <li key={i}>{a.note}</li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="mt-3 flex gap-2">
            {pending.length > 1 ? (
              <Button size="sm" onClick={() => p.onApplyAllEdits(c)}>
                Apply all edits
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={p.onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      );
    }
  }
}
