import type { JSONContent } from "@tiptap/core";
import { textOf } from "@/lib/blog/content";
import { SITE_PAGES } from "@/lib/blog/site-pages";
import type { CorpusPost } from "@/lib/blog/seo/analyze";
import type { BlogFields, StaffCategory } from "@/lib/blog/types";
import type { Source } from "@/lib/ai/gemini";

/** Builds the DATA block the model sees: the article, the site's link targets, the taxonomy, research. */

const MAX_BODY_CHARS = 16_000;

/** Article body as light markdown-ish text: keeps headings visible so the model sees structure. */
export function docToPrompt(doc: JSONContent): string {
  const lines: string[] = [];
  for (const n of doc.content ?? []) {
    switch (n.type) {
      case "heading":
        lines.push(`${"#".repeat(Number(n.attrs?.level ?? 2))} ${textOf(n)}`);
        break;
      case "bulletList":
      case "orderedList":
        for (const li of n.content ?? []) lines.push(`- ${textOf(li)}`);
        break;
      case "table":
        lines.push(`[table] ${textOf(n)}`);
        break;
      case "image":
        lines.push(`[image alt="${String(n.attrs?.alt ?? "")}"]`);
        break;
      case "callout":
        lines.push(`[${String(n.attrs?.variant ?? "info")} callout] ${textOf(n)}`);
        break;
      case "faq":
        for (const item of n.content ?? []) {
          const q = item.content?.find((c) => c.type === "faqQuestion");
          const a = item.content?.find((c) => c.type === "faqAnswer");
          lines.push(`[faq] Q: ${textOf(q)} A: ${textOf(a)}`);
        }
        break;
      default: {
        const t = textOf(n);
        if (t) lines.push(t);
      }
    }
  }
  const out = lines.join("\n\n");
  return out.length > MAX_BODY_CHARS ? `${out.slice(0, MAX_BODY_CHARS)}\n\n[…article continues, truncated…]` : out;
}

export type AiSite = {
  corpus: CorpusPost[];
  categories: StaffCategory[];
  tags: string[];
  /** Board categories (/category/<slug>) with live products. */
  boardCategories: { slug: string; name: string }[];
};

export type AllowedTarget = { href: string; title: string; note: string };

export function allowedTargets(
  site: AiSite,
  selfSlug: string,
  products: { slug: string; name: string }[] = [],
): AllowedTarget[] {
  const posts = site.corpus
    .filter((c) => c.status === "published" && c.slug !== selfSlug)
    .slice(0, 80)
    .map((c) => ({
      href: `/blog/${c.slug}`,
      title: c.title,
      note: c.focusKeyword ? `keyword: ${c.focusKeyword}` : "",
    }));
  const pages = SITE_PAGES.map((p) => ({ href: p.href, title: p.title, note: "DebutYard page" }));
  const listings = products.map((p) => ({ href: `/p/${p.slug}`, title: p.name, note: "product listing" }));
  const cats = site.boardCategories.map((c) => ({
    href: `/category/${c.slug}`,
    title: c.name,
    note: "product category",
  }));
  return [...posts, ...pages, ...listings, ...cats];
}

export type ContextExtras = {
  kind?: string;
  products?: { slug: string; name: string }[];
  productData?: string;
  productPages?: string;
  research?: { notes: string; sources: Source[] };
  keywordData?: string;
  makerNotes?: string;
  today?: Date;
};

export function buildContext(input: { fields: BlogFields; slug: string; site: AiSite } & ContextExtras): string {
  const { fields: f, slug, site } = input;
  const category = site.categories.find((c) => c.id === f.category_id)?.name ?? "";
  const targets = allowedTargets(site, slug, input.products);
  const today = (input.today ?? new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const parts = [
    `Today's date: ${today}`,
    input.kind ? `Post type: ${input.kind}` : "",
    "",
    "<ARTICLE>",
    `Title (H1): ${f.title || "(none yet)"}`,
    `SEO title: ${f.seo_title || "(none)"}`,
    `Meta description: ${f.seo_description || "(none)"}`,
    `Excerpt: ${f.excerpt || "(none)"}`,
    `Focus keyword: ${f.focus_keyword || "(none)"}`,
    `Secondary keywords: ${f.secondary_keywords.join(", ") || "(none)"}`,
    `Category: ${category || "(none)"}`,
    `Tags: ${f.tags.join(", ") || "(none)"}`,
    `Slug: ${slug}`,
    "Body:",
    docToPrompt(f.content_json) || "(empty)",
    "</ARTICLE>",
    "",
    "<ALLOWED_LINK_TARGETS>",
    ...targets.map((t) => `${t.href} | ${t.title}${t.note ? ` | ${t.note}` : ""}`),
    "</ALLOWED_LINK_TARGETS>",
    "",
    "<TAXONOMY>",
    `Blog categories: ${site.categories.map((c) => c.name).join(", ") || "(none)"}`,
    `Existing tags: ${site.tags.slice(0, 80).join(", ") || "(none)"}`,
    "</TAXONOMY>",
  ];
  if (input.productData) parts.push("", "<PRODUCT_DATA>", input.productData, "</PRODUCT_DATA>");
  if (input.productPages) parts.push("", "<PRODUCT_PAGES>", input.productPages, "</PRODUCT_PAGES>");
  if (input.research && (input.research.notes || input.research.sources.length)) {
    parts.push(
      "",
      "<RESEARCH>",
      input.research.notes,
      "Sources you may cite (link the exact URL):",
      ...input.research.sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`),
      "</RESEARCH>",
    );
  }
  if (input.keywordData) parts.push("", "<KEYWORD_DATA>", input.keywordData, "</KEYWORD_DATA>");
  if (input.makerNotes) parts.push("", "<MAKER_NOTES>", input.makerNotes, "</MAKER_NOTES>");
  return parts.filter((p, i, a) => p !== "" || a[i - 1] !== "").join("\n");
}
