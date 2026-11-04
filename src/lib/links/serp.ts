/**
 * Google results from our own OpenSERP (workers/openserp), reached through the
 * worker's /search. The response is parsed by pure functions so the mapping is
 * unit-tested. Google blocks and misleads scrapers, so a response only counts
 * if it plainly looks like real results.
 */

export interface SerpProvider {
  isIndexed(url: string): Promise<boolean>;
}

export class SerpError extends Error {
  /** The search engine or OpenSERP failed this time. Unlike a bad secret, trying again can help. */
  constructor(
    message: string,
    readonly transient = false,
  ) {
    super(message);
  }
}

/** Searches are failing right now, probably a block. Not the business's fault, and no use trying the next one. */
export class SearchDownError extends Error {}

/** Compares URLs the way a SERP shows them: no scheme, no www, no trailing slash, case-insensitive host. */
export function normalizeForSerp(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** The query: `site:` the exact listing page. */
export const serpQuery = (url: string) => `site:${normalizeForSerp(url)}`;

export type SerpResult = { position: number; url: string; title: string; description: string };

/**
 * Google hides the destination behind /goto or /url when it suspects a bot, and
 * OpenSERP passes that along for a while after Google pushes back. Reading those
 * as results would make Google the top "competitor" for every search.
 */
function isWrappedLink(raw: string) {
  try {
    const u = new URL(raw);
    return /(^|\.)google\.[a-z.]+$/i.test(u.hostname) && /^\/(goto|url)\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** The organic results. Throws when OpenSERP says an engine failed, or Google hid the links. */
export function parseOpenSerp(body: unknown): SerpResult[] {
  const b = body as {
    meta?: { engines_failed?: unknown[] };
    results?: Array<{ rank?: number; type?: string; url?: string; title?: string; snippet?: string }>;
  };
  if (b.meta?.engines_failed?.length) throw new SerpError("OpenSERP: the search engine failed", true);
  if (!Array.isArray(b.results)) throw new SerpError("OpenSERP returned no results list", true);
  const organic = b.results.filter((r) => r.type === "organic" && r.url);
  if (organic.some((r) => isWrappedLink(r.url!))) throw new SerpError("OpenSERP: Google hid the result links", true);
  return organic.map((r, i) => ({
    position: r.rank ?? i + 1,
    url: r.url!,
    title: r.title ?? "",
    description: r.snippet ?? "",
  }));
}

/** Whether the exact page is in the results. No results is a real answer to a `site:` search. */
export function parseOpenSerpIndexed(body: unknown, url: string): boolean {
  const want = normalizeForSerp(url);
  return parseOpenSerp(body).some((r) => normalizeForSerp(r.url) === want);
}

const isTransient = (err: unknown) =>
  (err instanceof SerpError && err.transient) || (err instanceof Error && err.name === "TimeoutError");

/**
 * One search, tried twice if it fails in a way that can pass. Gives the error
 * back rather than throwing it, so a caller with other searches can carry on. A
 * failure that won't pass, like a bad secret, still throws.
 */
export async function searchOrError<T>(
  search: (keyword: string) => Promise<T>,
  keyword: string,
  waitMs = 2000,
): Promise<{ rows: T } | { error: Error }> {
  try {
    return { rows: await search(keyword) };
  } catch (err) {
    if (!isTransient(err)) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  try {
    return { rows: await search(keyword) };
  } catch (err) {
    if (!isTransient(err)) throw err;
    return { error: err as Error };
  }
}

/** OpenSERP drives a real browser and has its own retry, so it gets longer than a normal API call. */
const SEARCH_TIMEOUT_MS = 45_000;

/** What OpenSERP or the worker said went wrong, for whoever reads the error. */
async function failureReason(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
  const reason = body?.message ?? body?.error;
  return typeof reason === "string" && reason.trim() ? `: ${reason.trim().slice(0, 300)}` : "";
}

async function askWorker(workerUrl: string, secret: string, text: string, fetchImpl: typeof fetch) {
  const res = await fetchImpl(new URL("/search", workerUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, limit: 10 }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  }).catch((err) => {
    if (err instanceof Error && err.name === "TimeoutError") throw err;
    // The worker being down isn't the business's fault, so it mustn't count against one.
    throw new SerpError(`Couldn't reach the worker: ${err instanceof Error ? err.message : String(err)}`, true);
  });
  // 403 and 429 are Google or OpenSERP refusing for now. A 401 is our secret, and won't pass.
  if (!res.ok) {
    throw new SerpError(
      `OpenSERP returned HTTP ${res.status}${await failureReason(res)}`,
      res.status >= 500 || res.status === 403 || res.status === 429,
    );
  }
  return res.json();
}

/** Who ranks for a search right now, for cold outreach: top organic results, United States, English. */
export function createSerpSearch(workerUrl: string, secret: string, fetchImpl: typeof fetch = fetch) {
  return async (keyword: string): Promise<SerpResult[]> => {
    const rows = parseOpenSerp(await askWorker(workerUrl, secret, keyword, fetchImpl));
    // A real search phrase always has results. None means a block, and mustn't read as "no competitors".
    if (rows.length === 0) throw new SerpError("OpenSERP returned no results", true);
    return rows;
  };
}

export function createSerpProvider(workerUrl: string, secret: string, fetchImpl: typeof fetch = fetch): SerpProvider {
  return {
    async isIndexed(url) {
      return parseOpenSerpIndexed(await askWorker(workerUrl, secret, serpQuery(url), fetchImpl), url);
    },
  };
}
