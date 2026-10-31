"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import {
  IconBullets,
  IconCamera,
  IconCode,
  IconImage,
  IconLink,
  IconMinus,
  IconNumbers,
  IconQuote,
  IconRedo,
  IconTable,
  IconUndo,
  IconWand,
} from "@/components/blog-admin/icons";
import { cn } from "@/lib/utils";

type BtnProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  shortcut?: string;
};

export function ToolbarButton({ label, active, disabled, onClick, children, shortcut }: BtnProps) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection: never let the button steal focus from the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm font-semibold transition-colors disabled:opacity-40",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden />;

/** Pinned formatting bar. The selection (bubble) menu covers inline styling in context. */
export function EditorToolbar({
  editor,
  onImage,
  onLink,
}: {
  editor: Editor;
  onImage: () => void;
  onLink: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      p: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      callout: e.isActive("callout"),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-28 z-20 lg:top-14 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/95 px-2 py-1.5 backdrop-blur"
    >
      <ToolbarButton label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <IconUndo />
      </ToolbarButton>
      <ToolbarButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <IconRedo />
      </ToolbarButton>
      <Divider />
      <ToolbarButton label="Paragraph" active={s.p} onClick={() => chain().setParagraph().run()}>
        P
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <ToolbarButton label="Heading 4" active={s.h4} onClick={() => chain().toggleHeading({ level: 4 }).run()}>
        H4
      </ToolbarButton>
      <Divider />
      <ToolbarButton label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        shortcut="Ctrl+U"
        active={s.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton label="Link" shortcut="Ctrl+K" active={s.link} onClick={onLink}>
        <IconLink />
      </ToolbarButton>
      <Divider />
      <ToolbarButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <IconBullets />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <IconNumbers />
      </ToolbarButton>
      <ToolbarButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <IconQuote />
      </ToolbarButton>
      <ToolbarButton label="Tip callout" active={s.callout} onClick={() => chain().toggleCallout("tip").run()}>
        <span className="text-xs">Tip</span>
      </ToolbarButton>
      <Divider />
      <ToolbarButton label="Upload image" onClick={onImage}>
        <IconImage />
      </ToolbarButton>
      <ToolbarButton label="Screenshot needed (add by hand)" onClick={() => chain().toggleCallout("image").run()}>
        <IconCamera />
      </ToolbarButton>
      <ToolbarButton
        label="Image to generate (chart, diagram, infographic)"
        onClick={() => chain().toggleCallout("generate").run()}
      >
        <IconWand />
      </ToolbarButton>
      <ToolbarButton
        label="Table"
        active={s.table}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <IconTable />
      </ToolbarButton>
      <ToolbarButton label="Code block" active={s.code} onClick={() => chain().toggleCodeBlock().run()}>
        <IconCode />
      </ToolbarButton>
      <ToolbarButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
        <IconMinus />
      </ToolbarButton>
      {s.table ? (
        <>
          <Divider />
          <ToolbarButton label="Add row below" onClick={() => chain().addRowAfter().run()}>
            <span className="text-xs">+Row</span>
          </ToolbarButton>
          <ToolbarButton label="Add column right" onClick={() => chain().addColumnAfter().run()}>
            <span className="text-xs">+Col</span>
          </ToolbarButton>
          <ToolbarButton label="Delete row" onClick={() => chain().deleteRow().run()}>
            <span className="text-xs">−Row</span>
          </ToolbarButton>
          <ToolbarButton label="Delete column" onClick={() => chain().deleteColumn().run()}>
            <span className="text-xs">−Col</span>
          </ToolbarButton>
          <ToolbarButton label="Delete table" onClick={() => chain().deleteTable().run()}>
            <span className="text-xs text-danger">Delete</span>
          </ToolbarButton>
        </>
      ) : null}
    </div>
  );
}
