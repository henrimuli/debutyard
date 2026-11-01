import "server-only";
import { env } from "@/env";
import { assertPublicUrl, safeFetchText, UnsafeUrlError, type FetchOpts, type SafeResponse } from "@/lib/net";

/**
 * Fetches a page directly, then through Firecrawl if the direct fetch was turned
 * away, failed or (when reading content) came back nearly empty. Needs
 * FIRECRAWL_API_KEY; without it, or when Firecrawl fails, the direct result stands.
 * URLs that fail the SSRF check never reach Firecrawl.
 */

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const DAY = 86_400_000;
const MAX_BYTES = 1_500_000;
/** Below this much visible text, a page is probably rendered by JavaScript. */
const THIN_PAGE_CHARS = 200;

/**
 * verify: is this page up, does it link to us? Always a fresh copy, kept out of Firecrawl's cache.
 * read: its content, for someone waiting. A shorter wait, a recent copy is fine, and a near-empty page is retried.
 */
export type PagePurpose = "verify" | "read";

const FIRECRAWL_MS: Record<PagePurpose, number> = { verify: 30_000, read: 15_000 };

export type PageResult = SafeResponse & {
  via: "direct" | "firecrawl";
  /** All we have is a bot wall (401, 403, 429 or a challenge page), which says nothing about the site itself. */
  blocked: boolean;
  /** The direct fetch hit a bot wall or a 503, whichever way it ended. */
  directBlocked: boolean;
  /** Main content as markdown, when asked for and Firecrawl fetched the page. */
  markdown?: string;
};

export type FetchPageOpts = FetchOpts & {
  purpose: PagePurpose;
  /** Also ask Firecrawl for the main content as markdown. */
  markdown?: boolean;
  /** Direct only, e.g. for a site's secondary pages once its homepage needed no help. */
  fallback?: boolean;
};

const WALL_STATUSES = new Set([401, 403, 429]);
const CHALLENGE_TITLE = /<title[^>]*>\s*(just a moment|attention required)/i;

/** A bot wall: the site refused the visitor, not the page. */
export function isBotWall(res: Pick<SafeResponse, "status" | "body">): boolean {
  return WALL_STATUSES.has(res.status) || CHALLENGE_TITLE.test(res.body.slice(0, 5000));
}

/** Almost no visible text once scripts, styles and tags are gone. */
export function isThinPage(res: Pick<SafeResponse, "status" | "contentType" | "body">): boolean {
  if (res.status >= 400 || !res.contentType.includes("html")) return false;
  const text = res.body
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < THIN_PAGE_CHARS;
}

const turnedAway = (res: SafeResponse) => res.status === 503 || isBotWall(res);

type Scraped = SafeResponse & { markdown?: string };

type FirecrawlBody = {
  success?: boolean;
  error?: string;
  data?: {
    rawHtml?: string;
    markdown?: string;
    metadata?: { statusCode?: number; url?: string; sourceURL?: string; contentType?: string };
  };
};

/** One Firecrawl scrape. Returns null on any failure (out of credits, rate limited, down): the fallback only ever helps. */
async function scrape(raw: string, key: string, opts: FetchPageOpts): Promise<Scraped | null> {
  const { purpose, markdown, maxBytes = MAX_BYTES, resolve, fetchImpl = fetch } = opts;
  const timeout = FIRECRAWL_MS[purpose];
  try {
    await assertPublicUrl(raw, resolve);
    const res = await fetchImpl(FIRECRAWL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url: raw,
        formats: markdown ? ["rawHtml", "markdown"] : ["rawHtml"],
        timeout,
        ...(markdown ? { onlyMainContent: true } : {}),
        ...(purpose === "verify" ? { maxAge: 0, storeInCache: false } : { maxAge: DAY }),
      }),
      // A little longer than Firecrawl's own limit, so it can answer with its error.
      signal: AbortSignal.timeout(timeout + 2000),
    });
    const body = (await res.json().catch(() => null)) as FirecrawlBody | null;
    const html = body?.data?.rawHtml;
    if (!res.ok || !body?.success || !html) {
      console.error("firecrawl failed", raw, res.status, body?.error ?? "");
      return null;
    }
    const meta = body.data?.metadata;
    return {
      url: meta?.url ?? meta?.sourceURL ?? raw,
      status: meta?.statusCode ?? 200,
      contentType: meta?.contentType ?? "text/html",
      body: html.slice(0, maxBytes),
      markdown: body.data?.markdown,
    };
  } catch (err) {
    console.error("firecrawl failed", raw, err);
    return null;
  }
}

/**
 * GETs a page like safeFetchText, with the fallback. Throws what the direct fetch
 * threw when neither route got an answer; UnsafeUrlError always throws.
 */
export async function fetchPage(raw: string, opts: FetchPageOpts): Promise<PageResult> {
  const { purpose, fallback = true } = opts;
  let direct: SafeResponse | null = null;
  let failure: unknown;
  try {
    direct = await safeFetchText(raw, opts);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    failure = err;
  }
  const directBlocked = direct ? turnedAway(direct) : false;
  const key = env().FIRECRAWL_API_KEY;
  const worthTrying = !direct || directBlocked || (purpose === "read" && isThinPage(direct));
  const scraped = key && fallback && worthTrying ? await scrape(raw, key, opts) : null;

  if (scraped && !turnedAway(scraped)) {
    // A direct page that loaded but looked thin only gives way to one that loaded too.
    if (!direct || directBlocked || scraped.status < 400) {
      return { ...scraped, via: "firecrawl", blocked: false, directBlocked };
    }
  }
  if (direct) return { ...direct, via: "direct", blocked: isBotWall(direct), directBlocked };
  if (scraped) return { ...scraped, via: "firecrawl", blocked: isBotWall(scraped), directBlocked };
  throw failure;
}
