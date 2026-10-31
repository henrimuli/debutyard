import "server-only";
import type { JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/html/server";
import { getBlogExtensions } from "./editor/extensions";
import { renderMarkdown } from "./markdown";
import { EMPTY_DOC } from "./types";

/**
 * Markdown to an editor document. Recaps and launch outlines are built as
 * Markdown (maker text escaped), and posts from before the rich editor are
 * stored as Markdown; both go through the same sanitizing renderer first.
 */
export function markdownToDoc(markdown: string): JSONContent {
  if (!markdown.trim()) return EMPTY_DOC;
  return htmlToDoc(renderMarkdown(markdown));
}

/** HTML to an editor document. Anything outside the blog schema is dropped by the parser. */
export function htmlToDoc(html: string): JSONContent {
  if (!html.trim()) return EMPTY_DOC;
  return generateJSON(html, getBlogExtensions()) as JSONContent;
}
