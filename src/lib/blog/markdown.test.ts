import { describe, expect, it } from "vitest";
import { aiOutputToHtml, escapeMarkdown, excerptFrom, renderMarkdown, safeHref } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common markdown", () => {
    const html = renderMarkdown("## Hi\n\nSome **bold** and a [link](/p/x).");
    expect(html).toContain("<h2>Hi</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="/p/x">link</a>');
  });

  it("escapes raw HTML", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nhi <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops dangerous link and image URLs", () => {
    const html = renderMarkdown("[x](javascript:alert(1)) ![y](data:text/html,hi)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
  });

  it("marks external links nofollow", () => {
    expect(renderMarkdown("[a](https://a.io)")).toContain('rel="noopener nofollow ugc"');
  });
});

describe("helpers", () => {
  it("allows only safe hrefs", () => {
    expect(safeHref("//evil.io")).toBeNull();
    expect(safeHref("JaVaScRiPt:x")).toBeNull();
    expect(safeHref("mailto:a@b.io")).toBe("mailto:a@b.io");
  });

  it("escapes maker text so it can't inject markdown", () => {
    const name = "[Click](javascript:x) **big** <b>";
    const html = renderMarkdown(`- ${escapeMarkdown(name)}`);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("[Click](javascript:x) **big** &lt;b&gt;");
  });

  it("builds plain excerpts", () => {
    expect(excerptFrom("# Title\n\nHello [world](/x), this is **it**.")).toBe("Hello world, this is it.");
    expect(excerptFrom("a ".repeat(200), 20)).toHaveLength(20);
  });
});

describe("aiOutputToHtml", () => {
  it("leaves plain HTML exactly as it came", () => {
    const html =
      '<h2>Hi</h2>\n<p>Some <strong>bold</strong> and a <a href="https://x.test">link</a>.</p>\n<ul><li>One</li></ul>';
    expect(aiOutputToHtml(html)).toBe(html);
  });

  it("recovers a draft that switches from HTML to Markdown after a callout", () => {
    const html = aiOutputToHtml(
      `<p>Intro paragraph.</p>
<aside data-callout="image">Screenshot needed: the dashboard.</aside>
As of 2026, PayPal is a platform <a href="https://business.org" rel="nofollow">Business.org, 2026</a>.

## How to handle seasonal cash flow

Managing spikes is hard.

* **No monthly fees:** you avoid costs.
* **No minimum balance:** ideal for startups.

## Sources
* <a href="https://paypal.com">PayPal, 2026</a>`,
    );
    expect(html).toContain("<p>Intro paragraph.</p>");
    expect(html).toContain('<aside data-callout="image">Screenshot needed: the dashboard.</aside>');
    expect(html).toContain('<p>As of 2026, PayPal is a platform <a href="https://business.org" rel="nofollow">');
    expect(html).toContain("<h2>How to handle seasonal cash flow</h2>");
    expect(html).toContain("<li><strong>No monthly fees:</strong> you avoid costs.</li>");
    expect(html).toContain('<li><a href="https://paypal.com">PayPal, 2026</a></li>');
    expect(html).not.toMatch(/##|\*\*/);
  });

  it("reads an answer that's all Markdown, while it's still streaming too", () => {
    expect(aiOutputToHtml("## Hi\n\nSome text")).toContain("<h2>Hi</h2>");
    expect(aiOutputToHtml("* One\n* Tw")).toContain("<li>Tw</li>");
  });

  it("keeps the FAQ block and indented HTML intact next to Markdown", () => {
    const faq =
      "<div data-faq><details data-faq-item><summary>Why?</summary><div data-faq-a>Because.</div></details></div>";
    const html = aiOutputToHtml(`## Intro

${faq}

<ul>
    <li><p>One</p>
    <li>Two</li>
</ul>`);
    expect(html).toContain("<h2>Intro</h2>");
    expect(html.replace(/s+/g, "")).toContain(faq.replace(/s+/g, ""));
    expect(html).not.toContain("<pre>");
  });

  it("turns stray bold inside an HTML block into a tag", () => {
    expect(aiOutputToHtml("<p>A **big** word.</p>")).toContain("<strong>big</strong>");
  });
});
