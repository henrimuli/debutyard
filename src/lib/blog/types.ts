import type { JSONContent } from "@tiptap/core";

export type BlogFaqItem = { q: string; a: string };

/**
 * Everything an author edits. Lives in `blog_post_drafts.fields` (the working copy) and is
 * copied onto the `blog_posts` columns on publish. Slug, status, featured and publish date are
 * deliberately not here: they take effect immediately and are managed on the post itself.
 */
export type BlogFields = {
  title: string;
  excerpt: string;
  content_json: JSONContent;
  cover_url: string | null;
  cover_alt: string;
  cover_width: number | null;
  cover_height: number | null;
  category_id: string | null;
  tags: string[];
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  secondary_keywords: string[];
  canonical_url: string | null;
  noindex: boolean;
  og_image_url: string | null;
  faq: BlogFaqItem[];
  cluster: string;
  is_pillar: boolean;
};

export const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

export function emptyFields(overrides: Partial<BlogFields> = {}): BlogFields {
  return {
    title: "",
    excerpt: "",
    content_json: EMPTY_DOC,
    cover_url: null,
    cover_alt: "",
    cover_width: null,
    cover_height: null,
    category_id: null,
    tags: [],
    seo_title: "",
    seo_description: "",
    focus_keyword: "",
    secondary_keywords: [],
    canonical_url: null,
    noindex: false,
    og_image_url: null,
    faq: [],
    cluster: "",
    is_pillar: false,
    ...overrides,
  };
}

export type BlogTocItem = { id: string; text: string; level: 2 | 3 };

export type BlogCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

/** A global, per-user byline (see lib/blog/authors.ts) shown on every article that person writes. */
export type BlogAuthor = {
  /** "team" for DebutYard staff, "maker" for a launch post's co-author. */
  kind: "team" | "maker";
  name: string;
  /** Shown under the name, e.g. "Founder, DebutYard". */
  role: string;
  bio: string;
  avatarUrl: string | null;
  /** Builder profile, when the person has a public handle. */
  url: string | null;
};

export type PostKind = "post" | "recap" | "launch" | "roundup" | "comparison" | "alternatives";

export type BlogCover = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/** Card-sized post used by every list on the public site. */
export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: BlogCover | null;
  category: BlogCategory | null;
  tags: string[];
  kind: PostKind;
  authors: BlogAuthor[];
  readingMinutes: number;
  featured: boolean;
  cluster: string;
  focusKeyword: string;
  publishedAt: string;
  /** When the published content last changed (content_updated_at), not any row change. */
  updatedAt: string;
};

/** A full article as the public page renders it. */
export type PublicPost = PostSummary & {
  html: string;
  toc: BlogTocItem[];
  wordCount: number;
  seoTitle: string;
  seoDescription: string;
  secondaryKeywords: string[];
  canonicalUrl: string | null;
  noindex: boolean;
  ogImageUrl: string | null;
  faq: BlogFaqItem[];
  isPillar: boolean;
  /** Launch posts: the product, for the closing card and structured data. */
  product: { slug: string; name: string; tagline: string; logoUrl: string | null; websiteUrl: string } | null;
};

/** "scheduled" is derived: published with a future `published_at`. */
export type BlogDisplayStatus = "draft" | "scheduled" | "published";

export type StaffPostSummary = {
  id: string;
  slug: string;
  status: "draft" | "published";
  displayStatus: BlogDisplayStatus;
  kind: PostKind;
  title: string;
  categoryName: string | null;
  authorName: string;
  seoScore: number | null;
  wordCount: number;
  publishedAt: string | null;
  updatedAt: string;
  hasUnpublishedChanges: boolean;
  featured: boolean;
};

/** A post as the portal editor loads it (the working copy plus post-level state). */
export type StaffPost = {
  id: string;
  slug: string;
  status: "draft" | "published";
  displayStatus: BlogDisplayStatus;
  kind: PostKind;
  featured: boolean;
  publishedAt: string | null;
  version: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  fields: BlogFields;
  authors: (BlogAuthor & { userId: string })[];
  /** Launch posts: the product the post is about. */
  product: { id: string; slug: string; name: string } | null;
  /** Launch posts: the latest fact check sent to the maker. */
  review: MakerReview | null;
};

export type MakerReview = {
  status: "pending" | "approved" | "changes_requested";
  notes: string;
  requestedAt: string;
  respondedAt: string | null;
  expiresAt: string;
};

export type StaffCategory = BlogCategory & { sortOrder: number };
