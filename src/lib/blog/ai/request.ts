import { z } from "zod";
import { fieldsSchema } from "@/lib/blog/schema";
import { emptyFields, type BlogFields } from "@/lib/blog/types";

const kind = z.enum(["post", "recap", "launch", "roundup", "comparison", "alternatives"]);
const slugList = z
  .array(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
  )
  .max(12)
  .default([]);
const toolList = z.array(z.string().trim().min(1).max(60)).max(6).default([]);

const ctx = {
  postId: z.string().uuid(),
  /** Only what the agent needs is sent; the rest is defaulted so the server sees a full BlogFields. */
  fields: fieldsSchema
    .pick({
      title: true,
      seo_title: true,
      seo_description: true,
      excerpt: true,
      focus_keyword: true,
      secondary_keywords: true,
      tags: true,
      category_id: true,
      content_json: true,
      faq: true,
      cluster: true,
      is_pillar: true,
      cover_url: true,
      cover_alt: true,
    })
    .transform((f): BlogFields => ({ ...emptyFields(), ...f })),
};

export const REWRITE_INSTRUCTIONS = [
  "shorten",
  "expand",
  "fix",
  "simplify",
  "friendly",
  "professional",
  "add-keyword",
  "custom",
] as const;

const brief = {
  kind,
  title: z.string().trim().min(3).max(200),
  keyword: z.string().trim().min(1).max(120),
  secondaryKeywords: z.array(z.string().trim().max(120)).max(8).default([]),
  angle: z.string().trim().max(800).default(""),
  productSlugs: slugList,
  outsideTools: toolList,
  outline: z
    .array(z.object({ h2: z.string().max(200), h3s: z.array(z.string().max(200)).max(6) }))
    .max(14)
    .default([]),
};

export const aiRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ideas"),
    ...ctx,
    focus: z.enum(["any", "post", "roundup", "comparison", "alternatives"]).default("any"),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("outline"),
    ...ctx,
    kind,
    topic: z.string().trim().min(3).max(300),
    keyword: z.string().trim().max(120).optional(),
    notes: z.string().max(2000).optional(),
    productSlugs: slugList,
    outsideTools: toolList,
  }),
  z.object({ action: z.literal("metadata"), ...ctx }),
  z.object({ action: z.literal("optimize"), ...ctx }),
  z.object({ action: z.literal("interlinks"), ...ctx }),
  z.object({
    action: z.literal("image"),
    ...ctx,
    description: z.string().trim().min(10).max(2000),
    aspect: z.enum(["16:9", "4:3", "1:1"]).default("16:9"),
  }),
  z.object({ action: z.literal("cover"), ...ctx, notes: z.string().max(500).optional() }),
  z.object({
    action: z.literal("write"),
    ...ctx,
    instruction: z.string().trim().min(3).max(1500),
    mode: z.enum(["section", "continue", "intro", "conclusion"]).default("section"),
    section: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("draftArticle"), ...ctx, ...brief }),
  z.object({
    action: z.literal("revise"),
    ...ctx,
    notes: z.string().trim().min(3).max(4000),
  }),
  z.object({
    action: z.literal("rewrite"),
    ...ctx,
    selection: z.string().trim().min(1).max(4000),
    instruction: z.enum(REWRITE_INSTRUCTIONS),
    custom: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("chat"),
    ...ctx,
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
      .min(1)
      .max(14),
  }),
]);

export type AiRequest = z.infer<typeof aiRequestSchema>;
export const STREAMED = ["write", "rewrite", "chat", "draftArticle", "revise"] as const;
export type StreamedAction = (typeof STREAMED)[number];
export const isStreamed = (a: AiRequest["action"]): a is StreamedAction => (STREAMED as readonly string[]).includes(a);

/** What a client sends (before `fields` is normalized to a full BlogFields on the server). */
export type AiRequestInput = z.input<typeof aiRequestSchema>;
