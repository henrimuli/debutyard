import type { JSONContent } from "@tiptap/core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { products } from "./board";
import { orders } from "./payments";

export const postStatus = pgEnum("post_status", ["draft", "published"]);
/** "post" is a guide. Roundups, comparisons and alternatives list products, mostly from the board. */
export const postKind = pgEnum("post_kind", ["post", "recap", "launch", "roundup", "comparison", "alternatives"]);

export type FaqItem = { q: string; a: string };
export type TocItem = { id: string; text: string; level: 2 | 3 };

/** Blog sections, separate from the board's product categories. */
export const blogCategories = pgTable("blog_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Blog posts: the live copy readers see. The editor autosaves into postDrafts
 * and publishing copies the draft here, so half-written edits never go live.
 * Weekly recaps are drafted automatically (one per week) and published by hand.
 * Launch posts are drafted from a paid debut's perk task (see perkTasks).
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    /** Markdown from before the rich editor. Only read while contentJson is null. */
    body: text("body").notNull().default(""),
    contentJson: jsonb("content_json").$type<JSONContent>(),
    /** Rendered from contentJson on publish, without the FAQ block (that renders on its own). */
    contentHtml: text("content_html").notNull().default(""),
    toc: jsonb("toc").$type<TocItem[]>().notNull().default([]),
    faq: jsonb("faq").$type<FaqItem[]>().notNull().default([]),
    wordCount: integer("word_count").notNull().default(0),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    coverUrl: text("cover_url"),
    coverAlt: text("cover_alt").notNull().default(""),
    categoryId: uuid("category_id").references(() => blogCategories.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default([]),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    focusKeyword: text("focus_keyword").notNull().default(""),
    secondaryKeywords: text("secondary_keywords").array().notNull().default([]),
    canonicalUrl: text("canonical_url"),
    noindex: boolean("noindex").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    /** Launch posts: the product the post is about. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    /** When the published text last changed, shown as "Updated" (roundups get refreshed). */
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }),
    /** Launch posts: when the maker was emailed that it's live (scheduled posts are emailed by the cron). */
    makerNotifiedAt: timestamp("maker_notified_at", { withTimezone: true }),
    kind: postKind("kind").notNull().default("post"),
    /** Set on recaps: the week they cover. Unique so the cron drafts each week once. */
    weekKey: text("week_key").unique(),
    status: postStatus("status").notNull().default("draft"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("posts_published_idx").on(t.status, t.publishedAt),
    index("posts_category_idx").on(t.categoryId),
    index("posts_product_idx").on(t.productId),
  ],
);

/** The editor's working copy of a post: everything an author edits, autosaved. */
export const postDrafts = pgTable("post_drafts", {
  postId: uuid("post_id")
    .primaryKey()
    .references(() => posts.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<Record<string, unknown>>().notNull(),
  /** Bumped on every save; a save from an older version is refused (two editors at once). */
  version: integer("version").notNull().default(1),
  hasUnpublishedChanges: boolean("has_unpublished_changes").notNull().default(false),
  wordCount: integer("word_count").notNull().default(0),
  seoScore: smallint("seo_score"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const revisionReason = pgEnum("revision_reason", ["autosave", "manual", "publish", "restore"]);

/** Version history: a snapshot every few minutes of editing, on publish and on "Save version". */
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull(),
    reason: revisionReason("reason").notNull().default("autosave"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("post_revisions_post_idx").on(t.postId, t.createdAt)],
);

/** Old slugs of live posts, so links keep working after a rename. */
export const postRedirects = pgTable("post_redirects", {
  fromSlug: text("from_slug").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A staff member's byline, set once and shown on every post they write. */
export const blogAuthorProfiles = pgTable("blog_author_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  /** Shown under the name, e.g. "Editor, DebutYard". */
  role: text("role").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const postAuthorRole = pgEnum("post_author_role", ["team", "maker"]);

/** Bylines. Launch posts are co-authored by the publishing staff member and the product's maker. */
export const postAuthors = pgTable(
  "post_authors",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: postAuthorRole("role").notNull().default("team"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("post_authors_user_idx").on(t.userId)],
);

export const postProductRole = pgEnum("post_product_role", ["subject", "listed", "compared"]);

/**
 * Board products a post covers: the subject of a launch post, or the entries of
 * a roundup or comparison. Drives "Featured in" on product pages and keeps any
 * one product from crowding every roundup.
 */
export const postProducts = pgTable(
  "post_products",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    role: postProductRole("role").notNull().default("listed"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.productId] }), index("post_products_product_idx").on(t.productId)],
);

export const makerReviewStatus = pgEnum("maker_review_status", ["pending", "approved", "changes_requested"]);

/**
 * A maker's fact check of their launch post before it goes live: a private
 * preview link where they approve it or send notes. It never blocks publishing.
 */
export const makerReviews = pgTable(
  "maker_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** Random, in the preview link. */
    token: text("token").notNull().unique(),
    status: makerReviewStatus("status").notNull().default("pending"),
    notes: text("notes"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("maker_reviews_post_idx").on(t.postId)],
);

/** Google Keyword Planner results, cached so repeat research doesn't spend API quota. */
export const keywordMetrics = pgTable("keyword_metrics", {
  keyword: text("keyword").primaryKey(),
  avgMonthlySearches: integer("avg_monthly_searches"),
  competition: text("competition"),
  competitionIndex: smallint("competition_index"),
  /** Top-of-page bid range, in US cents. */
  lowBidCents: integer("low_bid_cents"),
  highBidCents: integer("high_bid_cents"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const perkKind = pgEnum("perk_kind", ["newsletter", "newsletter_top", "launch_post"]);
export const perkStatus = pgEnum("perk_status", ["suggested", "drafting", "done", "skipped"]);

/**
 * Perks a paid debut bought that the team delivers: a newsletter mention (Pro,
 * Premium), the top newsletter slot (Spotlight) and a written launch post
 * (Premium, Spotlight). Created when the order is paid; shown as suggestions
 * on the admin Newsletter and Blog pages.
 */
export const perkTasks = pgTable(
  "perk_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: perkKind("kind").notNull(),
    status: perkStatus("status").notNull().default("suggested"),
    /**
     * Newsletter mentions: the issue they go in, keyed like newsletter_issues
     * (the week that closed; the issue's "Debuting now" week is the one after).
     * Once delivered, the issue they went out in. Launch posts: the launch week.
     */
    weekKey: text("week_key").notNull(),
    /** Newsletter line; the tagline is used when null. */
    blurb: text("blurb"),
    /** Launch posts: the draft (or published post) written for it. */
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    skipReason: text("skip_reason"),
    /** Launch posts: end of the launch week (Spotlight: 7 days after payment). */
    dueAt: timestamp("due_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A redelivered payment webhook can't create the same perk twice.
    uniqueIndex("perk_tasks_order_kind_idx").on(t.orderId, t.kind),
    index("perk_tasks_status_kind_idx").on(t.status, t.kind),
    index("perk_tasks_product_idx").on(t.productId),
  ],
);
