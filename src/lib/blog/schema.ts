import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

/** Request validation for the portal blog APIs. Everything a client sends is checked here. */

const MAX_DOC_BYTES = 1_500_000;

const docSchema = z.custom<JSONContent>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    (v as { type?: unknown }).type === "doc" &&
    JSON.stringify(v).length <= MAX_DOC_BYTES,
  { message: "Invalid or oversized document" },
);

/** http(s) URL or a site-relative path. Rejects javascript:, data:, protocol-relative, etc. */
const urlOrPath = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v), {
    message: "Must be an http(s) URL or a site path",
  });

const nullableUrl = urlOrPath.transform((v) => (v === "" ? null : v)).nullable();

const tag = z.string().trim().min(1).max(40);

export const fieldsSchema = z.object({
  title: z.string().max(200),
  excerpt: z.string().max(600),
  content_json: docSchema,
  cover_url: nullableUrl,
  cover_alt: z.string().max(300),
  cover_width: z.number().int().positive().max(20000).nullable(),
  cover_height: z.number().int().positive().max(20000).nullable(),
  category_id: z.string().uuid().nullable(),
  tags: z.array(tag).max(12),
  seo_title: z.string().max(200),
  seo_description: z.string().max(400),
  focus_keyword: z.string().trim().max(120),
  secondary_keywords: z.array(z.string().trim().min(1).max(120)).max(15),
  canonical_url: nullableUrl,
  noindex: z.boolean(),
  og_image_url: nullableUrl,
  faq: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).max(20),
  cluster: z.string().trim().max(80),
  is_pillar: z.boolean(),
});

export const authorProfileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  role: z.string().trim().max(120).optional(),
  bio: z.string().max(600).optional(),
  avatarUrl: nullableUrl.optional(),
});

export const fieldsPatchSchema = fieldsSchema.partial();

export const saveDraftSchema = z.object({
  baseVersion: z.number().int().min(0),
  fields: fieldsPatchSchema,
  /** Snapshot a revision now (explicit "Save version"). */
  manual: z.boolean().optional(),
});

export const publishSchema = z.object({
  /** ISO timestamp. In the future = scheduled. Omitted = now (or keep the original date). */
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const metaSchema = z.object({
  slug: z.string().trim().max(100).optional(),
  featured: z.boolean().optional(),
});

export const createPostSchema = z.object({ title: z.string().trim().max(200).optional() });

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(300).optional(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
