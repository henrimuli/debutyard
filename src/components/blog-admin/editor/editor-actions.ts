import type { Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, type Node as PMNode } from "@tiptap/pm/model";
import { phraseRegex } from "@/lib/blog/links";

/** Operations that modify the live editor from a suggestion (links, text edits, AI output). */

type Range = { from: number; to: number };

/** Plain text of one textblock plus, for each character, its position in the document. */
function blockChars(node: PMNode, pos: number): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  node.descendants((child, childPos) => {
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i++) {
        map.push(pos + 1 + childPos + i);
        text += child.text[i];
      }
    }
  });
  return { text, map };
}

function findInBlocks(
  editor: Editor,
  match: (text: string) => { index: number; length: number } | null,
  opts: { skipHeadings?: boolean } = {},
): Range | null {
  let found: Range | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return;
    if (node.type.name === "codeBlock" || (opts.skipHeadings && node.type.name === "heading")) return false;
    const { text, map } = blockChars(node, pos);
    const m = match(text);
    if (m && m.length > 0) found = { from: map[m.index]!, to: map[m.index + m.length - 1]! + 1 };
    return false;
  });
  return found;
}

/** Turns the first unlinked, in-body occurrence of `anchor` into a link. */
export function applyLinkInEditor(editor: Editor, anchor: string, href: string): boolean {
  const re = phraseRegex(anchor);
  if (!re) return false;
  let found: Range | null = null;
  editor.state.doc.descendants((node, pos, parent) => {
    if (found) return false;
    if (!node.isText || !node.text) return;
    const pt = parent?.type.name;
    if (pt === "heading" || pt === "codeBlock") return;
    if (node.marks.some((m) => m.type.name === "link" || m.type.name === "code")) return;
    const m = re.exec(node.text);
    if (m) found = { from: pos + m.index, to: pos + m.index + m[0].length };
  });
  if (!found) return false;
  const r: Range = found;
  return editor.chain().focus().setTextSelection(r).setLink({ href }).setTextSelection(r.to).run();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces `find` (a phrase inside ONE paragraph/heading) with `replace`, keeping formatting. */
export function applyTextEdit(editor: Editor, find: string, replace: string): boolean {
  const exact = find.trim();
  if (!exact) return false;
  // Whitespace-tolerant: the server normalized runs of spaces when it validated the quote.
  const re = new RegExp(esc(exact).replace(/\s+/g, "\\s+"));
  const range = findInBlocks(editor, (text) => {
    const m = re.exec(text);
    return m ? { index: m.index, length: m[0].length } : null;
  });
  if (!range) return false;
  const marks = editor.state.doc.nodeAt(range.from)?.marks.map((m) => m.toJSON()) ?? [];
  return editor
    .chain()
    .focus()
    .insertContentAt(range, { type: "text", text: replace, ...(marks.length ? { marks } : {}) })
    .run();
}

/** Model output can carry fences or an H1; strip them before it reaches the editor schema. */
export function cleanAiHtml(raw: string): string {
  return raw
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/<h1(\s[^>]*)?>/gi, "<h2>")
    .replace(/<\/h1>/gi, "</h2>")
    .trim();
}

/** Replace a previously selected range with rewritten HTML, if the text is still what was selected. */
export function replaceSelectionWithHtml(
  editor: Editor,
  from: number,
  to: number,
  expected: string,
  html: string,
): boolean {
  const current = editor.state.doc.textBetween(from, to, "\n");
  if (current !== expected) return false;
  const content = cleanAiHtml(html);
  // A rewrite of inline text should stay inline: unwrap a lone <p>.
  const inline = /^<p>([\s\S]*)<\/p>$/.exec(content);
  const single = inline && !/<\/p>\s*<p>/.test(content) ? inline[1]! : content;
  // TipTap defaults to preserveWhitespace "full", which turns the newlines between tags into empty paragraphs.
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, single, { parseOptions: { preserveWhitespace: false } })
    .run();
}

/** A top-level block boundary range to stream into. `from === to` inserts; otherwise replaces an empty paragraph. */
export type StreamRange = { from: number; to: number };

const isEmptyParagraph = (n: PMNode | null | undefined) => n?.type.name === "paragraph" && n.childCount === 0;

/**
 * Where streamed content goes: after the last block ("end") or after the block holding the cursor
 * ("cursor"). An empty paragraph at that spot is replaced rather than left as a blank line.
 * Always a top-level boundary, so replacing with whole blocks never splits or merges nodes.
 */
export function streamAnchor(editor: Editor, where: "end" | "cursor"): StreamRange {
  const { doc, selection } = editor.state;
  const end = doc.content.size;
  if (where === "end") {
    const last = doc.lastChild;
    return isEmptyParagraph(last) ? { from: end - last!.nodeSize, to: end } : { from: end, to: end };
  }
  const $pos = doc.resolve(selection.from);
  if ($pos.depth === 0) return { from: selection.from, to: selection.from };
  const top = $pos.node(1);
  return isEmptyParagraph(top)
    ? { from: $pos.before(1), to: $pos.after(1) }
    : { from: $pos.after(1), to: $pos.after(1) };
}

/** HTML -> top-level blocks. An inert document, so nothing (images, handlers) loads while parsing. */
function parseBlocks(editor: Editor, html: string) {
  const dom = new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  return PMDOMParser.fromSchema(editor.schema).parse(dom).content;
}

/**
 * Replaces the region streamed so far (`range`) with the full response re-parsed, and returns the
 * new region. Re-parsing everything each time lets a half-written tag complete itself on the next
 * chunk. `range.from` is a top-level boundary and the inserted fragment is whole blocks (unlike
 * insertContentAt, which may shift the range it is given).
 *
 * The region's new end is measured from the document's end, not from `blocks.size`: plugins may
 * change the inserted blocks after dispatch (the table extension's fixTables pads a half-streamed
 * row with empty cells), and trusting `blocks.size` then left those pieces outside the region on
 * every chunk, piling up as empty tables after everything streamed later.
 */
export function streamHtmlInto(editor: Editor, range: StreamRange, html: string): StreamRange {
  const blocks = parseBlocks(editor, cleanAiHtml(html));
  if (blocks.size === 0) return range;
  const to = Math.min(range.to, editor.state.doc.content.size);
  const after = editor.state.doc.content.size - to;
  editor.view.dispatch(editor.state.tr.replaceWith(range.from, to, blocks));
  return { from: range.from, to: editor.state.doc.content.size - after };
}

/** An "image to generate" callout: where it sits and the description inside it. */
export type GenerateSpot = { pos: number; text: string };

export function generateSpots(editor: Editor): GenerateSpot[] {
  const out: GenerateSpot[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "callout") return;
    if (node.attrs.variant === "generate") out.push({ pos, text: node.textContent.trim() });
    return false;
  });
  return out;
}

export function spotAt(editor: Editor, pos: number): GenerateSpot | null {
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === "callout" && node.attrs.variant === "generate"
    ? { pos, text: node.textContent.trim() }
    : null;
}

/**
 * Swaps the callout with this description for the drawn image. Found again by
 * its text, since the author may have typed above it while the image was drawn.
 */
export function replaceSpotWithImage(
  editor: Editor,
  text: string,
  img: { url: string; alt: string; width: number | null; height: number | null },
): boolean {
  const spot = generateSpots(editor).find((s) => s.text === text);
  if (!spot) return false;
  const node = editor.state.doc.nodeAt(spot.pos)!;
  const image = editor.schema.nodes.image!.create({ src: img.url, alt: img.alt, width: img.width, height: img.height });
  editor.view.dispatch(editor.state.tr.replaceWith(spot.pos, spot.pos + node.nodeSize, image));
  return true;
}

/** Replaces the whole body with streamed HTML (maker-notes revisions). */
export function replaceDocWithHtml(editor: Editor, html: string): void {
  const blocks = parseBlocks(editor, cleanAiHtml(html));
  if (blocks.size === 0) return;
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, blocks));
}

/** Plain text of model HTML, for previews (parsed inert, never rendered as HTML). */
export function htmlToText(html: string): string {
  const doc = new window.DOMParser().parseFromString(cleanAiHtml(html), "text/html");
  doc.querySelectorAll("p, li, h2, h3, h4, aside, summary, tr").forEach((el) => el.append("\n"));
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
