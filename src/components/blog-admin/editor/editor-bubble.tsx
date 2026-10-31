"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolbarButton } from "@/components/blog-admin/editor/editor-toolbar";
import { IconCheck, IconCode, IconLink, IconSparkles, IconTrash, IconWand } from "@/components/blog-admin/icons";
import type { REWRITE_INSTRUCTIONS } from "@/lib/blog/ai/request";
import type { CorpusPost } from "@/lib/blog/seo/analyze";
import { cn } from "@/lib/utils";

export type RewriteInstruction = (typeof REWRITE_INSTRUCTIONS)[number];
export type AskAi = (instruction: RewriteInstruction, sel: { from: number; to: number; text: string }) => void;

const AI_OPTIONS: { key: RewriteInstruction; label: string }[] = [
  { key: "fix", label: "Fix grammar & clarity" },
  { key: "shorten", label: "Shorten" },
  { key: "expand", label: "Expand" },
  { key: "simplify", label: "Simplify" },
  { key: "friendly", label: "Friendlier tone" },
  { key: "professional", label: "More professional" },
  { key: "add-keyword", label: "Add focus keyword" },
];

/** URLs typed without a scheme become https; site paths, anchors and mailto are left alone. */
export function normalizeHref(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(v)) return v;
  return `https://${v}`;
}

const panel = "rounded-lg border border-border bg-card p-1 shadow-xl";

function LinkEditor({ editor, posts, onDone }: { editor: Editor; posts: CorpusPost[]; onDone: () => void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [value, setValue] = useState(existing);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2 || /^(https?:|\/|#|mailto:)/.test(q)) return [];
    return posts
      .filter((p) => p.status === "published" && (p.title.toLowerCase().includes(q) || p.slug.includes(q)))
      .slice(0, 4);
  }, [posts, value]);

  const apply = (href: string) => {
    const h = normalizeHref(href);
    if (!h) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: h }).run();
    onDone();
  };

  return (
    <div className="w-80 p-1.5">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              editor.commands.focus();
              onDone();
            }
          }}
          placeholder="Paste a URL, or search your articles"
          aria-label="Link URL"
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <ToolbarButton label="Apply link" onClick={() => apply(value)}>
          <IconCheck />
        </ToolbarButton>
        {existing ? (
          <ToolbarButton label="Remove link" onClick={() => apply("")}>
            <IconTrash />
          </ToolbarButton>
        ) : null}
      </div>
      {matches.length > 0 ? (
        <ul className="mt-1.5 border-t border-border pt-1.5">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(`/blog/${p.slug}`)}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                {p.title}
                <span className="ml-2 text-xs text-muted-foreground">/blog/{p.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Floating toolbar shown when text is selected: inline formatting, links (with autocomplete over
 * your own articles) and "Ask AI" rewrites. A second floating bar edits the alt text of a selected
 * image. `linkNonce` lets the pinned toolbar's Link button open the link editor here.
 */
export function EditorBubble({
  editor,
  posts,
  onAskAi,
  onGenerate,
  linkNonce,
}: {
  editor: Editor;
  posts: CorpusPost[];
  onAskAi: AskAi;
  /** Draw the image described in the "generate" callout at this position. */
  onGenerate: (pos: number) => void;
  linkNonce: number;
}) {
  const [mode, setMode] = useState<"format" | "link" | "ai">("format");
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      empty: e.state.selection.empty,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      alt: (e.getAttributes("image").alt as string | undefined) ?? "",
      generatePos: generateCalloutAt(e),
    }),
  });

  // Adjusted during render rather than in effects: a collapsed selection resets the bubble,
  // and each Ctrl+K (a new nonce) opens the link form.
  if (s.empty && mode !== "format") setMode("format");
  const [seenNonce, setSeenNonce] = useState(linkNonce);
  if (linkNonce !== seenNonce) {
    setSeenNonce(linkNonce);
    if (!s.empty) setMode("link");
  }

  const chain = () => editor.chain().focus();
  const ask = (instruction: RewriteInstruction) => {
    const { from, to } = editor.state.selection;
    onAskAi(instruction, { from, to, text: editor.state.doc.textBetween(from, to, "\n") });
    setMode("format");
  };

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="textBubble"
        options={{ placement: "top", offset: 8 }}
        shouldShow={({ editor: e, state }) =>
          e.isEditable && !state.selection.empty && !e.isActive("image") && !e.isActive("codeBlock")
        }
      >
        <div className={cn(panel, "flex items-center")}>
          {mode === "link" ? (
            <LinkEditor editor={editor} posts={posts} onDone={() => setMode("format")} />
          ) : mode === "ai" ? (
            <div className="w-56 p-1">
              <p className="px-2 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rewrite selection
              </p>
              {AI_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ask(o.key)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <ToolbarButton label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}>
                <span className="font-bold">B</span>
              </ToolbarButton>
              <ToolbarButton label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}>
                <span className="italic">I</span>
              </ToolbarButton>
              <ToolbarButton label="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
                <span className="underline">U</span>
              </ToolbarButton>
              <ToolbarButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
                <span className="line-through">S</span>
              </ToolbarButton>
              <ToolbarButton label="Highlight" active={s.highlight} onClick={() => chain().toggleHighlight().run()}>
                <span className="rounded bg-accent/50 px-1">H</span>
              </ToolbarButton>
              <ToolbarButton label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}>
                <IconCode />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <ToolbarButton label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
                H2
              </ToolbarButton>
              <ToolbarButton label="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
                H3
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <ToolbarButton label="Link" active={s.link} onClick={() => setMode("link")}>
                <IconLink />
              </ToolbarButton>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMode("ai")}
                className="ml-1 flex h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <IconSparkles />
                Ask AI
              </button>
            </>
          )}
        </div>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        pluginKey="imageBubble"
        options={{ placement: "bottom", offset: 8 }}
        shouldShow={({ editor: e }) => e.isEditable && e.isActive("image")}
      >
        <div className={cn(panel, "flex w-80 items-center gap-1.5 p-1.5")}>
          <label className="sr-only" htmlFor="image-alt">
            Image alt text
          </label>
          <input
            id="image-alt"
            value={s.alt}
            onChange={(e) => editor.chain().updateAttributes("image", { alt: e.target.value }).run()}
            placeholder="Describe this image (alt text)"
            className={cn(
              "min-w-0 flex-1 rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s.alt.trim() ? "border-border" : "border-accent",
            )}
          />
          <ToolbarButton label="Remove image" onClick={() => chain().deleteSelection().run()}>
            <IconTrash />
          </ToolbarButton>
        </div>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        pluginKey="generateBubble"
        options={{ placement: "top-start", offset: 8 }}
        shouldShow={({ editor: e, state }) => e.isEditable && state.selection.empty && generateCalloutAt(e) !== null}
      >
        <div className={cn(panel, "flex items-center gap-1")}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => s.generatePos !== null && onGenerate(s.generatePos)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <IconWand />
            Generate this image
          </button>
          <span className="px-1.5 text-xs text-muted-foreground">Describe it in detail first</span>
        </div>
      </BubbleMenu>
    </>
  );
}

/** Position of the "generate" callout holding the cursor, if any. */
export function generateCalloutAt(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "callout") return node.attrs.variant === "generate" ? $from.before(d) : null;
  }
  return null;
}
