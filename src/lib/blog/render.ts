import type { JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html/server";
import {
  assignHeadingIds,
  countWords,
  internalPathOf,
  isPlaceholder,
  readingMinutes,
  stripFaqBlocks,
  textOf,
  walk,
} from "@/lib/blog/content";
import { getBlogExtensions } from "@/lib/blog/editor/extensions";
import { siteUrl as getSiteUrl } from "@/lib/blog/site-url";
import type { BlogTocItem } from "@/lib/blog/types";

/** Server-side only: turns the editor document into the HTML + metadata stored for publishing. */

export type RenderedContent = {
  html: string;
  toc: BlogTocItem[];
  wordCount: number;
  readingMinutes: number;
  plainText: string;
};

const SAFE_HREF = /^(https?:|mailto:|#|\/(?!\/))/i;
/** rel values an author (or the writer agent) may set on a link; anything else is dropped. */
const AUTHOR_REL = new Set(["nofollow", "sponsored", "ugc"]);

/**
 * Per-post handling for off-site links, e.g. a launch post marks the product's
 * links sponsored and tags them for the maker's analytics. Returns extra rel
 * values and, optionally, a rewritten href.
 */
export type LinkPolicy = (url: URL) => { rel?: string[]; href?: string } | null;

/**
 * Normalizes link marks: drops unsafe hrefs, and opens off-site links in a new
 * tab with `noopener noreferrer`. Editorial links stay followed unless the
 * author marked them nofollow/sponsored/ugc or the post's link policy does.
 */
function normalizeLinks(doc: JSONContent, policy?: LinkPolicy): JSONContent {
  const copy = structuredClone(doc);
  const siteHost = new URL(getSiteUrl()).hostname;
  walk(copy, (n) => {
    if (n.type !== "text" || !n.marks) return;
    n.marks = n.marks.flatMap((m) => {
      if (m.type !== "link") return [m];
      let href = String(m.attrs?.href ?? "").trim();
      if (!href || !SAFE_HREF.test(href)) return [];
      const internal = internalPathOf(href, siteHost) !== null || href.startsWith("#");
      const external = /^https?:/i.test(href) && !internal;
      const rel = new Set<string>();
      if (external) {
        for (const r of String(m.attrs?.rel ?? "").split(/\s+/)) if (AUTHOR_REL.has(r)) rel.add(r);
        const extra = policy?.(new URL(href));
        for (const r of extra?.rel ?? []) rel.add(r);
        if (extra?.href) href = extra.href;
        rel.add("noopener");
        rel.add("noreferrer");
      }
      return [
        {
          ...m,
          attrs: {
            ...m.attrs,
            href,
            target: external ? "_blank" : null,
            rel: external ? [...rel].join(" ") : null,
          },
        },
      ];
    });
  });
  return copy;
}

const SAFE_SRC = /^(https?:\/\/|\/(?!\/))/i;

/** Removes images whose source is not http(s) or a site path (no data:, javascript:, protocol-relative). */
function dropUnsafeImages(node: JSONContent): JSONContent {
  if (!node.content) return node;
  return {
    ...node,
    content: node.content
      .filter((c) => c.type !== "image" || SAFE_SRC.test(String(c.attrs?.src ?? "")))
      .map(dropUnsafeImages),
  };
}

const hasVisibleContent = (node: JSONContent): boolean =>
  node.type === "image" || Boolean(node.text?.trim()) || (node.content ?? []).some(hasVisibleContent);

/**
 * Removes tables with no text or images. They are never intentional on a published page, and an
 * older streaming bug in the AI writer left runs of them at the end of articles.
 */
function dropEmptyTables(node: JSONContent): JSONContent {
  if (!node.content) return node;
  return {
    ...node,
    content: node.content.filter((c) => c.type !== "table" || hasVisibleContent(c)).map(dropEmptyTables),
  };
}

/**
 * Image placeholders ("add a screenshot", "generate an image") are notes for the
 * editor, never content. Publishing is blocked while any remain; this is the
 * backstop so one can never reach a reader.
 */
function dropPlaceholders(node: JSONContent): JSONContent {
  if (!node.content) return node;
  return {
    ...node,
    content: node.content.filter((c) => !isPlaceholder(c)).map(dropPlaceholders),
  };
}

export { isPlaceholder };

const FAQ_HEADING = /\b(faqs?|frequently asked|common questions)\b/i;
const isEmptyParagraph = (n: JSONContent) => n.type === "paragraph" && !hasVisibleContent(n);

/**
 * Removes a heading like "Frequently asked questions" sitting directly above an FAQ block.
 * <ArticleFaq> renders its own heading (and the TOC its own entry), so keeping the writer's one
 * showed the title twice. Only top-level headings immediately before the block are touched.
 */
function dropFaqHeadings(doc: JSONContent): JSONContent {
  const blocks = doc.content;
  if (!blocks?.length) return doc;
  const drop = new Set<number>();
  blocks.forEach((b, i) => {
    if (b.type !== "faq") return;
    let j = i - 1;
    while (j >= 0 && isEmptyParagraph(blocks[j]!)) j--;
    const h = blocks[j];
    if (h?.type === "heading" && FAQ_HEADING.test(textOf(h))) drop.add(j);
  });
  return drop.size ? { ...doc, content: blocks.filter((_, i) => !drop.has(i)) } : doc;
}

export function renderPostContent(doc: JSONContent, opts: { linkPolicy?: LinkPolicy } = {}): RenderedContent {
  const { doc: withIds, toc } = assignHeadingIds(
    normalizeLinks(dropUnsafeImages(dropEmptyTables(dropPlaceholders(dropFaqHeadings(doc)))), opts.linkPolicy),
  );
  // FAQ blocks are extracted (see extractFaq) and rendered separately by <ArticleFaq>, so they are
  // dropped here to avoid showing the same questions twice.
  const bodyDoc = stripFaqBlocks(withIds);
  const html = bodyDoc.content?.length ? generateHTML(bodyDoc, getBlogExtensions()) : "";
  const plainText = textOf(withIds);
  const words = countWords(plainText);
  return { html, toc, wordCount: words, readingMinutes: readingMinutes(words), plainText };
}
