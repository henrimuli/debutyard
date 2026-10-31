"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  IconAlert,
  IconArrowRight,
  IconBulb,
  IconBullets,
  IconCamera,
  IconCode,
  IconImage,
  IconInfo,
  IconMinus,
  IconNumbers,
  IconQuestion,
  IconQuote,
  IconTable,
  IconWand,
} from "@/components/blog-admin/icons";
import type { CalloutVariant } from "@/lib/blog/editor/extensions";
import { cn } from "@/lib/utils";

export type SlashItem = {
  title: string;
  description: string;
  keywords: string[];
  Icon: React.ComponentType<{ className?: string }>;
  run: (editor: Editor, range: Range) => void;
};

const H = ({ label }: { label: string }) => (
  <span className="text-sm font-bold" aria-hidden>
    {label}
  </span>
);

const callout = (variant: CalloutVariant) => (editor: Editor, range: Range) =>
  editor.chain().focus().deleteRange(range).toggleCallout(variant).run();

export function buildSlashItems(onImage: () => void): SlashItem[] {
  return [
    {
      title: "Heading 2",
      description: "A main section heading",
      keywords: ["h2", "heading", "section", "title"],
      Icon: () => <H label="H2" />,
      run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run(),
    },
    {
      title: "Heading 3",
      description: "A subsection heading",
      keywords: ["h3", "heading", "subsection"],
      Icon: () => <H label="H3" />,
      run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run(),
    },
    {
      title: "Bulleted list",
      description: "A simple list of points",
      keywords: ["ul", "bullets", "list"],
      Icon: IconBullets,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "Steps in order",
      keywords: ["ol", "numbers", "steps", "list"],
      Icon: IconNumbers,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: "Quote",
      description: "Pull out a quotation",
      keywords: ["blockquote", "quote", "cite"],
      Icon: IconQuote,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
    },
    {
      title: "Callout: tip",
      description: "Highlight a helpful tip",
      keywords: ["callout", "tip", "note", "hint"],
      Icon: IconBulb,
      run: callout("tip"),
    },
    {
      title: "Callout: info",
      description: "Add extra context",
      keywords: ["callout", "info", "note"],
      Icon: IconInfo,
      run: callout("info"),
    },
    {
      title: "Callout: warning",
      description: "Flag a common mistake",
      keywords: ["callout", "warning", "caution"],
      Icon: IconAlert,
      run: callout("warning"),
    },
    {
      title: "Call to action",
      description: "A highlighted box to drive sign-ups",
      keywords: ["cta", "callout", "button", "signup"],
      Icon: IconArrowRight,
      run: callout("cta"),
    },
    {
      title: "Screenshot needed",
      description: "A real screenshot someone adds by hand",
      keywords: ["image", "screenshot", "photo", "placeholder", "suggest"],
      Icon: IconCamera,
      run: callout("image"),
    },
    {
      title: "Image to generate",
      description: "Chart, diagram or infographic, drawn from a description",
      keywords: ["generate", "chart", "graph", "diagram", "infographic", "image", "banana"],
      Icon: IconWand,
      run: callout("generate"),
    },
    {
      title: "FAQ question",
      description: "A question and answer, shown as an accordion",
      keywords: ["faq", "question", "accordion", "details"],
      Icon: IconQuestion,
      run: (e, r) =>
        e
          .chain()
          .focus()
          .deleteRange(r)
          .insertContent({
            type: "faq",
            content: [{ type: "faqItem", content: [{ type: "faqQuestion" }, { type: "faqAnswer" }] }],
          })
          .run(),
    },
    {
      title: "Table",
      description: "A 3 × 3 comparison table",
      keywords: ["table", "grid", "compare"],
      Icon: IconTable,
      run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: "Image",
      description: "Upload an image",
      keywords: ["image", "photo", "picture", "upload"],
      Icon: IconImage,
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        onImage();
      },
    },
    {
      title: "Divider",
      description: "A horizontal rule",
      keywords: ["hr", "divider", "line", "rule"],
      Icon: IconMinus,
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
    {
      title: "Code block",
      description: "Monospaced code",
      keywords: ["code", "snippet", "pre"],
      Icon: IconCode,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
    },
  ];
}

// --- tiny external store so the ProseMirror plugin can drive React state --------------------

type SlashState = {
  open: boolean;
  items: SlashItem[];
  index: number;
  rect: DOMRect | null;
  select: ((item: SlashItem) => void) | null;
};

const CLOSED: SlashState = { open: false, items: [], index: 0, rect: null, select: null };

export function createSlashStore() {
  let state: SlashState = CLOSED;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(partial: Partial<SlashState>) {
      state = { ...state, ...partial };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
export type SlashStore = ReturnType<typeof createSlashStore>;

export const SlashCommand = Extension.create<{ store: SlashStore | null; items: SlashItem[] }>({
  name: "slashCommand",

  addOptions() {
    return { store: null, items: [] };
  },

  addProseMirrorPlugins() {
    const { store, items } = this.options;
    if (!store) return [];
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state }) => !state.selection.$from.parent.type.name.includes("codeBlock"),
        items: ({ query }) => {
          const q = query.trim().toLowerCase();
          if (!q) return items;
          return items.filter((i) => i.title.toLowerCase().includes(q) || i.keywords.some((k) => k.startsWith(q)));
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (p) =>
            store.set({
              open: true,
              items: p.items,
              index: 0,
              rect: p.clientRect?.() ?? null,
              select: (item) => p.command(item),
            }),
          onUpdate: (p) =>
            store.set({
              items: p.items,
              index: 0,
              rect: p.clientRect?.() ?? null,
              select: (item) => p.command(item),
            }),
          onKeyDown: ({ event }) => {
            const s = store.get();
            if (!s.open || s.items.length === 0) return false;
            if (event.key === "ArrowDown") {
              store.set({ index: (s.index + 1) % s.items.length });
              return true;
            }
            if (event.key === "ArrowUp") {
              store.set({ index: (s.index - 1 + s.items.length) % s.items.length });
              return true;
            }
            if (event.key === "Enter") {
              const item = s.items[s.index];
              if (item) s.select?.(item);
              return true;
            }
            if (event.key === "Escape") {
              store.set(CLOSED);
              return true;
            }
            return false;
          },
          onExit: () => store.set(CLOSED),
        }),
      }),
    ];
  },
});

/** Below the caret, or above it when there is no room underneath. */
function placeMenu(rect: DOMRect, count: number) {
  const menuH = Math.min(340, 56 * Math.max(1, count) + 12);
  const below = rect.bottom + 8;
  const flip = below + menuH > window.innerHeight - 8;
  return { top: flip ? Math.max(8, rect.top - menuH - 8) : below, left: Math.min(rect.left, window.innerWidth - 300) };
}

export function SlashMenu({ store }: { store: SlashStore }) {
  const s = useSyncExternalStore(store.subscribe, store.get, store.get);
  const listRef = useRef<HTMLDivElement>(null);
  // The store only opens in the browser (on typing "/"), so window is safe to read here.
  const pos = s.open && s.rect ? placeMenu(s.rect, s.items.length) : null;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [s.index]);

  if (!pos || s.items.length === 0) return null;

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert block"
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[70] max-h-[340px] w-72 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-xl"
    >
      {s.items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={i === s.index}
          // keep focus in the editor so the suggestion range stays valid
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => s.select?.(item)}
          onMouseEnter={() => store.set({ index: i })}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left",
            i === s.index ? "bg-muted" : "",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground [&>svg]:size-5">
            <item.Icon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{item.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
