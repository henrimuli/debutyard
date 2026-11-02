import { describe, expect, it } from "vitest";
import { sanitizeBadge } from "./sanitize";

describe("sanitizeBadge", () => {
  it("keeps a normal badge, including its rel", () => {
    const { html, removed, hasLink, usable } = sanitizeBadge(
      '<a href="https://dir.example/p/acme?a=1&amp;b=2" target="_blank" rel="noopener"><img src="https://dir.example/b.svg" alt="Featured on Dir" width="200" height="54" /></a>',
    );
    expect(html).toBe(
      '<a href="https://dir.example/p/acme?a=1&amp;b=2" target="_blank" rel="noopener"><img src="https://dir.example/b.svg" alt="Featured on Dir" width="200" height="54"></a>',
    );
    expect(removed).toEqual([]);
    expect(hasLink).toBe(true);
    expect(usable).toBe(true);
  });

  it("removes scripts and says so", () => {
    const { html, removed } = sanitizeBadge(
      '<script>alert(1)</script><a href="https://dir.example"><img src="https://dir.example/b.png"></a><iframe src="https://evil.example"></iframe>',
    );
    expect(html).toBe('<a href="https://dir.example"><img src="https://dir.example/b.png"></a>');
    expect(removed.sort()).toEqual(["iframe", "script"]);
  });

  it("removes event handlers, script URLs and overlays", () => {
    const { html } = sanitizeBadge(
      '<a href="java&#10;script:alert(1)" onclick="alert(1)" style="position:fixed;inset:0">x</a><img src="javascript:alert(1)" onerror="alert(1)">',
    );
    expect(html).toBe("<a>x</a><img>");
  });

  it("keeps inline SVG badges, and data images", () => {
    const { html, usable, hasLink } = sanitizeBadge(
      '<svg viewBox="0 0 10 10" onload="alert(1)"><path d="M0 0h10" fill="#000"></path><script>alert(1)</script></svg><img src="data:image/png;base64,AAAA">',
    );
    expect(html).toBe(
      '<svg viewBox="0 0 10 10"><path d="M0 0h10" fill="#000"></path></svg><img src="data:image/png;base64,AAAA">',
    );
    expect(usable).toBe(true);
    expect(hasLink).toBe(false);
  });

  it("unwraps unknown tags, and can't be used when nothing's left", () => {
    expect(sanitizeBadge('<center><a href="https://dir.example">Dir</a></center>').html).toBe(
      '<a href="https://dir.example">Dir</a>',
    );
    expect(sanitizeBadge("<script>alert(1)</script>").usable).toBe(false);
    expect(sanitizeBadge("just text").usable).toBe(false);
  });

  it("can't smuggle markup through text or attributes", () => {
    const { html } = sanitizeBadge(`<a href="https://dir.example" title="&quot;><script>alert(1)</script>">x</a>`);
    expect(html).not.toContain("<script");
  });
});
