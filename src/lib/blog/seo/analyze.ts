import {
  blogSlugFromPath,
  extractBlocks,
  extractHeadings,
  extractImages,
  extractFaq,
  extractLinks,
  hasCallout,
  internalPathOf,
} from "@/lib/blog/content";
import {
  countPhrase,
  firstWords,
  fleschReadingEase,
  hasAllWords,
  hasPhrase,
  isGenericAnchor,
  splitSentences,
  tokenize,
} from "@/lib/blog/seo/text";
import type { BlogFields } from "@/lib/blog/types";

/**
 * Deterministic on-page SEO analysis. Everything measurable is measured here in code (lengths,
 * densities, hierarchy, links) so the AI agent never has to guess at numbers; it only writes
 * and reasons about the failures this module reports.
 */

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckGroup = "meta" | "content" | "structure" | "links" | "media" | "technical" | "conversion";

export type SeoCheck = {
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  title: string;
  /** What was found. */
  detail: string;
  /** How to fix it (shown for warn/fail). */
  fix?: string;
  weight: number;
};

/** The slice of every other article the analyzer needs (from the working copies). */
export type CorpusPost = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  focusKeyword: string;
  secondaryKeywords: string[];
  categoryName: string | null;
  cluster: string;
  tags: string[];
  /** Blog slugs this article links to. */
  linksToSlugs: string[];
  /** Plain text of the body (for anchor discovery). Optional; large, so trimmed by callers. */
  text?: string;
};

export type SeoInput = {
  fields: BlogFields;
  slug: string;
  postId?: string;
  siteHost: string;
  /** Other articles. Omit to skip the checks that need site context. */
  corpus?: CorpusPost[];
  /** Full plain text of the body; computed by callers that already have it. */
  plainText?: string;
};

export type SeoStats = {
  words: number;
  h2Count: number;
  internalLinks: number;
  externalLinks: number;
  keywordCount: number;
  keywordDensity: number;
  avgSentenceWords: number;
  readingEase: number;
  images: number;
  faqCount: number;
};

export type SeoReport = {
  /** 0–100. `null` when there is nothing to grade yet. */
  score: number | null;
  checks: SeoCheck[];
  stats: SeoStats;
  counts: { pass: number; warn: number; fail: number };
};

export const TITLE_RANGE = { min: 30, max: 60 } as const;
export const DESCRIPTION_RANGE = { min: 120, max: 160 } as const;

const POINTS: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

type Builder = (c: Omit<SeoCheck, "detail"> & { detail: string }) => void;

export function analyzeSeo(input: SeoInput): SeoReport {
  const { fields, slug, siteHost, corpus } = input;
  const doc = fields.content_json;
  const blocks = extractBlocks(doc);
  const headings = extractHeadings(doc);
  const links = extractLinks(doc);
  const images = extractImages(doc);

  const bodyText = input.plainText ?? blocks.map((b) => b.text).join(" ");
  const words = tokenize(bodyText).length;
  const kw = fields.focus_keyword.trim();
  const title = fields.title.trim();
  const seoTitle = (fields.seo_title.trim() || title).trim();
  const description = fields.seo_description.trim();

  const paragraphs = blocks.filter((b) => b.type === "paragraph" && b.text.length > 0);
  const h2s = headings.filter((h) => h.level === 2);
  const sentences = splitSentences(paragraphs.map((p) => p.text).join(" "));
  const avgSentenceWords = sentences.length
    ? Math.round(sentences.reduce((s, x) => s + tokenize(x).length, 0) / sentences.length)
    : 0;

  const internal = links.filter((l) => internalPathOf(l.href, siteHost) !== null);
  const external = links.filter((l) => /^https?:/i.test(l.href) && internalPathOf(l.href, siteHost) === null);

  const kwCount = kw ? countPhrase(bodyText, kw) : 0;
  const kwDensity = words > 0 && kw ? Number(((kwCount * tokenize(kw).length * 100) / words).toFixed(2)) : 0;
  // Read from the FAQ block in the body, not `fields.faq`: that field is only derived on save
  // (see saveDraft), so it is stale in the editor's live analysis.
  const faq = extractFaq(fields.content_json);

  const checks: SeoCheck[] = [];
  const add: Builder = (c) => checks.push(c);

  // ---- Meta ---------------------------------------------------------------
  const tl = seoTitle.length;
  add({
    id: "title-length",
    group: "meta",
    weight: 8,
    title: "SEO title length",
    status:
      tl === 0
        ? "fail"
        : tl >= TITLE_RANGE.min && tl <= TITLE_RANGE.max
          ? "pass"
          : tl >= 20 && tl <= 70
            ? "warn"
            : "fail",
    detail: tl === 0 ? "No title yet." : `${tl} characters (aim for ${TITLE_RANGE.min}–${TITLE_RANGE.max}).`,
    fix:
      tl > TITLE_RANGE.max
        ? "Shorten the title so it is not truncated in search results."
        : "Write a title of 30–60 characters that leads with the topic.",
  });

  add({
    id: "kw-set",
    group: "content",
    weight: 10,
    title: "Focus keyword",
    status: kw ? "pass" : "fail",
    detail: kw ? `Targeting “${kw}”.` : "No focus keyword set.",
    fix: "Pick the one phrase a searcher would type to find this article and set it as the focus keyword.",
  });

  if (kw) {
    const inTitle = hasPhrase(seoTitle, kw);
    const titleTokens = tokenize(seoTitle).length;
    const early =
      inTitle && hasPhrase(firstWords(seoTitle, Math.max(tokenize(kw).length + 2, Math.ceil(titleTokens * 0.6))), kw);
    add({
      id: "title-keyword",
      group: "meta",
      weight: 8,
      title: "Keyword in SEO title",
      status: inTitle ? (early ? "pass" : "warn") : "fail",
      detail: inTitle
        ? early
          ? "The keyword appears near the start of the title."
          : "The keyword appears, but late in the title."
        : "The focus keyword is missing from the SEO title.",
      fix: "Work the exact keyword into the title, ideally near the beginning.",
    });
    add({
      id: "h1-keyword",
      group: "meta",
      weight: 6,
      title: "Keyword in headline (H1)",
      status: hasPhrase(title, kw) ? "pass" : hasAllWords(title, kw) ? "warn" : "fail",
      detail: hasPhrase(title, kw)
        ? "The headline contains the keyword."
        : "The headline does not contain the exact keyword.",
      fix: "Include the focus keyword in the article headline.",
    });
  }

  const dl = description.length;
  add({
    id: "meta-length",
    group: "meta",
    weight: 8,
    title: "Meta description length",
    status:
      dl === 0
        ? "fail"
        : dl >= DESCRIPTION_RANGE.min && dl <= DESCRIPTION_RANGE.max
          ? "pass"
          : dl >= 80 && dl <= 180
            ? "warn"
            : "fail",
    detail:
      dl === 0
        ? "No meta description."
        : `${dl} characters (aim for ${DESCRIPTION_RANGE.min}–${DESCRIPTION_RANGE.max}).`,
    fix: "Summarize the payoff in 120–160 characters, with the keyword and a reason to click.",
  });
  if (kw) {
    add({
      id: "meta-keyword",
      group: "meta",
      weight: 6,
      title: "Keyword in meta description",
      status: hasPhrase(description, kw) ? "pass" : hasAllWords(description, kw) ? "warn" : "fail",
      detail: hasPhrase(description, kw)
        ? "The meta description contains the keyword."
        : "The keyword is missing from the meta description.",
      fix: "Mention the focus keyword naturally in the meta description.",
    });
  }

  const slugWords = slug.split("-").filter(Boolean);
  const slugHasKw = kw ? hasAllWords(slugWords.join(" "), kw) : true;
  add({
    id: "slug",
    group: "meta",
    weight: 5,
    title: "URL slug",
    status: slug.length === 0 ? "fail" : slug.length <= 60 && slugHasKw ? "pass" : "warn",
    detail:
      slug.length === 0
        ? "No slug."
        : `/blog/${slug}${slug.length > 60 ? " (long)" : ""}${slugHasKw ? "" : " (missing keyword)"}`,
    fix: "Keep the slug under 60 characters and include the focus keyword words.",
  });

  // ---- Content ------------------------------------------------------------
  if (kw) {
    add({
      id: "kw-intro",
      group: "content",
      weight: 6,
      title: "Keyword in the introduction",
      status: hasPhrase(firstWords(bodyText, 100), kw)
        ? "pass"
        : hasAllWords(firstWords(bodyText, 100), kw)
          ? "warn"
          : "fail",
      detail: hasPhrase(firstWords(bodyText, 100), kw)
        ? "Found in the first 100 words."
        : "Not found in the first 100 words.",
      fix: "Use the focus keyword in the first paragraph so readers and search engines see the topic immediately.",
    });
    const subs = headings.filter((h) => h.level <= 3);
    const subHit = subs.some((h) => hasPhrase(h.text, kw));
    const subPartial = subs.some((h) => hasAllWords(h.text, kw));
    add({
      id: "kw-subheading",
      group: "content",
      weight: 5,
      title: "Keyword in a subheading",
      status: subHit ? "pass" : subPartial ? "warn" : "fail",
      detail: subHit ? "At least one H2/H3 contains the keyword." : "No H2/H3 contains the keyword.",
      fix: "Add the keyword, or a close variant, to at least one H2 or H3.",
    });
    const densityStatus: CheckStatus =
      words < 100 ? "warn" : kwDensity > 3 ? "fail" : kwDensity > 2.5 || kwDensity < 0.2 ? "warn" : "pass";
    add({
      id: "kw-density",
      group: "content",
      weight: 5,
      title: "Keyword density",
      status: densityStatus,
      detail: `${kwCount}× (${kwDensity}% of the text).`,
      fix:
        kwDensity > 2.5
          ? "Reduce repetition; use synonyms and related terms instead of the exact phrase."
          : "Mention the keyword a few more times where it reads naturally, and add related terms.",
    });
  }

  add({
    id: "word-count",
    group: "content",
    weight: 6,
    title: "Content length",
    status:
      words >= (fields.is_pillar ? 1500 : 800) ? "pass" : words >= (fields.is_pillar ? 1000 : 500) ? "warn" : "fail",
    detail: `${words} words${fields.is_pillar ? " (pillar target: 1,500+)" : " (target: 800+)"}.`,
    fix: "Cover the topic more completely: answer follow-up questions, add examples, and address objections.",
  });

  add({
    id: "readability",
    group: "content",
    weight: 4,
    title: "Sentence length",
    status: words < 50 ? "warn" : avgSentenceWords <= 20 ? "pass" : avgSentenceWords <= 25 ? "warn" : "fail",
    detail: words < 50 ? "Not enough text yet." : `${avgSentenceWords} words per sentence on average.`,
    fix: "Split long sentences. Aim for an average of 20 words or fewer.",
  });

  const longParas = paragraphs.filter((p) => tokenize(p.text).length > 120).length;
  add({
    id: "paragraph-length",
    group: "content",
    weight: 3,
    title: "Paragraph length",
    status: longParas === 0 ? "pass" : longParas <= 2 ? "warn" : "fail",
    detail: longParas === 0 ? "No overly long paragraphs." : `${longParas} paragraph(s) over 120 words.`,
    fix: "Break long paragraphs into 2–4 sentence chunks so they scan well on mobile.",
  });

  // ---- Structure ----------------------------------------------------------
  add({
    id: "h2-count",
    group: "structure",
    weight: 5,
    title: "Section headings",
    status: words < 300 ? "warn" : h2s.length >= 3 ? "pass" : h2s.length >= 1 ? "warn" : "fail",
    detail: `${h2s.length} H2 heading(s).`,
    fix: "Break the article into sections with descriptive H2 headings (3 or more for a full article).",
  });

  let skipped = false;
  let prevLevel = 1; // the title is the H1
  for (const h of headings) {
    if (h.level > prevLevel + 1) skipped = true;
    prevLevel = h.level;
  }
  const emptyHeading = headings.some((h) => h.text.trim().length === 0);
  add({
    id: "heading-hierarchy",
    group: "structure",
    weight: 5,
    title: "Heading hierarchy",
    status: skipped || emptyHeading ? "fail" : "pass",
    detail: emptyHeading
      ? "There is an empty heading."
      : skipped
        ? "A heading level is skipped (for example H2 followed by H4)."
        : "Headings nest correctly under the H1.",
    fix: "Use H2 for sections and H3 for subsections. Never skip a level, and never leave a heading empty.",
  });

  const hasList = blocks.some((b) => b.type === "list" || b.type === "table");
  add({
    id: "scannable",
    group: "structure",
    weight: 2,
    title: "Lists or tables",
    status: hasList || words < 400 ? "pass" : "warn",
    detail: hasList ? "Uses lists or tables for scannability." : "No lists or tables.",
    fix: "Turn a run of parallel points into a bulleted list or a comparison table.",
  });

  add({
    id: "faq",
    group: "structure",
    weight: 3,
    title: "FAQ section",
    status: faq.length >= 2 ? "pass" : faq.length === 1 ? "warn" : "warn",
    detail: faq.length ? `${faq.length} FAQ item(s); eligible for FAQ rich results.` : "No FAQ items.",
    fix: "Add 2–4 real questions readers ask, with short direct answers, to capture question searches.",
  });

  // ---- Links --------------------------------------------------------------
  const needLinks = words >= 400;
  add({
    id: "internal-links",
    group: "links",
    weight: 8,
    title: "Internal links",
    status: !needLinks ? "pass" : internal.length >= 3 ? "pass" : internal.length >= 1 ? "warn" : "fail",
    detail: `${internal.length} internal link(s).`,
    fix: "Link to 3 or more related articles or product pages, using descriptive anchor text.",
  });
  add({
    id: "external-links",
    group: "links",
    weight: 3,
    title: "External sources",
    status: external.length >= 1 || words < 400 ? "pass" : "warn",
    detail: `${external.length} external link(s).`,
    fix: "Cite at least one authoritative external source where you make a factual claim.",
  });

  const badAnchors = links.filter((l) => isGenericAnchor(l.text));
  add({
    id: "anchor-quality",
    group: "links",
    weight: 4,
    title: "Anchor text",
    status: badAnchors.length === 0 ? "pass" : "fail",
    detail:
      badAnchors.length === 0
        ? "Links use descriptive anchors."
        : `Generic anchors: ${badAnchors
            .slice(0, 3)
            .map((l) => `“${l.text}”`)
            .join(", ")}.`,
    fix: "Replace “click here” style anchors with words that describe the destination.",
  });

  const headingLinks = links.filter((l) => l.inHeading).length;
  const linkPer100 = words > 0 ? (internal.length * 100) / words : 0;
  add({
    id: "link-placement",
    group: "links",
    weight: 2,
    title: "Link density & placement",
    status: headingLinks > 0 || linkPer100 > 1.5 ? "warn" : "pass",
    detail:
      headingLinks > 0
        ? `${headingLinks} link(s) inside headings.`
        : linkPer100 > 1.5
          ? `${linkPer100.toFixed(1)} internal links per 100 words is heavy.`
          : "Links are placed naturally in body text.",
    fix: "Keep links out of headings and roughly one internal link per 100–150 words.",
  });

  if (corpus) {
    const bySlug = new Map(corpus.map((c) => [c.slug, c]));
    const broken = internal
      .map((l) => blogSlugFromPath(internalPathOf(l.href, siteHost) ?? ""))
      .filter((s): s is string => Boolean(s))
      .filter((s) => {
        const target = bySlug.get(s);
        return !target || target.status !== "published";
      });
    add({
      id: "broken-links",
      group: "links",
      weight: 8,
      title: "Internal link targets",
      status: broken.length === 0 ? "pass" : "fail",
      detail:
        broken.length === 0
          ? "Every internal blog link points at a live article."
          : `Points at missing or unpublished articles: ${[...new Set(broken)].join(", ")}.`,
      fix: "Publish the target article or change the link.",
    });

    const inbound = corpus.filter(
      (c) => c.id !== input.postId && c.status === "published" && c.linksToSlugs.includes(slug),
    ).length;
    add({
      id: "inbound-links",
      group: "links",
      weight: 4,
      title: "Inbound links (orphan check)",
      status: inbound > 0 || corpus.filter((c) => c.status === "published").length === 0 ? "pass" : "warn",
      detail: inbound > 0 ? `${inbound} article(s) link here.` : "No other published article links to this one.",
      fix: "Add a link to this article from a related post; see Inbound suggestions in the Links tab.",
    });

    if (kw) {
      const norm = (s: string) => tokenize(s).join(" ");
      const twin = corpus.find((c) => c.id !== input.postId && c.focusKeyword && norm(c.focusKeyword) === norm(kw));
      add({
        id: "cannibalization",
        group: "technical",
        weight: 6,
        title: "Keyword cannibalization",
        status: twin ? "fail" : "pass",
        detail: twin ? `“${twin.title}” already targets “${kw}”.` : "No other article targets this keyword.",
        fix: "Two articles competing for one keyword split ranking signals. Target a different keyword or merge the articles.",
      });
    }
  }

  // ---- Media --------------------------------------------------------------
  add({
    id: "cover",
    group: "media",
    weight: 5,
    title: "Cover image",
    status: fields.cover_url ? (fields.cover_alt.trim() ? "pass" : "warn") : "fail",
    detail: fields.cover_url
      ? fields.cover_alt.trim()
        ? "Cover image with alt text."
        : "Cover image is missing alt text."
      : "No cover image.",
    fix: "Add a cover image and describe it in the alt text.",
  });
  const noAlt = images.filter((i) => !i.alt.trim()).length;
  add({
    id: "image-alts",
    group: "media",
    weight: 4,
    title: "Image alt text",
    status: images.length === 0 ? (words >= 800 ? "warn" : "pass") : noAlt === 0 ? "pass" : "fail",
    detail:
      images.length === 0
        ? "No images in the body."
        : noAlt === 0
          ? `All ${images.length} image(s) have alt text.`
          : `${noAlt} of ${images.length} image(s) missing alt text.`,
    fix:
      images.length === 0
        ? "Add a relevant image or diagram to long articles."
        : "Describe every image in its alt text.",
  });

  // ---- Technical ----------------------------------------------------------
  add({
    id: "category",
    group: "technical",
    weight: 3,
    title: "Category",
    status: fields.category_id ? "pass" : "fail",
    detail: fields.category_id ? "Assigned to a category." : "No category.",
    fix: "Choose a category so the article appears on its hub page.",
  });
  add({
    id: "tags",
    group: "technical",
    weight: 3,
    title: "Tags",
    status: fields.tags.length >= 2 && fields.tags.length <= 6 ? "pass" : fields.tags.length === 0 ? "fail" : "warn",
    detail: `${fields.tags.length} tag(s).`,
    fix: "Use 2–6 specific tags.",
  });
  const ex = fields.excerpt.trim().length;
  add({
    id: "excerpt",
    group: "technical",
    weight: 3,
    title: "Excerpt",
    status: ex >= 80 && ex <= 220 ? "pass" : ex > 0 ? "warn" : "fail",
    detail: ex === 0 ? "No excerpt." : `${ex} characters (aim for 80–220).`,
    fix: "Write a 1–2 sentence excerpt; it appears on cards and as the article's standfirst.",
  });
  if (fields.noindex) {
    add({
      id: "noindex",
      group: "technical",
      weight: 2,
      title: "Indexing",
      status: "warn",
      detail: "This article is set to noindex and will not appear in search results.",
      fix: "Turn off noindex in Settings if you want this article to rank.",
    });
  }

  // ---- Conversion -----------------------------------------------------------
  const hasCta = hasCallout(doc, "cta");
  add({
    id: "cta",
    group: "conversion",
    weight: 3,
    title: "Call to action",
    status: hasCta || words < 300 ? "pass" : "warn",
    detail: hasCta ? "Includes a call-to-action callout." : "No call-to-action callout.",
    fix: 'Add a callout (type "/" → Call to action) inviting the reader to act (submit, subscribe, visit), tied to the problem this article solves.',
  });

  const counts = { pass: 0, warn: 0, fail: 0 };
  let earned = 0;
  let total = 0;
  for (const c of checks) {
    counts[c.status] += 1;
    earned += c.weight * POINTS[c.status];
    total += c.weight;
  }
  const empty = words === 0 && !title;

  return {
    score: empty || total === 0 ? null : Math.round((earned / total) * 100),
    checks,
    counts,
    stats: {
      words,
      h2Count: h2s.length,
      internalLinks: internal.length,
      externalLinks: external.length,
      keywordCount: kwCount,
      keywordDensity: kwDensity,
      avgSentenceWords,
      readingEase: fleschReadingEase(paragraphs.map((p) => p.text).join(" ")),
      images: images.length,
      faqCount: faq.length,
    },
  };
}

/** Failures that block publishing. Everything else is advice: warnings never block. */
export function publishBlockers(report: SeoReport, fields: BlogFields): string[] {
  const out: string[] = [];
  if (!fields.title.trim()) out.push("Add a title.");
  if (!fields.content_json.content?.length) out.push("The article is empty.");
  if (!fields.seo_description.trim()) out.push("Add a meta description.");
  if (!fields.category_id) out.push("Choose a category.");
  for (const id of ["heading-hierarchy", "broken-links", "anchor-quality"]) {
    const c = report.checks.find((x) => x.id === id);
    if (c && c.status === "fail") out.push(`${c.title}: ${c.detail}`);
  }
  return out;
}
