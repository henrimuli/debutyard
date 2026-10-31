"use client";

import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorBubble, type AskAi } from "@/components/blog-admin/editor/editor-bubble";
import { EditorToolbar } from "@/components/blog-admin/editor/editor-toolbar";
import {
  SlashCommand,
  SlashMenu,
  buildSlashItems,
  createSlashStore,
} from "@/components/blog-admin/editor/slash-command";
import { getBlogExtensions } from "@/lib/blog/editor/extensions";
import { blogApi } from "@/lib/blog/client";
import type { CorpusPost } from "@/lib/blog/seo/analyze";

/** Wait this long after the last keystroke before serializing the document for autosave. */
const CONTENT_SYNC_MS = 400;

/**
 * Comparison key for "did the author actually change anything?". TipTap appends an empty trailing
 * paragraph on load when a document ends in a table or callout; that is housekeeping, not an edit,
 * and must not mark a live article as modified just because someone opened it.
 */
function contentKey(doc: JSONContent): string {
  const blocks = [...(doc.content ?? [])];
  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1]!;
    if (last.type === "paragraph" && !last.content?.length) blocks.pop();
    else break;
  }
  return JSON.stringify(blocks);
}

type Props = {
  initialContent: JSONContent;
  /** Rendered above the body inside the scrolling column (title, excerpt). */
  header: React.ReactNode;
  posts: CorpusPost[];
  onChange: (doc: JSONContent) => void;
  onAskAi: AskAi;
  onGenerate: (pos: number) => void;
  onEditor: (editor: Editor | null) => void;
  onNotice: (message: string, kind?: "info" | "error") => void;
};

/**
 * The writing surface: pinned toolbar, selection (bubble) menu, `/` block menu, image
 * upload by button / paste / drop, and the article body itself styled exactly like the public page.
 */
export function EditorCanvas({
  initialContent,
  header,
  posts,
  onChange,
  onAskAi,
  onGenerate,
  onEditor,
  onNotice,
}: Props) {
  const slashStore = useMemo(() => createSlashStore(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkNonce, setLinkNonce] = useState(0);
  const [uploading, setUploading] = useState(0);
  const syncTimer = useRef<number | null>(null);
  const lastKey = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    onChangeRef.current = onChange;
    noticeRef.current = onNotice;
  });
  const uploadRef = useRef<(files: File[], pos?: number) => void>(() => {});

  const openImagePicker = useCallback(() => fileRef.current?.click(), []);
  // The picker reads fileRef only when the menu item is clicked, never during render.
  // eslint-disable-next-line react-hooks/refs
  const slashItems = useMemo(() => buildSlashItems(openImagePicker), [openImagePicker]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...getBlogExtensions(),
      CharacterCount,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? "Heading" : "Write your article. Type “/” to insert a block.",
      }),
      SlashCommand.configure({ store: slashStore, items: slashItems }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "prose-dy blog-prose blog-editor-body max-w-none text-[17px] focus:outline-none",
        "aria-label": "Article body",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        uploadRef.current(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        uploadRef.current(files, at);
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      lastKey.current = contentKey(e.getJSON());
    },
    onUpdate: ({ editor: e }) => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        const json = e.getJSON();
        const key = contentKey(json);
        if (key === lastKey.current) return;
        lastKey.current = key;
        onChangeRef.current(json);
      }, CONTENT_SYNC_MS);
    },
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  // Never lose the last keystrokes if the component unmounts inside the debounce window.
  useEffect(
    () => () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    },
    [],
  );

  // Editor callbacks are created once, so they read the latest upload handler through a ref.
  useEffect(() => {
    uploadRef.current = async (files, pos) => {
      if (!editor) return;
      for (const file of files) {
        setUploading((n) => n + 1);
        try {
          const img = await blogApi.upload(file);
          const node = { type: "image", attrs: { src: img.url, alt: "", width: img.width, height: img.height } };
          if (pos !== undefined) editor.chain().focus().insertContentAt(pos, node).run();
          else editor.chain().focus().insertContent(node).run();
          noticeRef.current("Image added. Describe it in the alt text box so it is accessible and searchable.", "info");
        } catch (e) {
          noticeRef.current(e instanceof Error ? e.message : "Upload failed.", "error");
        } finally {
          setUploading((n) => n - 1);
        }
      }
    };
  }, [editor]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {editor ? (
        <EditorToolbar
          editor={editor}
          onImage={openImagePicker}
          onLink={() => {
            if (editor.state.selection.empty) noticeRef.current("Select the text you want to link first.", "info");
            else setLinkNonce((n) => n + 1);
          }}
        />
      ) : null}

      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-4 pb-40 pt-8 sm:px-8 sm:pt-10">
          {header}
          <EditorContent editor={editor} className="blog-editor" />
          {editor ? (
            <p className="mt-10 text-xs text-muted-foreground" aria-live="polite">
              {editor.storage.characterCount.words()} words
              {uploading > 0 ? ` · uploading ${uploading} image${uploading > 1 ? "s" : ""}…` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {editor ? (
        <EditorBubble editor={editor} posts={posts} onAskAi={onAskAi} onGenerate={onGenerate} linkNonce={linkNonce} />
      ) : null}
      <SlashMenu store={slashStore} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) uploadRef.current(files);
        }}
      />
    </div>
  );
}
