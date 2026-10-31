import type { JSONContent } from "@tiptap/core";
import { blogSlugFromPath, extractLinks, internalPathOf } from "@/lib/blog/content";
import { SITE_PAGES } from "@/lib/blog/site-pages";
import type { CorpusPost } from "@/lib/blog/seo/analyze";
import { tokenize, wordVariants } from "@/lib/blog/seo/text";

/**
 * Internal-link discovery. Deterministic on purpose: every suggestion is an anchor phrase that
 * really exists, verbatim, in the text, pointing at a URL that really exists. The AI layer may
 * re-rank these candidates, but it never gets to invent an anchor or a destination.
 */

export type LinkTarget = {
  kind: "post" | "page";
  href: string;
  title: string;
  /** Phrases to look for, strongest first. */
  phrases: { text: string; weight: number }[];
  cluster: string;
};

export type LinkSuggestion = {
  id: string;
  kind: LinkTarget["kind"];
  href: string;
  targetTitle: string;
  /** Exact text in the article to turn into the link. */
  anchor: string;
  /** The sentence the anchor sits in. */
  context: string;
  score: number;
  reason: string;
};

export type InboundSuggestion = {
  postId: string;
  postSlug: string;
  postTitle: string;
  status: CorpusPost["status"];
  anchor: string;
  context: string;
};

const MIN_PHRASE_CHARS = 5;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive, word-bounded regex for a phrase. Spaces and hyphens are interchangeable
 * ("short form" matches "short-form"), and each word matches its common inflections
 * ("hook" / "hooks" / "hooked"), so anchors are found the way people actually write them.
 */
export function phraseRegex(phrase: string): RegExp | null {
  const words = phrase
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const parts = words.map((w) => {
    const alts = wordVariants(w)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);
    return `(?:${alts.join("|")})`;
  });
  const edge = String.raw`[\p{L}\p{N}]`;
  return new RegExp(`(?<!${edge})${parts.join(String.raw`[\s-]+`)}(?!${edge})`, "iu");
}

export function buildTargets(corpus: CorpusPost[], selfSlug: string): LinkTarget[] {
  const targets: LinkTarget[] = [];
  for (const c of corpus) {
    if (c.status !== "published" || c.slug === selfSlug) continue;
    const seen = new Set<string>();
    const phrases: LinkTarget["phrases"] = [];
    const push = (text: string, weight: number) => {
      const t = text.trim();
      const key = tokenize(t).join(" ");
      if (t.length < MIN_PHRASE_CHARS || seen.has(key)) return;
      seen.add(key);
      phrases.push({ text: t, weight });
    };
    push(c.focusKeyword, 3);
    for (const s of c.secondaryKeywords) push(s, 2);
    if (phrases.length === 0) push(c.title, 1);
    targets.push({
      kind: "post",
      href: `/blog/${c.slug}`,
      title: c.title,
      phrases,
      cluster: c.cluster,
    });
  }
  for (const p of SITE_PAGES) {
    targets.push({
      kind: "page",
      href: p.href,
      title: p.title,
      phrases: p.keywords.map((k) => ({ text: k, weight: 2 })),
      cluster: "",
    });
  }
  return targets;
}

const LINKABLE_BLOCKS = new Set(["paragraph", "bulletList", "orderedList", "blockquote", "callout"]);

type Segment = { text: string };

/** Unlinked, non-heading, non-code text runs of the article, in order. */
function linkableSegments(doc: JSONContent): Segment[] {
  const out: Segment[] = [];
  const visit = (node: JSONContent, inLinkable: boolean) => {
    if (node.type === "codeBlock" || node.type === "heading") return;
    const linkable = inLinkable || (node.type ? LINKABLE_BLOCKS.has(node.type) : false);
    if (node.type === "text") {
      if (linkable && !node.marks?.some((m) => m.type === "link" || m.type === "code")) {
        out.push({ text: node.text ?? "" });
      }
      return;
    }
    for (const c of node.content ?? []) visit(c, linkable);
  };
  for (const n of doc.content ?? []) visit(n, false);
  return out;
}

/** Sentence around `index` in `text` (used as the human-readable context for a suggestion). */
export function sentenceAround(text: string, index: number, length: number): string {
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
  const endRel = after.search(/[.!?](\s|$)/);
  const s = start === -1 ? 0 : start + 2;
  const e = endRel === -1 ? text.length : index + length + endRel + 1;
  const sentence = text.slice(s, e).trim();
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
}

export function suggestInternalLinks(input: {
  doc: JSONContent;
  targets: LinkTarget[];
  siteHost: string;
  selfCluster?: string;
  wordCount: number;
  max?: number;
}): LinkSuggestion[] {
  const { doc, targets, siteHost, wordCount } = input;
  const max = input.max ?? 8;

  const linked = new Set(
    extractLinks(doc)
      .map((l) => internalPathOf(l.href, siteHost))
      .filter((p): p is string => Boolean(p))
      .map((p) => p.replace(/[?#].*$/, "").replace(/\/$/, "")),
  );

  // Stay within a sane density: about one internal link per 100 words, at least 3 for short posts.
  const budget = Math.max(3, Math.floor(wordCount / 100));
  const room = Math.max(0, budget - linked.size);
  if (room === 0) return [];

  const segments = linkableSegments(doc);
  const found: LinkSuggestion[] = [];
  const usedText = new Set<string>();

  for (const t of targets) {
    if (linked.has(t.href)) continue;
    let best: LinkSuggestion | null = null;
    for (const ph of t.phrases) {
      const re = phraseRegex(ph.text);
      if (!re) continue;
      for (const seg of segments) {
        const m = re.exec(seg.text);
        if (!m) continue;
        const anchor = m[0];
        const key = anchor.toLowerCase();
        if (usedText.has(key)) continue;
        const clusterBonus = input.selfCluster && t.cluster && t.cluster === input.selfCluster ? 1 : 0;
        const score = ph.weight * 2 + Math.min(3, tokenize(ph.text).length) + clusterBonus;
        if (!best || score > best.score) {
          best = {
            id: `${t.href}::${anchor.toLowerCase()}`,
            kind: t.kind,
            href: t.href,
            targetTitle: t.title,
            anchor,
            context: sentenceAround(seg.text, m.index, anchor.length),
            score,
            reason:
              ph.weight >= 3
                ? "Matches this article's focus keyword."
                : ph.weight === 2
                  ? "Matches a keyword this page targets."
                  : "Topically related.",
          };
        }
        break; // first occurrence in the first matching segment is enough for a given phrase
      }
    }
    if (best) {
      usedText.add(best.anchor.toLowerCase());
      found.push(best);
    }
  }

  return found.sort((a, b) => b.score - a.score).slice(0, Math.min(max, room));
}

/**
 * Returns a copy of `doc` with the first unlinked, in-body occurrence of the anchor turned into a
 * link, or `null` when the text is no longer there (the article changed since the suggestion).
 */
export function applySuggestionToDoc(doc: JSONContent, s: Pick<LinkSuggestion, "anchor" | "href">): JSONContent | null {
  const copy = structuredClone(doc);
  const re = phraseRegex(s.anchor);
  if (!re) return null;
  let applied = false;

  const visit = (node: JSONContent, inLinkable: boolean) => {
    if (applied || node.type === "codeBlock" || node.type === "heading") return;
    const linkable = inLinkable || (node.type ? LINKABLE_BLOCKS.has(node.type) : false);
    if (!node.content) return;
    for (let i = 0; i < node.content.length && !applied; i++) {
      const child = node.content[i]!;
      if (child.type === "text") {
        if (!linkable || child.marks?.some((m) => m.type === "link" || m.type === "code")) continue;
        const m = re.exec(child.text ?? "");
        if (!m) continue;
        const text = child.text ?? "";
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        const pieces: JSONContent[] = [];
        if (before) pieces.push({ ...child, text: before });
        pieces.push({
          ...child,
          text: m[0],
          marks: [...(child.marks ?? []), { type: "link", attrs: { href: s.href } }],
        });
        if (after) pieces.push({ ...child, text: after });
        node.content.splice(i, 1, ...pieces);
        applied = true;
      } else {
        visit(child, linkable);
      }
    }
  };
  visit(copy, false);
  return applied ? copy : null;
}

/** Other articles that mention this one's topic but do not link to it yet. */
export function suggestInboundLinks(input: {
  self: { slug: string; title: string; focusKeyword: string; secondaryKeywords: string[] };
  corpus: CorpusPost[];
  max?: number;
}): InboundSuggestion[] {
  const { self, corpus } = input;
  const phrases = [self.focusKeyword, ...self.secondaryKeywords].filter((p) => p.trim().length >= MIN_PHRASE_CHARS);
  if (phrases.length === 0) return [];
  const regexes = phrases.map(phraseRegex).filter((r): r is RegExp => r !== null);

  const out: InboundSuggestion[] = [];
  for (const c of corpus) {
    if (c.slug === self.slug || c.linksToSlugs.includes(self.slug) || !c.text) continue;
    for (const re of regexes) {
      const m = re.exec(c.text);
      if (!m) continue;
      out.push({
        postId: c.id,
        postSlug: c.slug,
        postTitle: c.title,
        status: c.status,
        anchor: m[0],
        context: sentenceAround(c.text, m.index, m[0].length),
      });
      break;
    }
  }
  return out.slice(0, input.max ?? 8);
}

/** Blog slugs this document links to (for the orphan / inbound graph). */
export function outboundBlogSlugs(doc: JSONContent, siteHost: string): string[] {
  const slugs = new Set<string>();
  for (const l of extractLinks(doc)) {
    const path = internalPathOf(l.href, siteHost);
    const slug = path ? blogSlugFromPath(path) : null;
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}
