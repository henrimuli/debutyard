import {
  addAuthorAction,
  corpusAction,
  createCategoryAction,
  createPostAction,
  deletePostAction,
  getPostAction,
  linksAction,
  metaAction,
  myAuthorAction,
  publishAction,
  removeAuthorAction,
  requestMakerReviewAction,
  restoreAction,
  revisionsAction,
  saveMyAuthorAction,
  unpublishAction,
  uploadUrlAction,
  type ActionResult,
} from "@/app/admin/blog/actions";
import type { AiRequestInput } from "@/lib/blog/ai/request";
import { STREAM_ERROR_MARKER, STREAM_STATUS_MARKER, type AiResult } from "@/lib/blog/ai/types";
import type { BlogFields } from "@/lib/blog/types";

/** Browser-side wrappers for the editor's server actions and the writer agent. Errors carry the server's message. */

export class BlogApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  let r: ActionResult<T>;
  try {
    r = await p;
  } catch {
    throw new BlogApiError(0, "You appear to be offline, or the server had a problem. Try again.");
  }
  if (!r.ok) throw new BlogApiError(r.status, r.error, r.data);
  return r;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new BlogApiError(res.status, typeof body.error === "string" ? body.error : "Request failed.", body);
  return body as T;
}

export type SaveResult = { version: number; updatedAt: string; seoScore: number | null };
export type Revision = Awaited<ReturnType<typeof blogApi.revisions>>["revisions"][number];
export type AuthorProfile = Awaited<ReturnType<typeof blogApi.myAuthor>>["author"];

/** Reads an image's pixel size in the browser, so uploads carry width and height. */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const blogApi = {
  createPost: (input: Parameters<typeof createPostAction>[0] = {}) => unwrap(createPostAction(input)),
  getPost: (id: string) => unwrap(getPostAction(id)),
  save: async (
    id: string,
    body: { baseVersion: number; fields: Partial<BlogFields>; manual?: boolean },
    keepalive = false,
  ) => {
    let res: Response;
    try {
      res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive,
      });
    } catch {
      throw new BlogApiError(0, "You appear to be offline.");
    }
    return json<SaveResult>(res);
  },
  remove: (id: string) => unwrap(deletePostAction(id)),
  publish: (id: string, publishedAt?: string | null) => unwrap(publishAction(id, publishedAt)),
  unpublish: (id: string) => unwrap(unpublishAction(id)),
  meta: (id: string, body: { slug?: string; featured?: boolean }) => unwrap(metaAction(id, body)),
  revisions: (id: string) => unwrap(revisionsAction(id)),
  restore: (id: string, revisionId: string) => unwrap(restoreAction(id, revisionId)),
  corpus: () => unwrap(corpusAction()),
  links: (input: Parameters<typeof linksAction>[0]) => unwrap(linksAction(input)),
  createCategory: (name: string) => unwrap(createCategoryAction(name)),
  addAuthor: (id: string, query: string, role: "team" | "maker") => unwrap(addAuthorAction(id, query, role)),
  removeAuthor: (id: string, userId: string) => unwrap(removeAuthorAction(id, userId)),
  myAuthor: () => unwrap(myAuthorAction()),
  saveMyAuthor: (input: Parameters<typeof saveMyAuthorAction>[0]) => unwrap(saveMyAuthorAction(input)),
  requestMakerReview: (id: string) => unwrap(requestMakerReviewAction(id)),
  upload: async (file: File) => {
    const { uploadUrl, publicUrl } = await unwrap(uploadUrlAction(file.type, file.size));
    const [size, put] = await Promise.all([
      imageSize(file),
      fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null),
    ]);
    if (!put?.ok) throw new BlogApiError(put?.status ?? 0, "The upload didn't go through. Try again.");
    return { url: publicUrl, width: size.width || null, height: size.height || null };
  },
  aiHealth: async () => json<{ gemini: unknown; keywords: unknown }>(await fetch("/api/admin/blog/ai/health")),
  ai: async (body: AiRequestInput, signal?: AbortSignal): Promise<AiResult> => {
    let res: Response;
    try {
      res = await fetch("/api/admin/blog/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new BlogApiError(0, "You appear to be offline.");
    }
    return (await json<{ result: AiResult }>(res)).result;
  },
};

/**
 * Streams a text action (draft, revise, write, rewrite, chat). `onText` gets the
 * content so far with progress lines removed; `onStatus` gets the latest progress
 * line ("Reading the product's site…"). Resolves with the final content.
 */
export async function streamAi(
  body: AiRequestInput,
  onText: (textSoFar: string) => void,
  opts: { signal?: AbortSignal; onStatus?: (status: string) => void } = {},
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/admin/blog/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new BlogApiError(0, "You appear to be offline.");
  }
  if (!res.ok || !res.body) await json(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let content = "";
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const cut = raw.indexOf(STREAM_ERROR_MARKER);
    if (cut !== -1) {
      throw new BlogApiError(
        502,
        raw.slice(cut + STREAM_ERROR_MARKER.length).trim() || "The writer stopped unexpectedly.",
      );
    }
    // Progress lines come first and end in a newline; content follows them.
    while (raw.startsWith(STREAM_STATUS_MARKER, seen)) {
      const end = raw.indexOf("\n", seen);
      if (end === -1) break;
      opts.onStatus?.(raw.slice(seen + STREAM_STATUS_MARKER.length, end).trim());
      seen = end + 1;
    }
    if (raw.startsWith(STREAM_STATUS_MARKER, seen)) continue;
    const next = raw.slice(seen);
    if (next !== content) {
      content = next;
      onText(content);
    }
  }
  return content;
}

export function describeAiError(e: unknown): string {
  if (e instanceof BlogApiError) return e.message;
  if (e instanceof DOMException && e.name === "AbortError") return "Stopped.";
  return `Something went wrong${e instanceof Error && e.message ? ` (${e.message})` : ""}. Try again.`;
}

/** The slice of the article the writer agent needs (the server defaults the rest). */
export function aiFields(f: BlogFields) {
  return {
    title: f.title,
    seo_title: f.seo_title,
    seo_description: f.seo_description,
    excerpt: f.excerpt,
    focus_keyword: f.focus_keyword,
    secondary_keywords: f.secondary_keywords,
    tags: f.tags,
    category_id: f.category_id,
    content_json: f.content_json,
    faq: f.faq,
    cluster: f.cluster,
    is_pillar: f.is_pillar,
    cover_url: f.cover_url,
    cover_alt: f.cover_alt,
  };
}
