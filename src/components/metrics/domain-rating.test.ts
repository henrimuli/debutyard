import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainRating, DrAttribution } from "./domain-rating";

const html = (score: number | null) => renderToStaticMarkup(createElement(DomainRating, { score }));

describe("DomainRating", () => {
  it("shows the rounded score and fills the band to it", () => {
    const out = html(53.6);
    expect(out).toContain(">54<");
    expect(out).toContain('stroke-dashoffset="46"');
    expect(out).toContain('aria-label="Domain Rating 54 out of 100"');
  });

  it("clamps to 0–100 and leaves the ring empty at 0 or unmeasured", () => {
    expect(html(140)).toContain('stroke-dashoffset="0"');
    expect(html(0)).not.toContain("score-band");
    const none = html(null);
    expect(none).toContain(">–<");
    expect(none).not.toContain("score-band");
  });
});

describe("DrAttribution", () => {
  it("credits Ahrefs with a working link, as the licence asks", () => {
    const out = renderToStaticMarkup(createElement(DrAttribution));
    expect(out).toContain("Domain Rating by");
    expect(out).toMatch(/<a href="https:\/\/ahrefs.com\/"[^>]*>Ahrefs<\/a>/);
  });
});
