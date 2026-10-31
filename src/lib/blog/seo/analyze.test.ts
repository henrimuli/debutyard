import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { analyzeSeo, publishBlockers, type CorpusPost } from "@/lib/blog/seo/analyze";
import { countPhrase, fleschReadingEase, isGenericAnchor } from "@/lib/blog/seo/text";
import { emptyFields, type BlogFields } from "@/lib/blog/types";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, marks });
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [t(text)] });
const link = (text: string, href: string) => t(text, [{ type: "link", attrs: { href } }]);
const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });

const HOST = "debutyard.test";
const get = (r: ReturnType<typeof analyzeSeo>, id: string) => r.checks.find((c) => c.id === id);

function fields(over: Partial<BlogFields> = {}): BlogFields {
  return emptyFields({
    title: "Short-form video hooks that stop the scroll",
    seo_title: "Short-Form Video Hooks That Stop the Scroll",
    seo_description:
      "Learn nine short-form video hooks with examples, and how to test them so more viewers keep watching past the first two seconds.",
    focus_keyword: "short-form video hooks",
    category_id: "c1",
    tags: ["hooks", "video"],
    excerpt: "Nine hook patterns you can adapt today, with examples for tutorials, stories, and product demos.",
    cover_url: "/c.png",
    cover_alt: "A cover",
    content_json: doc(
      p(t("Great short-form video hooks decide whether anyone keeps watching. "), t("Here is how they work.")),
      h(2, "Why short-form video hooks matter"),
      p(t("Read our "), link("guide to captions", "/blog/captions"), t(" next.")),
      h(2, "Nine patterns"),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("Result first"))] }] },
    ),
    ...over,
  });
}

describe("text helpers", () => {
  it("counts phrases plural-insensitively", () => {
    expect(countPhrase("Video hook ideas: hooks for video hooks", "video hooks")).toBe(2);
    expect(countPhrase("short-form video hooks and Short form video hook", "short-form video hooks")).toBe(2);
  });
  it("flags generic anchors", () => {
    expect(isGenericAnchor("Click here")).toBe(true);
    expect(isGenericAnchor("https://x.com")).toBe(true);
    expect(isGenericAnchor("caption guide")).toBe(false);
  });
  it("scores plain prose as more readable than dense prose", () => {
    const easy = fleschReadingEase("The cat sat on the mat. It was a sunny day. We had fun.");
    const hard = fleschReadingEase(
      "Notwithstanding considerable methodological heterogeneity, comprehensive epidemiological investigations consistently demonstrate multifactorial etiological determinants.",
    );
    expect(easy).toBeGreaterThan(hard);
  });
});

describe("analyzeSeo: meta and keyword checks", () => {
  it("passes well-formed metadata", () => {
    const r = analyzeSeo({ fields: fields(), slug: "short-form-video-hooks", siteHost: HOST });
    expect(get(r, "title-length")?.status).toBe("pass");
    expect(get(r, "title-keyword")?.status).toBe("pass");
    expect(get(r, "meta-length")?.status).toBe("pass");
    expect(get(r, "meta-keyword")?.status).toBe("pass");
    expect(get(r, "slug")?.status).toBe("pass");
    expect(get(r, "kw-intro")?.status).toBe("pass");
    expect(get(r, "kw-subheading")?.status).toBe("pass");
    expect(get(r, "heading-hierarchy")?.status).toBe("pass");
  });

  it("fails missing keyword, title and description problems", () => {
    const r = analyzeSeo({
      fields: fields({ focus_keyword: "", seo_title: "Hi", seo_description: "" }),
      slug: "x",
      siteHost: HOST,
    });
    expect(get(r, "kw-set")?.status).toBe("fail");
    expect(get(r, "title-length")?.status).toBe("fail");
    expect(get(r, "meta-length")?.status).toBe("fail");
    // keyword-dependent checks are skipped rather than failing noisily
    expect(get(r, "title-keyword")).toBeUndefined();
  });

  it("detects a keyword-stuffed body", () => {
    const stuffed = doc(p(t("hooks hooks hooks hooks hooks hooks hooks hooks hooks video hooks. ".repeat(12))));
    const r = analyzeSeo({
      fields: fields({ focus_keyword: "hooks", content_json: stuffed }),
      slug: "hooks",
      siteHost: HOST,
    });
    expect(get(r, "kw-density")?.status).toBe("fail");
  });
});

describe("analyzeSeo: structure and links", () => {
  it("fails a skipped heading level and generic anchors", () => {
    const bad = doc(p(t("Intro "), link("click here", "/blog/x")), h(2, "One"), h(4, "Skipped"));
    const r = analyzeSeo({ fields: fields({ content_json: bad }), slug: "s", siteHost: HOST });
    expect(get(r, "heading-hierarchy")?.status).toBe("fail");
    expect(get(r, "anchor-quality")?.status).toBe("fail");
  });

  it("reports broken internal links and orphan status using the corpus", () => {
    const base = { secondaryKeywords: [], categoryName: null, cluster: "", tags: [], linksToSlugs: [] };
    const corpus: CorpusPost[] = [
      { ...base, id: "1", slug: "captions", title: "Captions", status: "draft", focusKeyword: "captions" },
      { ...base, id: "2", slug: "other", title: "Other", status: "published", focusKeyword: "short-form video hooks" },
    ];
    const r = analyzeSeo({ fields: fields(), slug: "me", postId: "me", siteHost: HOST, corpus });
    expect(get(r, "broken-links")?.status).toBe("fail"); // links to a draft
    expect(get(r, "inbound-links")?.status).toBe("warn");
    expect(get(r, "cannibalization")?.status).toBe("fail");
    expect(get(r, "cannibalization")?.detail).toContain("Other");
  });

  it("does not run site-context checks without a corpus", () => {
    const r = analyzeSeo({ fields: fields(), slug: "me", siteHost: HOST });
    expect(get(r, "broken-links")).toBeUndefined();
    expect(get(r, "cannibalization")).toBeUndefined();
  });
});

describe("analyzeSeo: conversion (call-to-action)", () => {
  const callout = (variant: string, text: string): JSONContent => ({
    type: "callout",
    attrs: { variant },
    content: [p(t(text))],
  });

  it("passes a short draft without penalizing it for missing a CTA yet", () => {
    const r = analyzeSeo({ fields: fields(), slug: "s", siteHost: HOST });
    expect(get(r, "cta")?.status).toBe("pass");
  });

  it("warns a full-length article with no call-to-action callout", () => {
    const longBody = doc(...Array.from({ length: 60 }, () => p(t("word ".repeat(6)))));
    const r = analyzeSeo({ fields: fields({ content_json: longBody }), slug: "s", siteHost: HOST });
    expect(get(r, "cta")?.status).toBe("warn");
  });

  it("passes once a cta callout is present", () => {
    const longBody = doc(
      ...Array.from({ length: 60 }, () => p(t("word ".repeat(6)))),
      callout("cta", "Submit your product."),
    );
    const r = analyzeSeo({ fields: fields({ content_json: longBody }), slug: "s", siteHost: HOST });
    expect(get(r, "cta")?.status).toBe("pass");
  });

  it("does not count a non-cta callout", () => {
    const longBody = doc(...Array.from({ length: 60 }, () => p(t("word ".repeat(6)))), callout("tip", "A tip."));
    const r = analyzeSeo({ fields: fields({ content_json: longBody }), slug: "s", siteHost: HOST });
    expect(get(r, "cta")?.status).toBe("warn");
  });
});

describe("scoring and publish gate", () => {
  it("returns a null score for an empty draft and a numeric one otherwise", () => {
    expect(analyzeSeo({ fields: emptyFields(), slug: "", siteHost: HOST }).score).toBeNull();
    const r = analyzeSeo({ fields: fields(), slug: "short-form-video-hooks", siteHost: HOST });
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("blocks publishing only on hard requirements", () => {
    const f = fields({ seo_description: "", category_id: null });
    const r = analyzeSeo({ fields: f, slug: "s", siteHost: HOST });
    const blockers = publishBlockers(r, f);
    expect(blockers).toContain("Add a meta description.");
    expect(blockers).toContain("Choose a category.");
    const ok = fields();
    expect(publishBlockers(analyzeSeo({ fields: ok, slug: "s", siteHost: HOST }), ok)).toEqual([]);
  });
});

describe("faq check", () => {
  const faqBlock = (...items: [string, string][]): JSONContent => ({
    type: "faq",
    content: items.map(([q, a]) => ({
      type: "faqItem",
      content: [
        { type: "faqQuestion", content: [t(q)] },
        { type: "faqAnswer", content: [p(t(a))] },
      ],
    })),
  });

  it("reads FAQ items from the body block, not the stale fields.faq", () => {
    const f = fields();
    f.content_json = doc(
      ...(f.content_json.content ?? []),
      faqBlock(["What is a hook?", "The first seconds."], ["How long?", "Two seconds."]),
    );
    f.faq = [];
    const c = get(analyzeSeo({ fields: f, slug: "hooks", siteHost: HOST }), "faq");
    expect(c?.status).toBe("pass");
    expect(c?.detail).toContain("2 FAQ item");
  });

  it("reports no FAQ when the body has none, even if fields.faq is stale", () => {
    const c = get(
      analyzeSeo({ fields: fields({ faq: [{ q: "Old?", a: "Removed." }] }), slug: "hooks", siteHost: HOST }),
      "faq",
    );
    expect(c?.detail).toBe("No FAQ items.");
  });
});
