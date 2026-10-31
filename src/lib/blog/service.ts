import "server-only";
import { randomBytes } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { weekBoard } from "@/lib/board/queries";
import { withRef } from "@/lib/board/links";
import {
  notifyLaunchPostLive,
  notifyMakerReview,
  notifyMakerReviewAnswered,
  notifyRecapDrafted,
} from "@/lib/notifications";
import { getPerkTask, linkLaunchPost, onPostDeleted, onPostPublished, PerkError } from "@/lib/perks/service";
import { slugify as baseSlugify, uniqueSlug } from "@/lib/slug";
import { addWeeks, formatWeekLabel, formatWeekRange, weekKeyFor } from "@/lib/weeks";
import { extractFaq, outboundProductSlugs, placeholderBlockers, textOf, countWords } from "./content";

export { placeholderBlockers };
import { markdownToDoc } from "./convert";
import { outboundBlogSlugs } from "./links";
import { escapeMarkdown, excerptFrom } from "./markdown";
import { renderPostContent, type LinkPolicy } from "./render";
import { fieldsSchema, type SaveDraftInput } from "./schema";
import { analyzeSeo, publishBlockers, type CorpusPost } from "./seo/analyze";
import { siteUrl } from "./site-url";
import { isReservedSlug, isValidSlug, slugify } from "./slug";
import {
  emptyFields,
  type BlogAuthor,
  type BlogFields,
  type MakerReview,
  type BlogDisplayStatus,
  type PostKind,
  type StaffCategory,
  type StaffPost,
  type StaffPostSummary,
} from "./types";

const { posts, postDrafts, postRevisions, postRedirects, postAuthors, postProducts, blogCategories, launchWeeks } =
  schema;
export type Post = typeof posts.$inferSelect;

/** A blog failure the editor can show. `status` maps to HTTP semantics (404, 409 conflict, 422 blocked). */
export class PostError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const formatPostDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

const siteHost = () => new URL(siteUrl()).hostname;

/** Autosave snapshots at most this often; publish and "Save version" always snapshot. */
const SNAPSHOT_EVERY_MS = 5 * 60_000;
const KEEP_REVISIONS = 60;

// Compared with Postgres's clock, so rendering a post never reads the time during prerender.
export const isLive = () =>
  and(eq(posts.status, "published"), isNotNull(posts.publishedAt), lte(posts.publishedAt, sql`now()`));

export function displayStatus(p: Pick<Post, "status" | "publishedAt">, now = new Date()): BlogDisplayStatus {
  if (p.status !== "published") return "draft";
  return p.publishedAt && p.publishedAt > now ? "scheduled" : "published";
}

/** The editable fields of a post that has no working copy yet (made before the editor, or by code). */
export function fieldsFromPost(p: Post): BlogFields {
  return emptyFields({
    title: p.title,
    excerpt: p.excerpt,
    content_json: p.contentJson ?? markdownToDoc(p.body),
    cover_url: p.coverUrl,
    cover_alt: p.coverAlt,
    category_id: p.categoryId,
    tags: p.tags,
    seo_title: p.seoTitle,
    seo_description: p.seoDescription,
    focus_keyword: p.focusKeyword,
    secondary_keywords: p.secondaryKeywords,
    canonical_url: p.canonicalUrl,
    noindex: p.noindex,
    faq: p.faq,
  });
}

/** Stored fields, completed with defaults so older drafts keep working when a field is added. */
const readFields = (raw: Record<string, unknown>): BlogFields => emptyFields(raw as Partial<BlogFields>);

const slugTaken = (exceptId?: string) => async (slug: string) => {
  if (isReservedSlug(slug)) return true;
  const [post, redirect] = await Promise.all([
    db().query.posts.findFirst({
      where: exceptId ? and(eq(posts.slug, slug), ne(posts.id, exceptId)) : eq(posts.slug, slug),
      columns: { id: true },
    }),
    db().query.postRedirects.findFirst({
      where: exceptId
        ? and(eq(postRedirects.fromSlug, slug), ne(postRedirects.postId, exceptId))
        : eq(postRedirects.fromSlug, slug),
      columns: { postId: true },
    }),
  ]);
  return Boolean(post || redirect);
};

const freeSlug = async (title: string, exceptId?: string) =>
  uniqueSlug(slugify(title) || baseSlugify(title, 70) || "untitled", slugTaken(exceptId));

export type NewPost = {
  kind?: PostKind;
  title?: string;
  excerpt?: string;
  content?: JSONContent;
  /** Staff member who starts it; becomes the first byline. */
  authorId?: string | null;
  /** Launch posts: the product, whose maker becomes the second byline. */
  productId?: string | null;
  weekKey?: string | null;
  categorySlug?: string;
};

/** Creates a draft post with its working copy and bylines. */
export async function createPost(input: NewPost): Promise<Post> {
  const title = input.title?.trim() || "Untitled post";
  const slug = await freeSlug(title);
  const category = input.categorySlug
    ? await db().query.blogCategories.findFirst({ where: eq(blogCategories.slug, input.categorySlug) })
    : undefined;
  const fields = emptyFields({
    title: input.title?.trim() ?? "",
    excerpt: input.excerpt ?? "",
    content_json: input.content ?? emptyFields().content_json,
    category_id: category?.id ?? null,
  });
  fields.faq = extractFaq(fields.content_json);

  return db().transaction(async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({
        kind: input.kind ?? "post",
        slug,
        title,
        excerpt: fields.excerpt,
        contentJson: fields.content_json,
        categoryId: fields.category_id,
        weekKey: input.weekKey ?? null,
        productId: input.productId ?? null,
        authorId: input.authorId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new PostError("A post for this already exists.", 409);
    await tx.insert(postDrafts).values({
      postId: row.id,
      fields,
      wordCount: countWords(textOf(fields.content_json)),
      updatedBy: input.authorId ?? null,
    });
    const bylines: (typeof postAuthors.$inferInsert)[] = [];
    if (input.authorId) bylines.push({ postId: row.id, userId: input.authorId, role: "team", position: 0 });
    if (input.productId) {
      const product = await tx.query.products.findFirst({
        where: eq(schema.products.id, input.productId),
        columns: { createdBy: true },
      });
      if (product && product.createdBy !== input.authorId) {
        bylines.push({ postId: row.id, userId: product.createdBy, role: "maker", position: 1 });
      }
    }
    if (bylines.length) await tx.insert(postAuthors).values(bylines).onConflictDoNothing();
    return row;
  });
}

/** The working copy, creating it from the live post the first time an older post is opened. */
async function ensureDraft(post: Post) {
  const existing = await db().query.postDrafts.findFirst({ where: eq(postDrafts.postId, post.id) });
  if (existing) return existing;
  const fields = fieldsFromPost(post);
  const [row] = await db()
    .insert(postDrafts)
    .values({ postId: post.id, fields, wordCount: countWords(textOf(fields.content_json)) })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db().query.postDrafts.findFirst({ where: eq(postDrafts.postId, post.id) }))!;
}

export async function getPost(id: string) {
  return db().query.posts.findFirst({ where: eq(posts.id, id) });
}

/** Bylines for posts, in order: staff first, then the maker. */
export async function bylinesFor(postIds: string[]): Promise<Map<string, (BlogAuthor & { userId: string })[]>> {
  const out = new Map<string, (BlogAuthor & { userId: string })[]>();
  if (postIds.length === 0) return out;
  const rows = await db()
    .select({
      postId: postAuthors.postId,
      userId: postAuthors.userId,
      role: postAuthors.role,
      name: schema.user.name,
      image: schema.user.image,
      handle: schema.user.handle,
      profileName: schema.blogAuthorProfiles.name,
      profileRole: schema.blogAuthorProfiles.role,
      bio: schema.blogAuthorProfiles.bio,
      avatarUrl: schema.blogAuthorProfiles.avatarUrl,
      productName: schema.products.name,
    })
    .from(postAuthors)
    .innerJoin(schema.user, eq(schema.user.id, postAuthors.userId))
    .innerJoin(posts, eq(posts.id, postAuthors.postId))
    .leftJoin(schema.blogAuthorProfiles, eq(schema.blogAuthorProfiles.userId, postAuthors.userId))
    .leftJoin(schema.products, eq(schema.products.id, posts.productId))
    .where(inArray(postAuthors.postId, postIds))
    .orderBy(asc(postAuthors.position));
  for (const r of rows) {
    const team = r.role === "team";
    const author = {
      userId: r.userId,
      kind: r.role,
      name: (team && r.profileName) || r.name,
      role: team ? r.profileRole || "DebutYard team" : r.productName ? `Maker of ${r.productName}` : "Maker",
      bio: team ? (r.bio ?? "") : "",
      avatarUrl: (team && r.avatarUrl) || r.image,
      url: r.handle ? `/builders/${r.handle}` : null,
    } satisfies BlogAuthor & { userId: string };
    out.set(r.postId, [...(out.get(r.postId) ?? []), author]);
  }
  return out;
}

export async function getStaffPost(id: string): Promise<StaffPost | null> {
  const post = await getPost(id);
  if (!post) return null;
  const [draft, bylines, review, product] = await Promise.all([
    ensureDraft(post),
    bylinesFor([post.id]),
    latestMakerReview(post.id),
    post.productId
      ? db().query.products.findFirst({
          where: eq(schema.products.id, post.productId),
          columns: { id: true, slug: true, name: true },
        })
      : Promise.resolve(undefined),
  ]);
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    displayStatus: displayStatus(post),
    kind: post.kind,
    featured: post.featured,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    version: draft.version,
    hasUnpublishedChanges: draft.hasUnpublishedChanges,
    updatedAt: draft.updatedAt.toISOString(),
    fields: readFields(draft.fields),
    authors: bylines.get(post.id) ?? [],
    product: product ?? null,
    review,
  };
}

export async function listStaffPosts(): Promise<StaffPostSummary[]> {
  const rows = await db()
    .select({ p: posts, d: postDrafts, category: blogCategories.name })
    .from(posts)
    .leftJoin(postDrafts, eq(postDrafts.postId, posts.id))
    .leftJoin(blogCategories, eq(blogCategories.id, posts.categoryId))
    .orderBy(desc(sql`coalesce(${postDrafts.updatedAt}, ${posts.updatedAt})`));
  const bylines = await bylinesFor(rows.map((r) => r.p.id));
  return rows.map(({ p, d, category }) => {
    const fields = d ? readFields(d.fields) : null;
    return {
      id: p.id,
      slug: p.slug,
      status: p.status,
      displayStatus: displayStatus(p),
      kind: p.kind,
      title: fields?.title || p.title,
      categoryName: category,
      authorName:
        bylines
          .get(p.id)
          ?.map((a) => a.name)
          .join(" & ") ?? "",
      seoScore: d?.seoScore ?? null,
      wordCount: d?.wordCount ?? p.wordCount,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      updatedAt: (d?.updatedAt ?? p.updatedAt).toISOString(),
      hasUnpublishedChanges: d?.hasUnpublishedChanges ?? false,
      featured: p.featured,
    };
  });
}

/** Every post's working copy, trimmed, for the analyzer's site-wide checks and the link engine. */
export async function listCorpus(): Promise<CorpusPost[]> {
  const rows = await db()
    .select({ p: posts, d: postDrafts, category: blogCategories.name })
    .from(posts)
    .leftJoin(postDrafts, eq(postDrafts.postId, posts.id))
    .leftJoin(blogCategories, eq(blogCategories.id, posts.categoryId));
  const host = siteHost();
  return rows.map(({ p, d, category }) => {
    const f = d ? readFields(d.fields) : fieldsFromPost(p);
    return {
      id: p.id,
      slug: p.slug,
      title: f.title || p.title,
      status: p.status === "published" ? "published" : "draft",
      focusKeyword: f.focus_keyword,
      secondaryKeywords: f.secondary_keywords,
      categoryName: category,
      cluster: f.cluster,
      tags: f.tags,
      linksToSlugs: outboundBlogSlugs(f.content_json, host),
      text: textOf(f.content_json).slice(0, 20_000),
    };
  });
}

export async function listCategories(): Promise<StaffCategory[]> {
  const rows = await db()
    .select()
    .from(blogCategories)
    .orderBy(asc(blogCategories.sortOrder), asc(blogCategories.name));
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
  }));
}

export async function createCategory(name: string, description = ""): Promise<StaffCategory> {
  const slug = slugify(name);
  if (!slug) throw new PostError("Give the category a name.");
  const [{ max }] = await db()
    .select({ max: sql<number>`coalesce(max(${blogCategories.sortOrder}), 0)::int` })
    .from(blogCategories);
  const [row] = await db()
    .insert(blogCategories)
    .values({ slug, name: name.trim(), description: description.trim(), sortOrder: max + 10 })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new PostError("A category with that name already exists.", 409);
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, sortOrder: row.sortOrder };
}

export type SaveResult = { version: number; updatedAt: string; seoScore: number | null };

/**
 * Autosave. The client sends the version it started from; if someone saved
 * since, nothing is written and the latest copy comes back with a 409.
 */
export async function saveDraft(postId: string, userId: string, input: SaveDraftInput): Promise<SaveResult> {
  return db().transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).for("update");
    if (!post) throw new PostError("Post not found.", 404);
    const [draft] = await tx.select().from(postDrafts).where(eq(postDrafts.postId, postId));
    const current = draft ? readFields(draft.fields) : fieldsFromPost(post);
    const version = draft?.version ?? 0;
    if (input.baseVersion !== version) {
      throw new PostError("Someone else saved this post after you opened it.", 409, {
        version,
        fields: current,
        updatedAt: (draft?.updatedAt ?? post.updatedAt).toISOString(),
      });
    }

    const fields = fieldsSchema.parse({ ...current, ...input.fields }) as BlogFields;
    fields.faq = extractFaq(fields.content_json);
    const plainText = textOf(fields.content_json);
    const report = analyzeSeo({ fields, slug: post.slug, postId, siteHost: siteHost(), plainText });
    const now = new Date();
    const next = version + 1;
    const values = {
      fields,
      version: next,
      hasUnpublishedChanges: post.status === "published",
      wordCount: countWords(plainText),
      seoScore: report.score,
      updatedBy: userId,
      updatedAt: now,
    };
    await tx
      .insert(postDrafts)
      .values({ postId, ...values })
      .onConflictDoUpdate({ target: postDrafts.postId, set: values });
    if (post.status === "draft" && fields.title.trim()) {
      await tx.update(posts).set({ title: fields.title.trim() }).where(eq(posts.id, postId));
    }

    const [last] = await tx
      .select({ createdAt: postRevisions.createdAt })
      .from(postRevisions)
      .where(eq(postRevisions.postId, postId))
      .orderBy(desc(postRevisions.createdAt))
      .limit(1);
    if (input.manual || !last || now.getTime() - last.createdAt.getTime() >= SNAPSHOT_EVERY_MS) {
      await tx.insert(postRevisions).values({
        postId,
        version: next,
        fields,
        reason: input.manual ? "manual" : "autosave",
        createdBy: userId,
      });
      await pruneRevisions(tx, postId);
    }
    return { version: next, updatedAt: now.toISOString(), seoScore: report.score };
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function pruneRevisions(tx: Tx, postId: string) {
  await tx.execute(sql`
    delete from post_revisions where post_id = ${postId} and id not in (
      select id from post_revisions where post_id = ${postId} order by created_at desc limit ${KEEP_REVISIONS}
    )`);
}

/** What still needs doing before a post can go live, beyond the SEO analyzer's hard requirements. */

/** Outbound link handling per post: launch posts are paid, so the product's links are sponsored. */
async function linkPolicyFor(post: Post): Promise<LinkPolicy | undefined> {
  const subject = post.productId
    ? await db().query.products.findFirst({
        where: eq(schema.products.id, post.productId),
        columns: { domain: true },
      })
    : undefined;
  const ownedBy = (host: string, domain: string) => {
    const h = host.replace(/^www\./, "");
    return h === domain || h.endsWith(`.${domain}`);
  };
  return (url) => {
    if (post.kind === "launch" && subject && ownedBy(url.hostname, subject.domain)) {
      const u = new URL(url);
      u.searchParams.set("utm_source", "debutyard");
      u.searchParams.set("utm_medium", "referral");
      u.searchParams.set("utm_content", "launch_post");
      return { rel: ["sponsored"], href: u.toString() };
    }
    return null;
  };
}

/** Board products a post links to (and its subject), so product pages can show "Featured in". */
async function syncPostProducts(post: Post, doc: JSONContent) {
  const slugs = outboundProductSlugs(doc, siteHost());
  const linked = slugs.length
    ? await db()
        .select({ id: schema.products.id, slug: schema.products.slug })
        .from(schema.products)
        .where(inArray(schema.products.slug, slugs))
    : [];
  const order = new Map(slugs.map((s, i) => [s, i]));
  const role = post.kind === "comparison" ? "compared" : "listed";
  const rows: (typeof postProducts.$inferInsert)[] = linked
    .filter((p) => p.id !== post.productId)
    .map((p) => ({ postId: post.id, productId: p.id, role, position: (order.get(p.slug) ?? 0) + 1 }));
  if (post.productId) rows.push({ postId: post.id, productId: post.productId, role: "subject", position: 0 });
  await db().transaction(async (tx) => {
    await tx.delete(postProducts).where(eq(postProducts.postId, post.id));
    if (rows.length) await tx.insert(postProducts).values(rows).onConflictDoNothing();
  });
}

/**
 * Publishes the working copy (or updates a live post). A future date schedules
 * it; public pages only show posts whose date has passed.
 */
export async function publishPost(
  postId: string,
  userId: string,
  opts: { publishedAt?: Date | null } = {},
  now = new Date(),
): Promise<Post> {
  const post = await getPost(postId);
  if (!post) throw new PostError("Post not found.", 404);
  const draft = await ensureDraft(post);
  const fields = readFields(draft.fields);
  const corpus = await listCorpus();
  const report = analyzeSeo({ fields, slug: post.slug, postId, siteHost: siteHost(), corpus });
  const blockers = [...publishBlockers(report, fields), ...placeholderBlockers(fields.content_json)];
  if (blockers.length) throw new PostError("Fix these before publishing.", 422, { blockers });

  const rendered = renderPostContent(fields.content_json, { linkPolicy: await linkPolicyFor(post) });
  const publishedAt = opts.publishedAt ?? post.publishedAt ?? now;
  const wasLive = post.status === "published" && post.publishedAt !== null && post.publishedAt <= now;
  const [row] = await db()
    .update(posts)
    .set({
      status: "published",
      publishedAt,
      contentUpdatedAt: wasLive ? now : publishedAt,
      title: fields.title.trim() || post.title,
      excerpt: fields.excerpt.trim() || excerptFrom(rendered.plainText),
      contentJson: fields.content_json,
      contentHtml: rendered.html,
      toc: rendered.toc,
      faq: extractFaq(fields.content_json),
      wordCount: rendered.wordCount,
      readingMinutes: rendered.readingMinutes,
      coverUrl: fields.cover_url,
      coverAlt: fields.cover_alt,
      categoryId: fields.category_id,
      tags: fields.tags,
      seoTitle: fields.seo_title,
      seoDescription: fields.seo_description,
      focusKeyword: fields.focus_keyword,
      secondaryKeywords: fields.secondary_keywords,
      canonicalUrl: fields.canonical_url,
      noindex: fields.noindex,
    })
    .where(eq(posts.id, postId))
    .returning();
  await db().update(postDrafts).set({ hasUnpublishedChanges: false }).where(eq(postDrafts.postId, postId));
  await db()
    .insert(postRevisions)
    .values({ postId, version: draft.version, fields, reason: "publish", createdBy: userId });
  // Whoever publishes is on the byline (launch posts: the team member plus the maker).
  await db().insert(postAuthors).values({ postId, userId, role: "team", position: 0 }).onConflictDoNothing();
  await syncPostProducts(row, fields.content_json);
  if (row.kind === "launch") {
    await onPostPublished(postId, true, now);
    if (publishedAt <= now) await notifyMakerOnce(row);
  }
  return row;
}

/** Emails the maker that their launch post is live, once. */
async function notifyMakerOnce(post: Post) {
  const [claimed] = await db()
    .update(posts)
    .set({ makerNotifiedAt: new Date() })
    .where(and(eq(posts.id, post.id), isNull(posts.makerNotifiedAt)))
    .returning({ id: posts.id });
  if (!claimed) return;
  await notifyLaunchPostLive(post).catch((err) => console.error("launch post live email failed", err));
}

/** Cron: emails makers whose scheduled launch post has now gone live. */
export async function notifyScheduledLaunchPosts() {
  const due = await db()
    .select()
    .from(posts)
    .where(and(eq(posts.kind, "launch"), isLive(), isNull(posts.makerNotifiedAt)));
  for (const p of due) await notifyMakerOnce(p);
  return { notified: due.length };
}

export async function unpublishPost(postId: string): Promise<Post> {
  const [row] = await db().update(posts).set({ status: "draft" }).where(eq(posts.id, postId)).returning();
  if (!row) throw new PostError("Post not found.", 404);
  await db().update(postDrafts).set({ hasUnpublishedChanges: false }).where(eq(postDrafts.postId, postId));
  if (row.kind === "launch") await onPostPublished(postId, false);
  return row;
}

/** Changes the URL. A live post keeps its old URL as a redirect. */
export async function setSlug(postId: string, raw: string): Promise<Post> {
  const slug = slugify(raw);
  if (!isValidSlug(slug)) throw new PostError("Slugs use lowercase letters, numbers and dashes.");
  const post = await getPost(postId);
  if (!post) throw new PostError("Post not found.", 404);
  if (slug === post.slug) return post;
  if (await slugTaken(postId)(slug)) throw new PostError("Another post already uses that URL.", 409);
  return db().transaction(async (tx) => {
    if (post.status === "published") {
      await tx
        .insert(postRedirects)
        .values({ fromSlug: post.slug, postId })
        .onConflictDoUpdate({ target: postRedirects.fromSlug, set: { postId } });
    }
    await tx.delete(postRedirects).where(eq(postRedirects.fromSlug, slug));
    const [row] = await tx.update(posts).set({ slug }).where(eq(posts.id, postId)).returning();
    return row;
  });
}

export async function setFeatured(postId: string, featured: boolean) {
  await db().update(posts).set({ featured }).where(eq(posts.id, postId));
}

export async function deletePost(id: string) {
  await onPostDeleted(id);
  await db().delete(posts).where(eq(posts.id, id));
}

export async function listRevisions(postId: string) {
  const rows = await db()
    .select({
      id: postRevisions.id,
      version: postRevisions.version,
      reason: postRevisions.reason,
      createdAt: postRevisions.createdAt,
      by: schema.user.name,
      fields: postRevisions.fields,
    })
    .from(postRevisions)
    .leftJoin(schema.user, eq(schema.user.id, postRevisions.createdBy))
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt))
    .limit(KEEP_REVISIONS);
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    by: r.by,
    title: readFields(r.fields).title,
    words: countWords(textOf(readFields(r.fields).content_json)),
  }));
}

/** Puts an old version back into the working copy (the live post is untouched until published). */
export async function restoreRevision(postId: string, revisionId: string, userId: string): Promise<SaveResult> {
  const rev = await db().query.postRevisions.findFirst({
    where: and(eq(postRevisions.id, revisionId), eq(postRevisions.postId, postId)),
  });
  if (!rev) throw new PostError("That version is gone.", 404);
  const draft = await db().query.postDrafts.findFirst({ where: eq(postDrafts.postId, postId) });
  const result = await saveDraft(postId, userId, {
    baseVersion: draft?.version ?? 0,
    fields: readFields(rev.fields),
  });
  await db()
    .insert(postRevisions)
    .values({ postId, version: result.version, fields: rev.fields, reason: "restore", createdBy: userId });
  return result;
}

/** Adds a co-author by email or builder handle. */
export async function addAuthor(postId: string, query: string, role: "team" | "maker") {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q) throw new PostError("Enter an email or builder handle.");
  const person = await db().query.user.findFirst({
    where: q.includes("@") ? eq(sql`lower(${schema.user.email})`, q) : eq(schema.user.handle, q),
    columns: { id: true },
  });
  if (!person) throw new PostError("No account with that email or handle.", 404);
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(postAuthors)
    .where(eq(postAuthors.postId, postId));
  await db().insert(postAuthors).values({ postId, userId: person.id, role, position: n }).onConflictDoNothing();
}

export async function removeAuthor(postId: string, userId: string) {
  await db()
    .delete(postAuthors)
    .where(and(eq(postAuthors.postId, postId), eq(postAuthors.userId, userId)));
}

export async function getAuthorProfile(userId: string) {
  const [row] = await db()
    .select({
      name: schema.user.name,
      image: schema.user.image,
      profileName: schema.blogAuthorProfiles.name,
      role: schema.blogAuthorProfiles.role,
      bio: schema.blogAuthorProfiles.bio,
      avatarUrl: schema.blogAuthorProfiles.avatarUrl,
    })
    .from(schema.user)
    .leftJoin(schema.blogAuthorProfiles, eq(schema.blogAuthorProfiles.userId, schema.user.id))
    .where(eq(schema.user.id, userId));
  return {
    name: row?.profileName || row?.name || "",
    role: row?.role || "",
    bio: row?.bio ?? "",
    avatarUrl: row?.avatarUrl || row?.image || null,
  };
}

export async function saveAuthorProfile(
  userId: string,
  p: { name: string; role: string; bio: string; avatarUrl: string | null },
) {
  const values = {
    name: p.name.trim().slice(0, 80),
    role: p.role.trim().slice(0, 120),
    bio: p.bio.trim().slice(0, 600),
    avatarUrl: p.avatarUrl && /^https:\/\//.test(p.avatarUrl) ? p.avatarUrl : null,
  };
  await db()
    .insert(schema.blogAuthorProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.blogAuthorProfiles.userId, set: values });
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Markdown for a closed week's recap. Maker text is escaped. */
export async function recapMarkdown(weekKey: string) {
  const [board, awards] = await Promise.all([
    weekBoard(weekKey),
    db().query.awards.findMany({
      where: and(eq(schema.awards.scope, "week"), eq(schema.awards.periodKey, weekKey)),
      orderBy: (a, { asc }) => asc(a.place),
    }),
  ]);
  if (board.length === 0) return null;

  const label = formatWeekLabel(weekKey);
  const byId = new Map(board.map((p) => [p.id, p]));
  const winners = awards.map((a) => ({ a, p: byId.get(a.productId) })).filter((x) => x.p);
  const winnerIds = new Set(winners.map((w) => w.p!.id));
  const others = board.filter((p) => !winnerIds.has(p.id));
  const totalApplause = board.reduce((n, p) => n + p.debutApplause, 0);
  const name = (p: { name: string }) => escapeMarkdown(p.name);
  const line = (p: (typeof board)[number]) => `[${name(p)}](/p/${p.slug}): ${escapeMarkdown(p.tagline)}`;

  const top = winners[0]?.p;
  const title = top ? `${label} recap: ${top.name} takes Debut of the Week` : `${label} recap`;
  const parts = [
    `${board.length} product${board.length === 1 ? "" : "s"} debuted on DebutYard in ${label} (${formatWeekRange(weekKey)}), and the community gave ${totalApplause} clap${totalApplause === 1 ? "" : "s"}.`,
  ];
  if (winners.length) {
    parts.push(
      "## Debut of the Week",
      winners
        .map(({ a, p }) => `${MEDALS[a.place - 1] ?? `#${a.place}`} **${line(p!)}** (${p!.debutApplause} applause)`)
        .join("\n\n"),
    );
  }
  if (others.length) {
    parts.push(
      "## Also debuting",
      others
        .slice(0, 12)
        .map((p) => `- ${line(p)}`)
        .join("\n"),
    );
    if (others.length > 12) parts.push(`[See all ${board.length} debuts from ${label}](/week/${weekKey})`);
  }
  parts.push(
    "## Debut next",
    "A new class debuts every Monday. [Submit your product](/submit) or [applaud this week's debuts](/).",
  );
  return { title, body: parts.join("\n\n") };
}

/**
 * Drafts the recap for the week that just closed, once. Staff polish it (the
 * writer agent can add a line about each winner) and publish it by hand.
 */
export async function draftWeeklyRecap(now = new Date()) {
  const weekKey = addWeeks(weekKeyFor(now), -1);
  const week = await db().query.launchWeeks.findFirst({
    where: and(eq(launchWeeks.key, weekKey), isNotNull(launchWeeks.closedAt)),
  });
  if (!week) return { skipped: "week not closed" };
  if (await db().query.posts.findFirst({ where: eq(posts.weekKey, weekKey), columns: { id: true } })) {
    return { skipped: "already drafted" };
  }

  const recap = await recapMarkdown(weekKey);
  if (!recap) return { skipped: "no debuts" };
  let row: Post;
  try {
    row = await createPost({
      kind: "recap",
      weekKey,
      title: recap.title,
      excerpt: excerptFrom(recap.body),
      content: markdownToDoc(recap.body),
      categorySlug: "launches",
    });
  } catch (err) {
    if (err instanceof PostError && err.status === 409) return { skipped: "already drafted" };
    throw err;
  }
  await notifyRecapDrafted(row).catch((err) => console.error("recap draft email failed", err));
  return { drafted: row.slug };
}

/**
 * The facts a launch post starts from, as an outline for staff (or the writer
 * agent) to write up. Maker text is escaped.
 */
export async function launchMarkdown(productId: string) {
  const { products, productCategories, categories, productMedia, user } = schema;
  const [row] = await db()
    .select({ p: products, makerName: user.name })
    .from(products)
    .leftJoin(user, eq(user.id, products.createdBy))
    .where(eq(products.id, productId));
  if (!row) return null;
  const { p, makerName } = row;
  const [cats, shots] = await Promise.all([
    db()
      .select({ name: categories.name, slug: categories.slug })
      .from(productCategories)
      .innerJoin(categories, eq(categories.slug, productCategories.categorySlug))
      .where(eq(productCategories.productId, p.id)),
    db().query.productMedia.findMany({
      where: eq(productMedia.productId, p.id),
      orderBy: (m, { asc }) => asc(m.position),
    }),
  ]);

  const name = escapeMarkdown(p.name);
  const paragraphs = p.description
    .split(/\n\s*\n/)
    .map(escapeMarkdown)
    .filter(Boolean);
  const links = [
    `- Website: [${escapeMarkdown(p.domain)}](${withRef(p.websiteUrl)})`,
    `- On DebutYard: [${name}](/p/${p.slug})`,
    p.twitterUrl && `- X: ${p.twitterUrl}`,
    p.githubUrl && `- GitHub: ${p.githubUrl}`,
  ].filter(Boolean);
  const parts = [
    `**${name}**: ${escapeMarkdown(p.tagline)}`,
    "## What it does",
    ...paragraphs,
    ...shots.map((m, i) => `![${name} screenshot ${i + 1}](${m.url})`),
    "## Who's behind it",
    makerName ? `${name} is made by ${escapeMarkdown(makerName)}.` : "",
    "## Links",
    links.join("\n"),
  ].filter(Boolean);
  if (cats.length) {
    parts.push(`Filed under ${cats.map((c) => `[${escapeMarkdown(c.name)}](/category/${c.slug})`).join(", ")}.`);
  }
  return { title: `${p.name}: ${p.tagline}`.slice(0, 140), excerpt: p.tagline, body: parts.join("\n\n") };
}

/** Starts the launch post for a perk task, or returns the draft it already has. */
export async function startLaunchDraft(taskId: string, authorId: string): Promise<Post> {
  const task = await getPerkTask(taskId);
  if (!task || task.kind !== "launch_post") throw new PerkError("Launch post not found.");
  if (task.postId) {
    const existing = await getPost(task.postId);
    if (existing) return existing;
  }
  if (task.status === "done" || task.status === "skipped") throw new PerkError(`This launch post is ${task.status}.`);
  const outline = await launchMarkdown(task.productId);
  if (!outline) throw new PerkError("The listing is gone.");
  const row = await createPost({
    kind: "launch",
    title: outline.title,
    excerpt: outline.excerpt,
    content: markdownToDoc(outline.body),
    authorId,
    productId: task.productId,
    categorySlug: "launches",
  });
  await linkLaunchPost(task.id, row.id);
  return row;
}

/** Live posts that cover a product (its launch post first), for its page. */
export async function postsForProduct(productId: string) {
  const rows = await db()
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      coverUrl: posts.coverUrl,
      kind: posts.kind,
      publishedAt: posts.publishedAt,
      role: postProducts.role,
      id: posts.id,
    })
    .from(postProducts)
    .innerJoin(posts, eq(posts.id, postProducts.postId))
    .where(and(eq(postProducts.productId, productId), isLive()))
    .orderBy(desc(posts.publishedAt));
  const bylines = await bylinesFor(rows.filter((r) => r.role === "subject").map((r) => r.id));
  const launch = rows.find((r) => r.role === "subject") ?? null;
  return {
    launch: launch && { ...launch, authors: bylines.get(launch.id) ?? [] },
    featuredIn: rows.filter((r) => r.role !== "subject").slice(0, 6),
  };
}

/** How many live roundups a product appeared in recently; the agent spreads exposure with it. */
export async function recentRoundupCounts(productIds: string[], since: Date) {
  if (productIds.length === 0) return new Map<string, number>();
  const rows = await db()
    .select({ productId: postProducts.productId, n: sql<number>`count(*)::int` })
    .from(postProducts)
    .innerJoin(posts, eq(posts.id, postProducts.postId))
    .where(
      and(
        inArray(postProducts.productId, productIds),
        notInArray(posts.kind, ["launch", "recap"]),
        eq(posts.status, "published"),
        sql`${posts.publishedAt} >= ${since}`,
      ),
    )
    .groupBy(postProducts.productId);
  return new Map(rows.map((r) => [r.productId, r.n]));
}

// ---- Maker fact check ---------------------------------------------------------------

const REVIEW_HOURS = 48;

export async function latestMakerReview(postId: string): Promise<MakerReview | null> {
  const r = await db().query.makerReviews.findFirst({
    where: eq(schema.makerReviews.postId, postId),
    orderBy: desc(schema.makerReviews.requestedAt),
  });
  return r
    ? {
        status: r.status,
        notes: r.notes ?? "",
        requestedAt: r.requestedAt.toISOString(),
        respondedAt: r.respondedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt.toISOString(),
      }
    : null;
}

/**
 * Emails the maker a private preview of their launch post's working copy.
 * Answering is optional: the team can publish whenever they like.
 */
export async function requestMakerReview(postId: string, userId: string, now = new Date()): Promise<MakerReview> {
  const post = await getPost(postId);
  if (!post) throw new PostError("Post not found.", 404);
  if (post.kind !== "launch" || !post.productId) throw new PostError("Only launch posts go to the maker.");
  const product = await db().query.products.findFirst({ where: eq(schema.products.id, post.productId) });
  if (!product) throw new PostError("The listing is gone.", 404);
  const draft = await ensureDraft(post);
  const title = readFields(draft.fields).title || post.title;
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + REVIEW_HOURS * 3_600_000);
  await db().insert(schema.makerReviews).values({ postId, token, requestedBy: userId, requestedAt: now, expiresAt });
  await notifyMakerReview(product, { title }, `${siteUrl()}/blog/review/${token}`, expiresAt);
  return (await latestMakerReview(postId))!;
}

/** What the maker's preview page shows, or null when the link is wrong or has expired. */
export async function makerReviewByToken(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await db().query.makerReviews.findFirst({ where: eq(schema.makerReviews.token, token) });
  if (!r || r.expiresAt < now) return null;
  const post = await getPost(r.postId);
  if (!post) return null;
  const draft = await ensureDraft(post);
  const fields = readFields(draft.fields);
  const rendered = renderPostContent(fields.content_json, { linkPolicy: await linkPolicyFor(post) });
  const authors = (await bylinesFor([post.id])).get(post.id) ?? [];
  return {
    status: r.status,
    notes: r.notes ?? "",
    expiresAt: r.expiresAt,
    title: fields.title || post.title,
    excerpt: fields.excerpt,
    coverUrl: fields.cover_url,
    coverAlt: fields.cover_alt,
    html: rendered.html,
    authors,
  };
}

/** The maker approves or sends notes. Answering again replaces the earlier answer. */
export async function answerMakerReview(token: string, approved: boolean, notes: string, now = new Date()) {
  const r = await db().query.makerReviews.findFirst({ where: eq(schema.makerReviews.token, token) });
  if (!r || r.expiresAt < now) throw new PostError("This review link has expired.", 410);
  const clean = notes.trim().slice(0, 4000);
  if (!approved && clean.length < 3) throw new PostError("Tell us what to change.");
  await db()
    .update(schema.makerReviews)
    .set({ status: approved ? "approved" : "changes_requested", notes: clean || null, respondedAt: now })
    .where(eq(schema.makerReviews.id, r.id));
  const post = await getPost(r.postId);
  if (post) {
    await notifyMakerReviewAnswered(post, approved, clean).catch((err) =>
      console.error("maker review answer email failed", err),
    );
  }
}
