import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  assignHeadingIds,
  blogSlugFromPath,
  extractBlocks,
  extractLinks,
  internalPathOf,
  isBlankDoc,
} from "@/lib/blog/content";
import { renderPostContent } from "@/lib/blog/render";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, marks });
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const h = (level: number, text: string, id?: string): JSONContent => ({
  type: "heading",
  attrs: { level, ...(id ? { id } : {}) },
  content: [t(text)],
});
const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });

describe("assignHeadingIds", () => {
  it("makes unique ids, keeps valid existing ones, and builds an H2/H3 TOC", () => {
    const { doc: out, toc } = assignHeadingIds(
      doc(h(2, "Getting Started"), h(3, "Getting Started"), h(4, "Deep"), h(2, "Wrap up", "custom-id")),
    );
    expect(toc).toEqual([
      { id: "getting-started", text: "Getting Started", level: 2 },
      { id: "getting-started-2", text: "Getting Started", level: 3 },
      { id: "custom-id", text: "Wrap up", level: 2 },
    ]);
    expect(out.content?.[2]?.attrs?.id).toBe("deep");
  });
  it("does not mutate its input", () => {
    const input = doc(h(2, "A"));
    assignHeadingIds(input);
    expect(input.content?.[0]?.attrs?.id).toBeUndefined();
  });
});

describe("renderPostContent", () => {
  it("renders ids, marks external links safely and drops javascript: links", () => {
    const r = renderPostContent(
      doc(
        h(2, "Why it works"),
        p(
          t("Read "),
          t("this guide", [{ type: "link", attrs: { href: "https://example.com/x" } }]),
          t(" and "),
          t("ours", [{ type: "link", attrs: { href: "/blog/other-post" } }]),
          t(" but not "),
          t("this", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        ),
      ),
    );
    expect(r.html).toContain('<h2 id="why-it-works">Why it works</h2>');
    expect(r.html).toContain('href="https://example.com/x"');
    expect(r.html).toContain('target="_blank"');
    expect(r.html).toContain('rel="noopener noreferrer"');
    expect(r.html).toMatch(/<a href="\/blog\/other-post"[^>]*>ours<\/a>/);
    expect(r.html).not.toContain("javascript:");
    expect(r.toc).toHaveLength(1);
    expect(r.wordCount).toBe(11);
    expect(r.readingMinutes).toBe(1);
  });
  it("drops images whose source is not http(s) or a site path", () => {
    const img = (src: string): JSONContent => ({ type: "image", attrs: { src, alt: "x" } });
    const r = renderPostContent(
      doc(
        img("https://cdn.example.com/a.webp"),
        img("/blog/covers/a.svg"),
        img("javascript:alert(1)"),
        img("data:image/svg+xml;base64,AAAA"),
        img("//evil.example/x.png"),
        p(t("ok")),
      ),
    );
    expect(r.html).toContain("https://cdn.example.com/a.webp");
    expect(r.html).toContain("/blog/covers/a.svg");
    expect(r.html).not.toContain("javascript:");
    expect(r.html).not.toContain("data:image");
    expect(r.html).not.toContain("evil.example");
  });
  it("renders an empty document to empty html", () => {
    expect(renderPostContent(doc()).html).toBe("");
  });
});

describe("content helpers", () => {
  it("extracts links, merging split runs, and flags headings", () => {
    const links = extractLinks(
      doc(
        p(
          t("Hi "),
          t("bold", [{ type: "link", attrs: { href: "/a" } }, { type: "bold" }]),
          t(" link", [{ type: "link", attrs: { href: "/a" } }]),
        ),
      ),
    );
    expect(links).toEqual([{ href: "/a", text: "bold link", inHeading: false }]);
  });
  it("classifies internal paths and blog slugs", () => {
    expect(internalPathOf("https://debutyard.test/blog/x", "debutyard.test")).toBe("/blog/x");
    expect(internalPathOf("https://www.debutyard.test/pricing", "debutyard.test")).toBe("/pricing");
    expect(internalPathOf("https://other.com/blog/x", "debutyard.test")).toBeNull();
    expect(blogSlugFromPath("/blog/my-post#faq")).toBe("my-post");
    expect(blogSlugFromPath("/blog/category/growth")).toBeNull();
  });
  it("detects blank docs and lists blocks", () => {
    expect(isBlankDoc(doc(p()))).toBe(true);
    expect(isBlankDoc(doc(p(t("x"))))).toBe(false);
    expect(extractBlocks(doc(h(2, "A"), p(t("b")))).map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });
});

describe("empty tables", () => {
  const cell = (...c: JSONContent[]): JSONContent => ({ type: "tableCell", content: c.length ? c : [p()] });
  const table = (...cells: JSONContent[]): JSONContent => ({
    type: "table",
    content: [{ type: "tableRow", content: cells }],
  });

  it("drops tables with no text but keeps real ones", () => {
    const r = renderPostContent(
      doc(
        p(t("Last paragraph.")),
        table(cell(p(t("Upload"))), cell()),
        table(cell(), cell()),
        table(cell(), cell(), cell()),
      ),
    );
    expect(r.html.match(/<table/g)).toHaveLength(1);
    expect(r.html).toContain("Upload");
  });
});

describe("FAQ heading", () => {
  const faq: JSONContent = {
    type: "faq",
    content: [
      {
        type: "faqItem",
        content: [
          { type: "faqQuestion", content: [t("Q?")] },
          { type: "faqAnswer", content: [t("A.")] },
        ],
      },
    ],
  };

  it("drops a writer's FAQ heading right above the FAQ block, from the body and the TOC", () => {
    const r = renderPostContent(doc(h(2, "Next step"), p(t("Go.")), h(2, "Frequently asked questions"), p(), faq));
    expect(r.html).not.toContain("Frequently asked");
    expect(r.toc.map((x) => x.text)).toEqual(["Next step"]);
  });

  it("keeps FAQ-like headings that are not directly above the block", () => {
    const r = renderPostContent(doc(h(2, "Common questions about hooks"), p(t("Body.")), faq));
    expect(r.html).toContain("Common questions about hooks");
  });
});
