"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { countWords, textOf } from "@/lib/blog/content";
import { buildTargets, suggestInboundLinks, suggestInternalLinks } from "@/lib/blog/links";
import { authorProfileSchema, categorySchema, fieldsSchema, metaSchema, publishSchema } from "@/lib/blog/schema";
import {
  addAuthor,
  createCategory,
  createPost,
  deletePost,
  getAuthorProfile,
  getStaffPost,
  listCategories,
  listCorpus,
  listRevisions,
  PostError,
  publishPost,
  removeAuthor,
  requestMakerReview,
  restoreRevision,
  saveAuthorProfile,
  setFeatured,
  setSlug,
  unpublishPost,
} from "@/lib/blog/service";
import { siteUrl } from "@/lib/blog/site-url";
import type { PostKind, StaffPost } from "@/lib/blog/types";
import { createUploadUrl } from "@/lib/storage";

/** Every editor call returns this; the client turns failures into a BlogApiError. */
export type ActionResult<T> =
  ({ ok: true } & T) | { ok: false; error: string; status: number; data?: Record<string, unknown> };

type Staff = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const uuid = z.string().uuid();

async function run<T>(fn: (user: Staff) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user || !(await isStaff(user))) return { ok: false, error: "Not allowed.", status: 403 };
  try {
    return { ok: true, ...(await fn(user)) };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { ok: false, error: err.issues[0]?.message ?? "Check the form.", status: 400 };
    if (err instanceof PostError) return { ok: false, error: err.message, status: err.status, data: err.data };
    throw err;
  }
}

const postId = (id: string) => {
  if (!uuid.safeParse(id).success) throw new PostError("Post not found.", 404);
  return id;
};

async function staffPost(id: string): Promise<StaffPost> {
  const post = await getStaffPost(id);
  if (!post) throw new PostError("Post not found.", 404);
  return post;
}

const kinds = z.enum(["post", "recap", "launch", "roundup", "comparison", "alternatives"]);

export async function createPostAction(input: { title?: string; kind?: PostKind }) {
  return run(async (user) => {
    const { title, kind } = z
      .object({ title: z.string().trim().max(200).optional(), kind: kinds.optional() })
      .parse(input);
    const row = await createPost({ title, kind, authorId: user.id });
    refresh();
    return { id: row.id };
  });
}

export async function getPostAction(id: string) {
  return run(async () => ({ post: await staffPost(postId(id)) }));
}

export async function publishAction(id: string, publishedAt?: string | null) {
  return run(async (user) => {
    const { publishedAt: at } = publishSchema.parse({ publishedAt });
    await publishPost(postId(id), user.id, { publishedAt: at ? new Date(at) : null });
    refresh();
    return { post: await staffPost(id) };
  });
}

export async function unpublishAction(id: string) {
  return run(async () => {
    await unpublishPost(postId(id));
    refresh();
    return { post: await staffPost(id) };
  });
}

export async function metaAction(id: string, input: { slug?: string; featured?: boolean }) {
  return run(async () => {
    const m = metaSchema.parse(input);
    if (m.slug !== undefined) await setSlug(postId(id), m.slug);
    if (m.featured !== undefined) await setFeatured(postId(id), m.featured);
    refresh();
    return { post: await staffPost(id) };
  });
}

export async function deletePostAction(id: string) {
  return run(async () => {
    await deletePost(postId(id));
    refresh();
    return {};
  });
}

export async function revisionsAction(id: string) {
  return run(async () => ({ revisions: await listRevisions(postId(id)) }));
}

export async function restoreAction(id: string, revisionId: string) {
  return run(async (user) => {
    if (!uuid.safeParse(revisionId).success) throw new PostError("That version is gone.", 404);
    await restoreRevision(postId(id), revisionId, user.id);
    return {};
  });
}

export async function corpusAction() {
  return run(async () => {
    const [corpus, categories] = await Promise.all([listCorpus(), listCategories()]);
    const tags = [...new Set(corpus.flatMap((c) => c.tags))].sort();
    // The body text is only for server-side link discovery; keep it out of the page.
    return { corpus: corpus.map((c) => ({ ...c, text: undefined })), categories, tags };
  });
}

const linksInput = z.object({
  slug: z.string().max(100),
  fields: fieldsSchema.pick({
    title: true,
    content_json: true,
    focus_keyword: true,
    secondary_keywords: true,
    cluster: true,
  }),
});

/**
 * Interlinking opportunities for the article as it reads in the editor: phrases
 * here that should link somewhere, and other posts that should link here.
 */
export async function linksAction(input: z.input<typeof linksInput>) {
  return run(async () => {
    const { slug, fields } = linksInput.parse(input);
    const corpus = await listCorpus();
    const outbound = suggestInternalLinks({
      doc: fields.content_json,
      targets: buildTargets(corpus, slug),
      siteHost: new URL(siteUrl()).hostname,
      selfCluster: fields.cluster,
      wordCount: countWords(textOf(fields.content_json)),
    });
    const inbound = suggestInboundLinks({
      self: {
        slug,
        title: fields.title,
        focusKeyword: fields.focus_keyword,
        secondaryKeywords: fields.secondary_keywords,
      },
      corpus,
    });
    return { outbound, inbound };
  });
}

export async function createCategoryAction(name: string) {
  return run(async () => {
    const c = categorySchema.parse({ name });
    return { category: await createCategory(c.name, c.description) };
  });
}

export async function addAuthorAction(id: string, query: string, role: "team" | "maker") {
  return run(async () => {
    await addAuthor(postId(id), z.string().max(200).parse(query), z.enum(["team", "maker"]).parse(role));
    return { post: await staffPost(id) };
  });
}

export async function removeAuthorAction(id: string, userId: string) {
  return run(async () => {
    await removeAuthor(postId(id), z.string().min(1).max(100).parse(userId));
    return { post: await staffPost(id) };
  });
}

export async function myAuthorAction() {
  return run(async (user) => ({ author: await getAuthorProfile(user.id) }));
}

export async function saveMyAuthorAction(input: {
  name?: string;
  role?: string;
  bio?: string;
  avatarUrl?: string | null;
}) {
  return run(async (user) => {
    const current = await getAuthorProfile(user.id);
    const p = authorProfileSchema.parse(input);
    await saveAuthorProfile(user.id, {
      name: p.name ?? current.name,
      role: p.role ?? current.role,
      bio: p.bio ?? current.bio,
      avatarUrl: p.avatarUrl === undefined ? current.avatarUrl : p.avatarUrl,
    });
    return { author: await getAuthorProfile(user.id) };
  });
}

/** A presigned R2 PUT for an image in the article body or the cover. */
export async function uploadUrlAction(contentType: string, size: number) {
  return run(async () => {
    try {
      const { uploadUrl, publicUrl } = await createUploadUrl({ folder: "blog", contentType, contentLength: size });
      return { uploadUrl, publicUrl };
    } catch (err) {
      throw new PostError(err instanceof Error ? err.message : "Upload failed.");
    }
  });
}

/** Sends the maker a 48-hour preview link; their notes come back to the editor. */
export async function requestMakerReviewAction(id: string) {
  return run(async (user) => {
    const review = await requestMakerReview(postId(id), user.id);
    return { review };
  });
}
