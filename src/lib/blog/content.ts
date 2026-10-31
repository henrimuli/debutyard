import type { JSONContent } from "@tiptap/core";
import { slugify } from "@/lib/blog/slug";
import type { BlogFaqItem, BlogTocItem } from "@/lib/blog/types";

/**
 * Pure helpers over a TipTap document (JSON). No DOM and no editor instance, so they run on the
 * server (rendering, TOC), in the browser (live SEO analysis) and in unit tests alike.
 */

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "codeBlock",
  "tableCell",
  "tableHeader",
  "callout",
  "faqItem",
  "faqQuestion",
  "faqAnswer",
]);

export function walk(
  node: JSONContent,
  visit: (node: JSONContent, parents: JSONContent[]) => void,
  parents: JSONContent[] = [],
): void {
  visit(node, parents);
  if (node.content) {
    const next = [...parents, node];
    for (const child of node.content) walk(child, visit, next);
  }
}

/** Plain text of a node; block boundaries become spaces so words never fuse together. */
export function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  let out = "";
  const rec = (n: JSONContent) => {
    if (n.type === "text") {
      out += n.text ?? "";
      return;
    }
    if (n.type === "hardBreak") {
      out += " ";
      return;
    }
    for (const c of n.content ?? []) rec(c);
    if (n.type && BLOCK_TYPES.has(n.type)) out += " ";
  };
  rec(node);
  return out.replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 220));
}

export function isBlankDoc(doc: JSONContent | undefined | null): boolean {
  if (!doc || !doc.content || doc.content.length === 0) return true;
  return textOf(doc).length === 0 && !doc.content.some((n) => n.type === "image" || n.type === "table");
}

export type HeadingInfo = { level: number; text: string; id: string | null };

export function extractHeadings(doc: JSONContent): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  walk(doc, (n) => {
    if (n.type === "heading") {
      out.push({
        level: Number(n.attrs?.level ?? 2),
        text: textOf(n),
        id: (n.attrs?.id as string | null | undefined) ?? null,
      });
    }
  });
  return out;
}

export type LinkInfo = { href: string; text: string; inHeading: boolean };

/** Every linked run of text. Adjacent text nodes sharing one link mark are merged. */
export function extractLinks(doc: JSONContent): LinkInfo[] {
  const out: LinkInfo[] = [];
  walk(doc, (n, parents) => {
    if (n.type !== "text" || !n.marks) return;
    const mark = n.marks.find((m) => m.type === "link");
    const href = mark?.attrs?.href as string | undefined;
    if (!href) return;
    const inHeading = parents.some((p) => p.type === "heading");
    const prev = out[out.length - 1];
    const parent = parents[parents.length - 1];
    const idx = parent?.content?.indexOf(n) ?? -1;
    const prevSibling = idx > 0 ? parent?.content?.[idx - 1] : undefined;
    const prevMark = prevSibling?.marks?.find((m) => m.type === "link");
    if (prev && prevSibling && prevMark?.attrs?.href === href && prev.href === href) {
      prev.text += n.text ?? "";
    } else {
      out.push({ href, text: n.text ?? "", inHeading });
    }
  });
  return out;
}

export type ImageInfo = { src: string; alt: string };

export function extractImages(doc: JSONContent): ImageInfo[] {
  const out: ImageInfo[] = [];
  walk(doc, (n) => {
    if (n.type === "image" && n.attrs?.src) {
      out.push({ src: String(n.attrs.src), alt: String(n.attrs.alt ?? "") });
    }
  });
  return out;
}

export type BlockInfo = {
  type: "paragraph" | "heading" | "list" | "blockquote" | "table" | "code" | "callout" | "image" | "other";
  level?: number;
  text: string;
};

/** Top-level blocks, flattened to type + text; what the SEO analyzer reasons over. */
export function extractBlocks(doc: JSONContent): BlockInfo[] {
  const out: BlockInfo[] = [];
  for (const n of doc.content ?? []) {
    switch (n.type) {
      case "paragraph":
        out.push({ type: "paragraph", text: textOf(n) });
        break;
      case "heading":
        out.push({ type: "heading", level: Number(n.attrs?.level ?? 2), text: textOf(n) });
        break;
      case "bulletList":
      case "orderedList":
        out.push({ type: "list", text: textOf(n) });
        break;
      case "blockquote":
        out.push({ type: "blockquote", text: textOf(n) });
        break;
      case "table":
        out.push({ type: "table", text: textOf(n) });
        break;
      case "codeBlock":
        out.push({ type: "code", text: textOf(n) });
        break;
      case "callout":
        out.push({ type: "callout", text: textOf(n) });
        break;
      case "image":
        out.push({ type: "image", text: String(n.attrs?.alt ?? "") });
        break;
      default:
        out.push({ type: "other", text: textOf(n) });
    }
  }
  return out;
}

/**
 * Returns a deep copy of `doc` whose H2–H4 headings each carry a unique, stable `id`, plus the
 * table of contents (H2 and H3 only). Existing ids are kept when still unique so anchors that
 * readers have bookmarked don't change on every save.
 */
export function assignHeadingIds(doc: JSONContent): { doc: JSONContent; toc: BlogTocItem[] } {
  const copy = structuredClone(doc);
  const used = new Set<string>();
  const toc: BlogTocItem[] = [];

  walk(copy, (n) => {
    if (n.type !== "heading") return;
    const text = textOf(n);
    const base = slugify(text) || "section";
    const existing = typeof n.attrs?.id === "string" ? n.attrs.id : null;
    let id = existing && !used.has(existing) && slugify(existing) === existing ? existing : base;
    let i = 2;
    while (used.has(id)) id = `${base}-${i++}`;
    used.add(id);
    n.attrs = { ...(n.attrs ?? {}), id };
    const level = Number(n.attrs.level ?? 2);
    if ((level === 2 || level === 3) && text) toc.push({ id, text, level });
  });

  return { doc: copy, toc };
}

/** Internal = same-site (relative, or on `siteHost`). Returns the path for internal links. */
export function internalPathOf(href: string, siteHost: string): string | null {
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const u = new URL(href);
    if (u.hostname.replace(/^www\./, "") === siteHost.replace(/^www\./, "")) {
      return `${u.pathname}${u.search}${u.hash}` || "/";
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** True when the document has a callout of the given variant (e.g. a "cta" call-to-action box). */
export function hasCallout(doc: JSONContent, variant: string): boolean {
  let found = false;
  walk(doc, (n) => {
    if (n.type === "callout" && n.attrs?.variant === variant) found = true;
  });
  return found;
}

/**
 * Reads every FAQ block out of the document (see the `faq`/`faqItem` nodes in
 * lib/blog/editor/extensions.ts). This is the only source of `BlogFields.faq`: the writer
 * (human or AI) authors FAQs as a block in the body, and this is derived from it on every save.
 */
export function extractFaq(doc: JSONContent): BlogFaqItem[] {
  const out: BlogFaqItem[] = [];
  walk(doc, (n) => {
    if (n.type !== "faqItem") return;
    const q = n.content?.find((c) => c.type === "faqQuestion");
    const a = n.content?.find((c) => c.type === "faqAnswer");
    const qt = textOf(q).trim();
    const at = textOf(a).trim();
    if (qt && at) out.push({ q: qt, a: at });
  });
  return out.slice(0, 20);
}

/** Drops FAQ blocks from a doc before rendering body HTML; they render separately (see ArticleFaq). */
export function stripFaqBlocks(node: JSONContent): JSONContent {
  if (!node.content) return node;
  return { ...node, content: node.content.filter((c) => c.type !== "faq").map(stripFaqBlocks) };
}

/** Blog slug behind an internal link (`/blog/<slug>`), if it points at an article. */
export function blogSlugFromPath(path: string): string | null {
  const m = path.match(/^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:[?#].*)?$/);
  if (!m) return null;
  const slug = m[1]!;
  return slug === "category" || slug === "page" ? null : slug;
}

/** Board listings this document links to (`/p/<slug>`), in order of first mention. */
export function outboundProductSlugs(doc: JSONContent, siteHost: string): string[] {
  const slugs = new Set<string>();
  for (const l of extractLinks(doc)) {
    const path = internalPathOf(l.href, siteHost);
    const m = path?.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:[?#].*)?$/);
    if (m) slugs.add(m[1]!);
  }
  return [...slugs];
}

/** "Screenshot needed" and "image to generate" callouts: notes for the team, never published. */
export const isPlaceholder = (n: JSONContent) =>
  n.type === "callout" && (n.attrs?.variant === "image" || n.attrs?.variant === "generate");

/** Publishing waits until every image placeholder is filled in or removed. */
export function placeholderBlockers(doc: JSONContent): string[] {
  let screenshots = 0;
  let generated = 0;
  walk(doc, (n) => {
    if (!isPlaceholder(n)) return;
    if (n.attrs?.variant === "generate") generated++;
    else screenshots++;
  });
  const out: string[] = [];
  if (screenshots) out.push(`Add the ${screenshots} screenshot${screenshots === 1 ? "" : "s"} marked in the article.`);
  if (generated) out.push(`Generate or remove the ${generated} image placeholder${generated === 1 ? "" : "s"}.`);
  return out;
}
