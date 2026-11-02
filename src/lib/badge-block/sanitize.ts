import { parse, type HTMLElement, type Node } from "node-html-parser";

/**
 * Cleans a directory's badge code before it reaches a maker's site. Keeps
 * links, images and inline SVG, with each link's href and rel exactly as the
 * directory gave them. Scripts and anything else that could run or overlay the
 * page go. Pure.
 */

const SVG_TAGS = [
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
];
const KEEP = new Set([
  "a",
  "img",
  "picture",
  "source",
  "span",
  "div",
  "p",
  "strong",
  "b",
  "em",
  "i",
  "small",
  "br",
  ...SVG_TAGS,
]);
/** Gone along with whatever's inside them. Other unknown tags give way to their contents. */
const DROP = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "video",
  "audio",
  "canvas",
  "foreignobject",
  "title",
]);
const VOID = new Set(["img", "br", "source"]);

const ATTRS = new Set(
  (
    "href rel target title class style id alt src srcset sizes media type width height loading decoding referrerpolicy role aria-label aria-hidden " +
    "viewbox xmlns fill stroke stroke-width stroke-linecap stroke-linejoin fill-rule clip-rule clip-path d x y dx dy cx cy r rx ry x1 x2 y1 y2 points transform opacity " +
    "font-size font-family font-weight text-anchor offset stop-color stop-opacity gradientunits gradienttransform"
  ).split(" "),
);

const isWebUrl = (v: string) => {
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

function allowed(name: string, value: string): boolean {
  if (!ATTRS.has(name)) return false;
  if (name === "href") return isWebUrl(value);
  if (name === "src") return isWebUrl(value) || /^data:image\//i.test(value);
  if (name === "srcset") return !/javascript:|data:text/i.test(value);
  if (name === "style")
    return !/url\(|expression|javascript:|@import|position\s*:\s*(fixed|absolute|sticky)/i.test(value);
  // Our own block's id belongs to us.
  if (name === "id") return value !== "debutyard-badges";
  return true;
}

const escapeAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(nodes: Node[], removed: Set<string>): string {
  let out = "";
  for (const node of nodes) {
    if (node.nodeType === 3) {
      out += node.rawText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else if (node.nodeType === 1) {
      const el = node as HTMLElement;
      const tag = el.rawTagName ?? "";
      const lower = tag.toLowerCase();
      if (DROP.has(lower)) {
        removed.add(lower);
      } else if (!KEEP.has(lower)) {
        if (lower) removed.add(lower);
        out += render(el.childNodes, removed);
      } else {
        const attrs = Object.entries(el.attributes)
          .filter(([name, value]) => allowed(name.toLowerCase(), value))
          .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
          .join("");
        out += VOID.has(lower) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${render(el.childNodes, removed)}</${tag}>`;
      }
    }
  }
  return out;
}

export type CleanBadge = {
  html: string;
  /** Tags that had to go, for telling staff the badge may not work as given. */
  removed: string[];
  /** There's a link in it, which is what most Verify buttons look for. */
  hasLink: boolean;
  /** There's something to see or find at all. */
  usable: boolean;
};

export function sanitizeBadge(raw: string): CleanBadge {
  const removed = new Set<string>();
  const root = parse(raw, { comment: false });
  const html = render(root.childNodes, removed).trim();
  const clean = parse(html);
  const hasLink = clean.querySelectorAll("a").some((a) => a.getAttribute("href"));
  const usable = hasLink || clean.querySelectorAll("img, svg").length > 0;
  return { html, removed: [...removed], hasLink, usable };
}
