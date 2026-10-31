"use client";

import type { Editor } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AuthorProfileDialog } from "@/components/blog-admin/author-profile-dialog";
import { EditorCanvas } from "@/components/blog-admin/editor/editor-canvas";
import {
  applyLinkInEditor,
  generateSpots,
  replaceSpotWithImage,
  spotAt,
} from "@/components/blog-admin/editor/editor-actions";
import { PublishDialog } from "@/components/blog-admin/editor/publish-dialog";
import { RevisionsDialog } from "@/components/blog-admin/editor/revisions-dialog";
import { clearBackup, readBackup, useAutosave, type Backup } from "@/components/blog-admin/editor/use-autosave";
import {
  IconArrowLeft,
  IconClock,
  IconDots,
  IconExternal,
  IconSave,
  IconSend,
  IconSparkles,
} from "@/components/blog-admin/icons";
import { AiPanel, type RewriteRequest } from "@/components/blog-admin/panels/ai-panel";
import { LinksPanel } from "@/components/blog-admin/panels/links-panel";
import { SeoPanel } from "@/components/blog-admin/panels/seo-panel";
import { SettingsPanel } from "@/components/blog-admin/panels/settings-panel";
import { Menu, MenuItem, ScoreChip, StatusBadge, Toast, type ToastState } from "@/components/blog-admin/ui";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import type { ImageResult } from "@/lib/blog/ai/types";
import { aiFields, BlogApiError, blogApi, describeAiError } from "@/lib/blog/client";
import { placeholderBlockers } from "@/lib/blog/content";
import type { CorpusPost } from "@/lib/blog/seo/analyze";
import { analyzeSeo, publishBlockers } from "@/lib/blog/seo/analyze";
import type { BlogDisplayStatus, BlogFields, StaffCategory, StaffPost } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type Tab = "ai" | "seo" | "links" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "ai", label: "Writer" },
  { key: "seo", label: "SEO" },
  { key: "links", label: "Links" },
  { key: "settings", label: "Settings" },
];

function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Grows with its content so long headlines wrap instead of scrolling sideways. */
function TitleField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label="Headline"
      placeholder="Headline"
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      className="mb-6 block w-full resize-none overflow-hidden bg-transparent font-display text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
    />
  );
}

const REVIEW_LABEL: Record<NonNullable<StaffPost["review"]>["status"], string> = {
  pending: "Sent to the maker",
  approved: "Maker approved",
  changes_requested: "Maker sent notes",
};

export function BlogEditor({
  initial,
  categories: initialCategories,
  siteHost,
  autoDraft,
}: {
  initial: StaffPost;
  categories: StaffCategory[];
  siteHost: string;
  /** Opened from "Draft with AI": start planning straight away. */
  autoDraft: boolean;
}) {
  const router = useRouter();
  const postId = initial.id;

  const [fields, setFields] = useState<BlogFields>(initial.fields);
  const fieldsRef = useRef(fields);
  const [slug, setSlug] = useState(initial.slug);
  const [post, setPost] = useState(initial);
  const [meta, setMeta] = useState({
    status: initial.status,
    displayStatus: initial.displayStatus as BlogDisplayStatus,
    publishedAt: initial.publishedAt,
    featured: initial.featured,
    unpublishedChanges: initial.hasUnpublishedChanges,
  });
  const [tab, setTab] = useState<Tab>(autoDraft ? "ai" : "seo");
  const [panelOpen, setPanelOpen] = useState(autoDraft);
  const [site, setSite] = useState<{
    corpus: CorpusPost[];
    loaded: boolean;
    categories: StaffCategory[];
    tags: string[];
  }>({
    corpus: [],
    loaded: false,
    categories: initialCategories,
    tags: [],
  });
  const [rewrite, setRewrite] = useState<RewriteRequest | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [drawing, setDrawing] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const editorRef = useRef<Editor | null>(null);
  const toastId = useRef(1);

  const notify = useCallback((message: string, tone: "info" | "error" = "info") => {
    setToast({ id: toastId.current++, message, tone });
  }, []);

  const autosave = useAutosave({ postId, initialVersion: initial.version, getFields: () => fieldsRef.current });
  const { queue, settle, state: saveState, savedAt, error: saveError } = autosave;

  /** Single write path for every field: local state now, autosave shortly after. */
  const update = useCallback(
    (patch: Partial<BlogFields>) => {
      fieldsRef.current = { ...fieldsRef.current, ...patch };
      setFields(fieldsRef.current);
      setMeta((m) => (m.unpublishedChanges ? m : { ...m, unpublishedChanges: m.status === "published" }));
      queue(patch);
    },
    [queue],
  );

  // ---- site context (other posts, tags) for live SEO checks --------------------------
  const loadSite = useCallback(async () => {
    try {
      const r = await blogApi.corpus();
      setSite((s) => ({ ...s, corpus: r.corpus, loaded: true, categories: r.categories, tags: r.tags }));
    } catch {
      /* the checks that need site context simply stay off */
    }
  }, []);
  useEffect(() => {
    // Fetch on mount; the state is set after the request resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSite();
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last > 30_000) {
        last = Date.now();
        void loadSite();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSite]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  // ---- recover unsaved work from a crashed or closed tab -------------------------------
  useEffect(() => {
    const b = readBackup(postId);
    if (!b) return;
    const newer = b.at > new Date(initial.updatedAt).getTime();
    const differs = JSON.stringify(b.fields) !== JSON.stringify(initial.fields);
    // localStorage is only readable after hydration, so this cannot be initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newer && differs) setBackup(b);
    else clearBackup(postId);
  }, [postId, initial.updatedAt, initial.fields]);

  // ---- live SEO analysis ---------------------------------------------------------------
  const deferred = useDeferredValue(fields);
  const report = useMemo(
    () => analyzeSeo({ fields: deferred, slug, postId, siteHost, corpus: site.loaded ? site.corpus : undefined }),
    [deferred, slug, postId, siteHost, site.loaded, site.corpus],
  );
  const blockers = useMemo(
    () => [...publishBlockers(report, deferred), ...placeholderBlockers(deferred.content_json)],
    [report, deferred],
  );

  const onContentChange = useCallback(
    (doc: BlogFields["content_json"]) => {
      update({ content_json: doc });
      setContentVersion((v) => v + 1);
    },
    [update],
  );
  const onEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
  }, []);
  const askAi = useCallback<Parameters<typeof EditorCanvas>[0]["onAskAi"]>((instruction, sel) => {
    setRewrite({ id: Date.now(), instruction, ...sel });
    setTab("ai");
    setPanelOpen(true);
  }, []);

  // ---- images drawn by Nano Banana ------------------------------------------------------
  async function drawSpot(text: string) {
    if (text.length < 10) {
      notify("Describe the image in the box first: what it shows, every label and number.", "error");
      return;
    }
    setDrawing((n) => n + 1);
    try {
      const img = (await blogApi.ai({
        action: "image",
        postId,
        fields: aiFields(fieldsRef.current),
        description: text,
      })) as ImageResult;
      const ed = editorRef.current;
      if (!ed || !replaceSpotWithImage(ed, text, img))
        notify("The image was drawn, but its box was edited or removed.", "error");
    } catch (e) {
      notify(describeAiError(e), "error");
    } finally {
      setDrawing((n) => n - 1);
    }
  }

  const drawAt = (pos: number) => {
    const ed = editorRef.current;
    const spot = ed && spotAt(ed, pos);
    if (spot) void drawSpot(spot.text);
  };

  async function generateCover(notes = "") {
    setGeneratingCover(true);
    try {
      const r = (await blogApi.ai({
        action: "cover",
        postId,
        fields: aiFields(fieldsRef.current),
        notes: notes.trim() || undefined,
      })) as ImageResult;
      update({ cover_url: r.url, cover_width: r.width, cover_height: r.height, cover_alt: r.alt });
      notify("Banner drawn.");
    } catch (e) {
      notify(describeAiError(e), "error");
    } finally {
      setGeneratingCover(false);
    }
  }

  /** Every "image to generate" box, two at a time, plus the banner when asked. */
  const generateAll = async ({ cover }: { cover: boolean }) => {
    const ed = editorRef.current;
    const texts = ed ? generateSpots(ed).map((s) => s.text) : [];
    const jobs: (() => Promise<void>)[] = texts.map((t) => () => drawSpot(t));
    if (cover) jobs.unshift(() => generateCover());
    if (jobs.length === 0) return;
    notify(`Drawing ${jobs.length} image${jobs.length === 1 ? "" : "s"} with Nano Banana…`);
    const queue = [...jobs];
    await Promise.all(
      [0, 1].map(async () => {
        for (let job = queue.shift(); job; job = queue.shift()) await job();
      }),
    );
  };

  // ---- post actions -----------------------------------------------------------------
  async function goBack(e: React.MouseEvent) {
    e.preventDefault();
    await settle();
    router.push("/admin/blog");
  }

  async function saveSlug(next: string): Promise<string | null> {
    if (
      meta.status === "published" &&
      !(await confirmDialog({
        title: "Change the URL of a live post?",
        message: "The old URL keeps working as a redirect.",
        confirmLabel: "Change URL",
      }))
    ) {
      return "Cancelled.";
    }
    try {
      const { post: p } = await blogApi.meta(postId, { slug: next });
      setSlug(p.slug);
      notify(`URL changed to /blog/${p.slug}`);
      return null;
    } catch (e) {
      return e instanceof BlogApiError ? e.message : "Could not change the URL.";
    }
  }

  async function setFeatured(v: boolean) {
    try {
      const { post: p } = await blogApi.meta(postId, { featured: v });
      setMeta((m) => ({ ...m, featured: p.featured }));
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not update.", "error");
    }
  }

  async function createCategory(name: string) {
    try {
      const { category } = await blogApi.createCategory(name);
      setSite((s) => ({ ...s, categories: [...s.categories, category] }));
      update({ category_id: category.id });
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not create the category.", "error");
    }
  }

  async function uploadImage(file: File) {
    try {
      return await blogApi.upload(file);
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Upload failed.", "error");
      return null;
    }
  }

  async function addAuthor(query: string, role: "team" | "maker") {
    try {
      const { post: p } = await blogApi.addAuthor(postId, query, role);
      setPost((x) => ({ ...x, authors: p.authors }));
      return null;
    } catch (e) {
      return e instanceof BlogApiError ? e.message : "Could not add them.";
    }
  }

  async function removeAuthor(userId: string) {
    try {
      const { post: p } = await blogApi.removeAuthor(postId, userId);
      setPost((x) => ({ ...x, authors: p.authors }));
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not remove them.", "error");
    }
  }

  async function sendToMaker() {
    if (!(await settle())) return notify("Could not save your latest changes first.", "error");
    const ok = await confirmDialog({
      title: "Email the maker a preview?",
      message:
        "They get a private preview of this draft and have 48 hours to approve it or send notes. It doesn't stop you publishing.",
      confirmLabel: "Send preview",
    });
    if (!ok) return;
    setReviewBusy(true);
    try {
      const { review } = await blogApi.requestMakerReview(postId);
      setPost((x) => ({ ...x, review }));
      notify("Sent. Their answer shows up here and in your inbox.");
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not send it.", "error");
    } finally {
      setReviewBusy(false);
    }
  }

  async function publish(publishedAt: string | null) {
    setPublishing(true);
    setServerBlockers([]);
    try {
      if (!(await settle())) {
        notify("Could not save your latest changes. Try again.", "error");
        return;
      }
      const { post: p } = await blogApi.publish(postId, publishedAt);
      setSlug(p.slug);
      setPost(p);
      setMeta({
        status: p.status,
        displayStatus: p.displayStatus,
        publishedAt: p.publishedAt,
        featured: p.featured,
        unpublishedChanges: false,
      });
      setPublishOpen(false);
      notify(p.displayStatus === "scheduled" ? "Scheduled." : "Published.");
      void loadSite();
    } catch (e) {
      if (e instanceof BlogApiError && e.status === 422 && Array.isArray(e.data.blockers)) {
        setServerBlockers(e.data.blockers as string[]);
      } else {
        notify(e instanceof BlogApiError ? e.message : "Could not publish.", "error");
      }
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    const ok = await confirmDialog({
      title: "Unpublish this post?",
      message: "It goes back to being a draft and its URL stops working.",
      confirmLabel: "Unpublish",
      danger: true,
    });
    if (!ok) return;
    try {
      const { post: p } = await blogApi.unpublish(postId);
      setMeta((m) => ({ ...m, status: p.status, displayStatus: p.displayStatus, unpublishedChanges: false }));
      notify("Unpublished. It's a draft again.");
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not unpublish.", "error");
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Delete this post permanently?",
      message: "This can't be undone.",
      confirmLabel: "Delete post",
      danger: true,
    });
    if (!ok) return;
    try {
      await blogApi.remove(postId);
      clearBackup(postId);
      router.push("/admin/blog");
    } catch (e) {
      notify(e instanceof BlogApiError ? e.message : "Could not delete.", "error");
    }
  }

  // Ctrl/Cmd+S: save now instead of the browser's "Save page" dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void settle().then((ok) => notify(ok ? "Saved." : "Could not save.", ok ? "info" : "error"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settle, notify]);

  const isLive = meta.status === "published";
  const canUpdate = !isLive || meta.unpublishedChanges || saveState !== "saved";
  const isLaunch = post.kind === "launch";

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "dirty"
        ? "Unsaved changes…"
        : saveState === "offline"
          ? "Offline. Saves when you reconnect"
          : saveState === "error"
            ? `Could not save${saveError ? `: ${saveError}` : ""}. Retrying`
            : saveState === "conflict"
              ? "Conflict"
              : `Saved ${relativeTime(savedAt, now)}`;

  const launchNote = isLaunch
    ? post.product
      ? `When it goes live, ${post.product.name}'s maker gets an email and the post appears on their listing. Links to their site are marked sponsored and tagged.`
      : null
    : null;

  return (
    <div className="-mx-4 -mb-16 -mt-6 flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background sm:-mx-8 lg:-mt-10 lg:min-h-dvh">
      <header className="sticky top-14 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-card px-3 sm:gap-2 lg:top-0">
        <Link
          href="/admin/blog"
          onClick={(e) => void goBack(e)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconArrowLeft />
          <span className="hidden sm:inline">Posts</span>
        </Link>
        <StatusBadge status={meta.displayStatus} />
        {isLive && meta.unpublishedChanges ? (
          <span className="hidden text-xs font-medium text-amber-700 dark:text-amber-400 md:inline">
            Unpublished changes
          </span>
        ) : null}
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "ml-1 hidden truncate text-sm sm:block",
            saveState === "error" || saveState === "conflict" || saveState === "offline"
              ? "text-danger"
              : "text-muted-foreground",
          )}
        >
          {saveLabel}
        </p>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isLaunch && post.product ? (
            <Button
              size="sm"
              variant="outline"
              className="hidden md:inline-flex"
              disabled={reviewBusy}
              onClick={() => void sendToMaker()}
              title={
                post.review
                  ? `${REVIEW_LABEL[post.review.status]} ${new Date(post.review.requestedAt).toLocaleDateString()}`
                  : undefined
              }
            >
              <IconSend />
              {post.review ? REVIEW_LABEL[post.review.status] : "Send to maker"}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setTab("seo");
              setPanelOpen(true);
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
            aria-label={`SEO score ${report.score ?? "not available"}. Open the SEO panel`}
          >
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground md:inline">
              SEO
            </span>
            <ScoreChip score={report.score} />
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2 lg:hidden"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            aria-label="Post tools"
          >
            <IconSparkles />
            <span className="hidden sm:inline">Tools</span>
          </Button>
          <Menu
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="More actions"
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconDots className="size-5" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    // Save first so the preview shows what's on screen.
                    void settle().then(() => window.open(`/blog/preview/${postId}`, "_blank", "noopener"));
                  }}
                >
                  <IconExternal /> Preview draft
                </MenuItem>
                {isLive ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      window.open(`/blog/${slug}`, "_blank", "noopener");
                    }}
                  >
                    <IconExternal /> View live
                  </MenuItem>
                ) : null}
                {isLaunch && post.product ? (
                  <MenuItem
                    className="md:hidden"
                    onClick={() => {
                      close();
                      void sendToMaker();
                    }}
                  >
                    <IconSend /> Send to maker
                  </MenuItem>
                ) : null}
                <MenuItem
                  onClick={() => {
                    close();
                    void autosave
                      .saveVersion()
                      .then((ok) => notify(ok ? "Version saved." : "Could not save a version.", ok ? "info" : "error"));
                  }}
                >
                  <IconSave /> Save version
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    setHistoryOpen(true);
                  }}
                >
                  <IconClock /> Version history
                </MenuItem>
                {isLive ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      void unpublish();
                    }}
                  >
                    Unpublish
                  </MenuItem>
                ) : null}
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    void remove();
                  }}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
          <Button
            size="sm"
            disabled={isLive && !canUpdate}
            onClick={() => {
              setServerBlockers([]);
              setPublishOpen(true);
            }}
          >
            {isLive ? "Update" : "Publish"}
          </Button>
        </div>
      </header>

      {saveState === "conflict" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-accent/60 bg-accent/15 px-4 py-2.5 text-sm"
        >
          <span className="min-w-0 flex-1">
            This post was changed somewhere else (another tab or a teammate), so autosave is paused to protect their
            work.
          </span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Load latest
          </Button>
          <Button size="sm" onClick={() => void autosave.overwrite()}>
            Overwrite with mine
          </Button>
        </div>
      ) : null}

      {backup ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-primary/30 bg-primary/5 px-4 py-2.5 text-sm"
        >
          <span className="min-w-0 flex-1">
            Unsaved changes from {new Date(backup.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
            were recovered on this device.
          </span>
          <Button
            size="sm"
            onClick={() => {
              update(backup.fields);
              editorRef.current?.commands.setContent(backup.fields.content_json);
              setBackup(null);
            }}
          >
            Restore them
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clearBackup(postId);
              setBackup(null);
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}

      <div className="relative flex flex-1">
        <EditorCanvas
          initialContent={initial.fields.content_json}
          posts={site.corpus}
          onChange={onContentChange}
          onAskAi={askAi}
          onGenerate={drawAt}
          onEditor={onEditor}
          onNotice={notify}
          header={
            <>
              {isLaunch && post.product ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Launch post for{" "}
                  <a
                    href={`/p/${post.product.slug}`}
                    target="_blank"
                    className="font-medium text-primary hover:underline"
                  >
                    {post.product.name}
                  </a>
                  {post.review?.status === "changes_requested" ? " · the maker sent notes (see Writer)" : ""}
                </p>
              ) : null}
              <TitleField
                value={fields.title}
                onChange={(v) => update({ title: v })}
                onEnter={() => editorRef.current?.commands.focus("start")}
              />
              {drawing > 0 ? (
                <p className="mb-4 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary" role="status">
                  Nano Banana is drawing {drawing} image{drawing === 1 ? "" : "s"}…
                </p>
              ) : null}
            </>
          }
        />

        {panelOpen ? (
          <button
            type="button"
            aria-label="Close tools"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />
        ) : null}
        <aside
          aria-label="Post tools"
          className={cn(
            "flex-col border-l border-border bg-card lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:w-[400px] lg:shrink-0",
            panelOpen ? "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] shadow-2xl lg:shadow-none" : "hidden",
          )}
        >
          <div role="tablist" aria-label="Editor panels" className="flex shrink-0 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex-1 px-2 py-3 text-sm font-semibold",
                  tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.key === "seo" && report.counts.fail > 0 ? (
                  <span className="ml-1.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {report.counts.fail}
                  </span>
                ) : null}
                {tab === t.key ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-primary" aria-hidden />
                ) : null}
              </button>
            ))}
          </div>
          {/* Every panel stays mounted so conversations and suggestions survive tab switches. */}
          <div className="min-h-0 flex-1">
            <div role="tabpanel" id="panel-ai" aria-labelledby="tab-ai" hidden={tab !== "ai"} className="h-full">
              <AiPanel
                post={post}
                fields={fields}
                update={update}
                getEditor={() => editorRef.current}
                categories={site.categories}
                onSlug={(s) => void saveSlug(s)}
                rewriteRequest={rewrite}
                autoStart={autoDraft}
                generateAll={generateAll}
                generatingImages={drawing > 0 || generatingCover}
                notify={notify}
              />
            </div>
            <div
              role="tabpanel"
              id="panel-seo"
              aria-labelledby="tab-seo"
              hidden={tab !== "seo"}
              className="h-full overflow-y-auto"
            >
              <SeoPanel report={report} fields={fields} slug={slug} siteHost={siteHost} update={update} />
            </div>
            <div
              role="tabpanel"
              id="panel-links"
              aria-labelledby="tab-links"
              hidden={tab !== "links"}
              className="h-full overflow-y-auto"
            >
              <LinksPanel
                active={tab === "links"}
                postId={postId}
                slug={slug}
                fields={fields}
                report={report}
                contentVersion={contentVersion}
                notify={notify}
                onApply={(s) => {
                  const ed = editorRef.current;
                  return ed ? applyLinkInEditor(ed, s.anchor, s.href) : false;
                }}
              />
            </div>
            <div
              role="tabpanel"
              id="panel-settings"
              aria-labelledby="tab-settings"
              hidden={tab !== "settings"}
              className="h-full overflow-y-auto"
            >
              <SettingsPanel
                fields={fields}
                update={update}
                post={post}
                slug={slug}
                status={meta.status}
                featured={meta.featured}
                siteHost={siteHost}
                categories={site.categories}
                tags={site.tags}
                onSaveSlug={saveSlug}
                onFeatured={(v) => void setFeatured(v)}
                onCreateCategory={createCategory}
                onUpload={uploadImage}
                onGenerateCover={(n) => void generateCover(n)}
                generatingCover={generatingCover}
                onAddAuthor={addAuthor}
                onRemoveAuthor={(id) => void removeAuthor(id)}
                onEditProfile={() => setProfileOpen(true)}
              />
            </div>
          </div>
        </aside>
      </div>

      {publishOpen ? (
        <PublishDialog
          report={report}
          blockers={blockers}
          serverBlockers={serverBlockers}
          isLive={isLive}
          hasChanges={canUpdate}
          scheduledFor={meta.displayStatus === "scheduled" ? meta.publishedAt : null}
          launchNote={launchNote}
          busy={publishing}
          onConfirm={(at) => void publish(at)}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}

      {historyOpen ? (
        <RevisionsDialog
          postId={postId}
          onClose={() => setHistoryOpen(false)}
          onRestore={async (revisionId) => {
            if (!(await settle())) return notify("Save your current changes first.", "error");
            try {
              await blogApi.restore(postId, revisionId);
              clearBackup(postId);
              window.location.reload();
            } catch (e) {
              notify(e instanceof BlogApiError ? e.message : "Could not restore.", "error");
            }
          }}
        />
      ) : null}

      {profileOpen ? <AuthorProfileDialog onClose={() => setProfileOpen(false)} /> : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
