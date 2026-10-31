import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

/**
 * The document schema, shared by the browser editor and the server renderer
 * (`generateHTML`). Because public HTML is produced from this schema only, nothing outside it
 * (scripts, iframes, inline handlers) can appear in a rendered article.
 */

export type CalloutVariant = "info" | "tip" | "warning" | "cta" | "image" | "generate";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-callout") ?? "info",
        renderHTML: (attrs) => ({ "data-callout": attrs.variant as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes({ class: "blog-callout" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        (variant = "info") =>
        ({ commands, editor }) =>
          editor.isActive(this.name) ? commands.lift(this.name) : commands.wrapIn(this.name, { variant }),
    };
  },
});

/**
 * FAQ, authored as a block so the writer (human or AI) always produces it in one consistent shape.
 * `extractFaq` (lib/blog/content.ts) reads `fields.faq` from this on every save; the block itself
 * is stripped from the published body HTML and rendered once, as an accordion, by <ArticleFaq>.
 */
export const Faq = Node.create({
  name: "faq",
  group: "block",
  content: "faqItem+",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-faq]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-faq": "", class: "blog-faq" }, HTMLAttributes), 0];
  },
});

export const FaqItem = Node.create({
  name: "faqItem",
  content: "faqQuestion faqAnswer",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "details[data-faq-item]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes({ "data-faq-item": "", class: "blog-faq-item", open: "" }, HTMLAttributes), 0];
  },
});

export const FaqQuestion = Node.create({
  name: "faqQuestion",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", mergeAttributes(HTMLAttributes), 0];
  },
});

export const FaqAnswer = Node.create({
  name: "faqAnswer",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [
      { tag: "div[data-faq-a]" },
      // Models often wrap the answer in <p>. The answer holds inline content only, so a paragraph
      // here used to split the FAQ block apart (answer orphaned below it); keep just its text.
      { tag: "p", context: "faqAnswer/", skip: true, priority: 60 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-faq-a": "" }, HTMLAttributes), 0];
  },
});

/** Stable anchor ids on headings (assigned on save; used by the TOC and deep links). */
const HeadingId = Extension.create({
  name: "headingId",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("id"),
            renderHTML: (attrs) => (attrs.id ? { id: attrs.id as string } : {}),
          },
        },
      },
    ];
  },
});

/** Articles own the page's single H1 (the title), so the body starts at H2. */
export const BLOG_HEADING_LEVELS: (2 | 3 | 4)[] = [2, 3, 4];

export function getBlogExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: BLOG_HEADING_LEVELS },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["mailto"],
        HTMLAttributes: { rel: null, target: null },
      },
    }),
    HeadingId,
    Highlight,
    Image.configure({ HTMLAttributes: { loading: "lazy", decoding: "async" } }),
    TableKit.configure({ table: { resizable: false } }),
    Callout,
    Faq,
    FaqItem,
    FaqQuestion,
    FaqAnswer,
  ];
}
