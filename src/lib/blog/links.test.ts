import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  applySuggestionToDoc,
  buildTargets,
  outboundBlogSlugs,
  phraseRegex,
  suggestInboundLinks,
  suggestInternalLinks,
} from "@/lib/blog/links";
import type { CorpusPost } from "@/lib/blog/seo/analyze";
import { extractLinks } from "@/lib/blog/content";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, marks });
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const h2 = (text: string): JSONContent => ({ type: "heading", attrs: { level: 2 }, content: [t(text)] });
const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });

const base = { secondaryKeywords: [], categoryName: null, cluster: "", tags: [], linksToSlugs: [] as string[] };
const corpus: CorpusPost[] = [
  {
    ...base,
    id: "1",
    slug: "short-form-video-hooks",
    title: "Short-form video hooks",
    status: "published",
    focusKeyword: "short-form video hooks",
    cluster: "growth",
    text: "Nine ideas. Batch content creation saves hours and keeps you consistent.",
  },
  {
    ...base,
    id: "2",
    slug: "batch-content-creation",
    title: "Batch content creation",
    status: "published",
    focusKeyword: "batch content creation",
    secondaryKeywords: ["content batching"],
    text: "Plan a week. Then write short-form video hooks for every clip you film.",
  },
  { ...base, id: "3", slug: "draft-post", title: "Draft", status: "draft", focusKeyword: "unpublished topic idea" },
];

describe("phraseRegex", () => {
  it("matches hyphen/space variants, plurals and respects word boundaries", () => {
    const re = phraseRegex("short-form video hook")!;
    expect(re.test("Try SHORT FORM video hooks today")).toBe(true);
    expect(re.test("short-form video hooked")).toBe(true); // inflections match
    expect(re.test("short-form video hookup")).toBe(false); // a different word sharing a prefix does not
    expect(re.test("overshort-form video hook")).toBe(false);
  });
});

describe("buildTargets", () => {
  it("only targets published posts other than itself, plus product pages", () => {
    const targets = buildTargets(corpus, "batch-content-creation");
    const hrefs = targets.map((x) => x.href);
    expect(hrefs).toContain("/blog/short-form-video-hooks");
    expect(hrefs).not.toContain("/blog/batch-content-creation");
    expect(hrefs).not.toContain("/blog/draft-post");
    expect(hrefs).toContain("/directories");
  });
});

describe("suggestInternalLinks", () => {
  const article = doc(
    p(t("Writing great short-form video hooks takes practice. Start with a plan and browse our launch directories.")),
    h2("Short-form video hooks in headings are ignored"),
    p(
      t("Already linked: "),
      t("batch content creation", [{ type: "link", attrs: { href: "/blog/batch-content-creation" } }]),
    ),
  );

  it("finds verbatim anchors, skips headings and already-linked targets", () => {
    const targets = buildTargets(corpus, "me");
    const out = suggestInternalLinks({ doc: article, targets, siteHost: "debutyard.test", wordCount: 400 });
    const hooks = out.find((s) => s.href === "/blog/short-form-video-hooks");
    expect(hooks?.anchor).toBe("short-form video hooks");
    expect(hooks?.context).toContain("Writing great");
    expect(out.find((s) => s.href === "/blog/batch-content-creation")).toBeUndefined();
    expect(out.find((s) => s.href === "/directories")?.anchor.toLowerCase()).toBe("launch directories");
    // every anchor must literally exist in the article text
    const text = JSON.stringify(article).toLowerCase();
    for (const s of out) expect(text).toContain(s.anchor.toLowerCase());
  });

  it("respects the link budget", () => {
    const targets = buildTargets(corpus, "me");
    const manyLinks = doc(
      p(
        t("a", [{ type: "link", attrs: { href: "/a" } }]),
        t("b", [{ type: "link", attrs: { href: "/b" } }]),
        t("c", [{ type: "link", attrs: { href: "/c" } }]),
        t(" short-form video hooks"),
      ),
    );
    expect(suggestInternalLinks({ doc: manyLinks, targets, siteHost: "debutyard.test", wordCount: 200 })).toEqual([]);
  });
});

describe("applySuggestionToDoc", () => {
  it("splits the text node and adds a link mark, leaving the original untouched", () => {
    const original = doc(p(t("Use short-form video hooks early.")));
    const out = applySuggestionToDoc(original, { anchor: "short-form video hooks", href: "/blog/x" })!;
    const links = extractLinks(out);
    expect(links).toEqual([{ href: "/blog/x", text: "short-form video hooks", inHeading: false }]);
    expect(out.content?.[0]?.content?.map((n) => n.text)).toEqual(["Use ", "short-form video hooks", " early."]);
    expect(extractLinks(original)).toEqual([]);
  });
  it("returns null when the anchor is gone or only present in a heading", () => {
    expect(
      applySuggestionToDoc(doc(h2("short-form video hooks")), { anchor: "short-form video hooks", href: "/x" }),
    ).toBeNull();
    expect(
      applySuggestionToDoc(doc(p(t("nothing here"))), { anchor: "short-form video hooks", href: "/x" }),
    ).toBeNull();
  });
});

describe("inbound suggestions and outbound slugs", () => {
  it("finds posts that mention the topic without linking to it", () => {
    const out = suggestInboundLinks({
      self: {
        slug: "short-form-video-hooks",
        title: "Hooks",
        focusKeyword: "short-form video hooks",
        secondaryKeywords: [],
      },
      corpus,
    });
    expect(out.map((x) => x.postSlug)).toEqual(["batch-content-creation"]);
    expect(out[0]?.context).toContain("write short-form video hooks");
  });
  it("skips posts that already link to the target", () => {
    const linked = corpus.map((c) =>
      c.slug === "batch-content-creation" ? { ...c, linksToSlugs: ["short-form-video-hooks"] } : c,
    );
    expect(
      suggestInboundLinks({
        self: {
          slug: "short-form-video-hooks",
          title: "Hooks",
          focusKeyword: "short-form video hooks",
          secondaryKeywords: [],
        },
        corpus: linked,
      }),
    ).toEqual([]);
  });
  it("lists outbound blog slugs", () => {
    const d = doc(
      p(
        t("x", [{ type: "link", attrs: { href: "/blog/a-post" } }]),
        t("y", [{ type: "link", attrs: { href: "https://debutyard.test/blog/b-post#x" } }]),
      ),
    );
    expect(outboundBlogSlugs(d, "debutyard.test").sort()).toEqual(["a-post", "b-post"]);
  });
});
