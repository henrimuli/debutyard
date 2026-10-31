import "server-only";
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { renderMarkdown } from "./markdown";
import { rankRelated } from "./related";
import { bylinesFor, getStaffPost, isLive, type Post } from "./service";
import { renderPostContent } from "./render";
import type { BlogAuthor, BlogCategory, PostSummary, PublicPost } from "./types";

/** Read side of the public blog: only live posts (published, date passed). */

const { posts, blogCategories, postRedirects } = schema;

export const BLOG_PAGE_SIZE = 12;

/** Old posts without a byline are signed by the team. */
const TEAM: BlogAuthor = { kind: "team", name: "DebutYard team", role: "", bio: "", avatarUrl: null, url: null };

type Row = { p: Post; category: typeof blogCategories.$inferSelect | null };

const select = () =>
  db()
    .select({ p: posts, category: blogCategories })
    .from(posts)
    .leftJoin(blogCategories, eq(blogCategories.id, posts.categoryId));

const toCategory = (c: Row["category"]): BlogCategory | null =>
  c ? { id: c.id, slug: c.slug, name: c.name, description: c.description } : null;

async function summaries(rows: Row[]): Promise<PostSummary[]> {
  const bylines = await bylinesFor(rows.map((r) => r.p.id));
  return rows.map(({ p, category }) => toSummary(p, category, bylines.get(p.id)));
}

function toSummary(p: Post, category: Row["category"], authors: BlogAuthor[] | undefined): PostSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.coverUrl ? { url: p.coverUrl, alt: p.coverAlt, width: null, height: null } : null,
    category: toCategory(category),
    tags: p.tags,
    kind: p.kind,
    authors: authors?.length ? authors : [TEAM],
    readingMinutes: p.readingMinutes,
    featured: p.featured,
    cluster: "",
    focusKeyword: p.focusKeyword,
    publishedAt: p.publishedAt!.toISOString(),
    updatedAt: (p.contentUpdatedAt ?? p.publishedAt!).toISOString(),
  };
}

export type PostPage = { posts: PostSummary[]; total: number; page: number; pageCount: number };

export async function listPublishedPosts(
  opts: { categorySlug?: string; page?: number; pageSize?: number; excludeIds?: string[] } = {},
): Promise<PostPage> {
  const pageSize = opts.pageSize ?? BLOG_PAGE_SIZE;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where = and(
    isLive(),
    opts.categorySlug ? eq(blogCategories.slug, opts.categorySlug) : undefined,
    opts.excludeIds?.length ? notInArray(posts.id, opts.excludeIds) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    select()
      .where(where)
      .orderBy(desc(posts.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db()
      .select({ n: count() })
      .from(posts)
      .leftJoin(blogCategories, eq(blogCategories.id, posts.categoryId))
      .where(where),
  ]);
  return { posts: await summaries(rows), total: n, page, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

/** Pinned posts, newest first. The first is the blog's hero. */
export async function listFeaturedPosts(limit = 3): Promise<PostSummary[]> {
  const rows = await select()
    .where(and(isLive(), eq(posts.featured, true)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit);
  return summaries(rows);
}

async function toPublic({ p, category }: Row): Promise<PublicPost> {
  const [bylines, product] = await Promise.all([
    bylinesFor([p.id]),
    p.productId
      ? db().query.products.findFirst({
          where: eq(schema.products.id, p.productId),
          columns: { slug: true, name: true, tagline: true, logoUrl: true, websiteUrl: true },
        })
      : Promise.resolve(undefined),
  ]);
  // Posts from before the rich editor only have Markdown.
  const html = p.contentHtml || (p.contentJson ? renderPostContent(p.contentJson).html : renderMarkdown(p.body));
  return {
    ...toSummary(p, category, bylines.get(p.id)),
    html,
    toc: p.toc,
    wordCount: p.wordCount,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    secondaryKeywords: p.secondaryKeywords,
    canonicalUrl: p.canonicalUrl,
    noindex: p.noindex,
    ogImageUrl: null,
    faq: p.faq,
    isPillar: false,
    product: product ?? null,
  };
}

export async function getPublishedPost(slug: string): Promise<PublicPost | null> {
  const [row] = await select()
    .where(and(isLive(), eq(posts.slug, slug)))
    .limit(1);
  return row ? toPublic(row) : null;
}

/** Staff preview of a post's working copy, rendered the way it will publish. */
export async function getPreviewPost(id: string): Promise<PublicPost | null> {
  const staff = await getStaffPost(id);
  const [row] = await select().where(eq(posts.id, id)).limit(1);
  if (!staff || !row) return null;
  const f = staff.fields;
  const rendered = renderPostContent(f.content_json);
  const base = await toPublic({
    p: { ...row.p, publishedAt: row.p.publishedAt ?? new Date() },
    category: row.category,
  });
  return {
    ...base,
    title: f.title || base.title,
    excerpt: f.excerpt,
    cover: f.cover_url ? { url: f.cover_url, alt: f.cover_alt, width: f.cover_width, height: f.cover_height } : null,
    html: rendered.html,
    toc: rendered.toc,
    faq: f.faq,
    wordCount: rendered.wordCount,
    readingMinutes: rendered.readingMinutes,
    noindex: true,
  };
}

/** The slug a post moved to, when `slug` is one of its old URLs (for a permanent redirect). */
export async function findRedirectSlug(slug: string): Promise<string | null> {
  const [row] = await db()
    .select({ slug: posts.slug })
    .from(postRedirects)
    .innerJoin(posts, eq(posts.id, postRedirects.postId))
    .where(and(eq(postRedirects.fromSlug, slug), isLive()))
    .limit(1);
  return row?.slug ?? null;
}

/** Every live post, for the sitemap, RSS and llms.txt. */
export async function listPublishedSlugs() {
  return db()
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
      updatedAt: sql<Date>`coalesce(${posts.contentUpdatedAt}, ${posts.publishedAt})`.mapWith(posts.publishedAt),
      noindex: posts.noindex,
    })
    .from(posts)
    .where(isLive())
    .orderBy(desc(posts.publishedAt))
    .limit(5000);
}

export type CategoryWithCount = BlogCategory & { count: number };

/** Categories with at least one live post, in display order. */
export async function listCategoriesWithPosts(): Promise<CategoryWithCount[]> {
  const rows = await db()
    .select({ c: blogCategories, n: count(posts.id) })
    .from(blogCategories)
    .innerJoin(posts, and(eq(posts.categoryId, blogCategories.id), isLive()))
    .groupBy(blogCategories.id)
    .orderBy(blogCategories.sortOrder);
  return rows.map(({ c, n }) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, count: n }));
}

export async function getCategory(slug: string): Promise<BlogCategory | null> {
  const c = await db().query.blogCategories.findFirst({ where: eq(blogCategories.slug, slug) });
  return c ? { id: c.id, slug: c.slug, name: c.name, description: c.description } : null;
}

export async function getRelatedPosts(post: PostSummary, limit = 3): Promise<PostSummary[]> {
  const rows = await select()
    .where(and(isLive(), sql`${posts.id} <> ${post.id}`))
    .orderBy(desc(posts.publishedAt))
    .limit(200);
  return rankRelated(post, await summaries(rows), limit);
}
