import { describe, expect, it } from "vitest";
import { blockHtml, blockScript } from "./render";

const badge = '<a href="https://dir.example/p/acme"><img src="https://dir.example/b.svg" alt="Dir"></a>';

describe("blockHtml", () => {
  it("outputs nothing without badges", () => {
    expect(blockHtml([])).toBe("");
    expect(blockHtml(["", "  "])).toBe("");
  });

  it("wraps every badge, leaving each one's code untouched", () => {
    const html = blockHtml([badge, ` ${badge} `]);
    expect(html.startsWith('<div id="debutyard-badges"')).toBe(true);
    expect(html.split(badge)).toHaveLength(3);
  });
});

describe("blockScript", () => {
  it("is empty when there's nothing to show", () => {
    expect(blockScript("")).toBe("");
  });

  it("is valid JavaScript that carries the block exactly", () => {
    const html = blockHtml([`<a href="https://dir.example/?a=1&b='2'">"quoted"\u2028</a>`]);
    const script = blockScript(html);
    expect(script).not.toContain("\u2028");

    const inserted: Array<{ block: unknown; before: unknown }> = [];
    const holder: { innerHTML: string; firstChild: string } = { innerHTML: "", firstChild: "" };
    const footer = {
      parentNode: { insertBefore: (block: unknown, before: unknown) => inserted.push({ block, before }) },
    };
    const document = {
      readyState: "complete",
      getElementById: () => null,
      createElement: () =>
        Object.defineProperty(holder, "firstChild", { get: () => holder.innerHTML, configurable: true }),
      getElementsByTagName: () => [footer],
    };
    new Function("document", script)(document);

    expect(holder.innerHTML).toBe(html);
    expect(inserted).toEqual([{ block: html, before: footer }]);
  });
});
