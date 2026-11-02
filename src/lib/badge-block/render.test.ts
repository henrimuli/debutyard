import { describe, expect, it } from "vitest";
import { blockHtml, blockScript, installKit, MOVING_AT } from "./render";

const key = "a".repeat(32);
const badge = '<a href="https://dir.example/p/acme"><img src="https://dir.example/b.svg" alt="Dir"></a>';

describe("blockHtml", () => {
  it("is only an invisible marker without badges", () => {
    expect(blockHtml(key, [])).toBe(`<!-- debutyard-badges:${key} -->`);
    expect(blockHtml(key, ["", "  "])).toBe(`<!-- debutyard-badges:${key} -->`);
  });

  it("is a still row with a few badges, each one's code untouched", () => {
    const html = blockHtml(key, [badge, ` ${badge} `]);
    expect(html).toContain('<div id="debutyard-badges"');
    expect(html).toContain(key);
    expect(html).not.toContain("debutyard-moving");
    expect(html.split(badge)).toHaveLength(3);
  });

  it("turns into a looping strip with many, keeping the copy out of the tab order", () => {
    const html = blockHtml(key, Array(MOVING_AT).fill(badge));
    expect(html).toContain('class="debutyard-moving"');
    expect(html.split(badge)).toHaveLength(MOVING_AT + 1);
    expect(html).toContain('aria-hidden="true"');
    expect(html.split('<a tabindex="-1" ')).toHaveLength(MOVING_AT + 1);
    expect(html).toContain("prefers-reduced-motion");
    // Auto side margins would collapse a clipped block to nothing in a flex-column page.
    expect(html).toContain("width:100%;margin:48px 0");
  });
});

describe("blockScript", () => {
  it("is empty when there's nothing to show", () => {
    expect(blockScript(blockHtml(key, []), false)).toBe("");
  });

  /** Runs the script against a tiny fake page. */
  function run(html: string, footers: unknown[], pathname = "/") {
    const script = blockScript(html, true);
    const holder: { innerHTML: string; firstElementChild?: string } = { innerHTML: "" };
    const appended: unknown[] = [];
    const document = {
      readyState: "complete",
      body: { appendChild: (b: unknown) => appended.push(b) },
      getElementById: () => null,
      createElement: () => holder,
      getElementsByTagName: () => footers,
    };
    Object.defineProperty(holder, "firstElementChild", { get: () => holder.innerHTML });
    class Observer {
      observe() {}
    }
    new Function("document", "location", "MutationObserver", script)(document, { pathname }, Observer);
    return { appended, holder, script };
  }

  it("carries the block exactly and goes before the last footer", () => {
    const html = blockHtml(key, [`<a href="https://dir.example/?a=1&b='2'">"quoted"\u2028</a>`]);
    const inserted: Array<[unknown, unknown]> = [];
    const footer = { parentNode: { insertBefore: (b: unknown, f: unknown) => inserted.push([b, f]) } };
    const { holder, script } = run(html, [{}, footer]);
    expect(script).not.toContain("\u2028");
    expect(holder.innerHTML).toBe(html);
    expect(inserted).toEqual([[html, footer]]);
  });

  it("goes at the end of the page without a footer", () => {
    const html = blockHtml(key, [badge]);
    expect(run(html, []).appended).toEqual([html]);
  });
});

describe("installKit", () => {
  it("gives both install methods, and the prompt carries them", () => {
    const kit = installKit("https://debutyard.com", key);
    expect(kit.scriptTag).toBe(`<script src="https://debutyard.com/badges/${key}.js" async></script>`);
    expect(kit.htmlUrl).toBe(`https://debutyard.com/badges/${key}.html`);
    expect(kit.prompt).toContain(kit.scriptTag);
    expect(kit.prompt).toContain(kit.htmlUrl);
  });
});
