/**
 * "Is this listing indexed by Google?" through a SERP API. Each provider's
 * response is parsed by a pure function so the mapping is unit-tested.
 */

export type SerpProviderId = "serpapi" | "dataforseo";

export interface SerpProvider {
  readonly id: SerpProviderId;
  isIndexed(url: string): Promise<boolean>;
}

export class SerpError extends Error {
  /** The search engine or provider failed this time. Unlike a bad key or an empty balance, trying again can help. */
  constructor(
    message: string,
    readonly transient = false,
  ) {
    super(message);
  }
}

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

const includes = (links: unknown[], url: string) => {
  const want = normalizeForSerp(url);
  return links.some((l) => typeof l === "string" && normalizeForSerp(l) === want);
};

/** What DataForSEO said, for whoever reads the error. It reports most failures with a normal HTTP 200. */
function taskFailure(body: unknown) {
  const b = body as {
    status_code?: number;
    status_message?: string;
    tasks?: Array<{ status_code?: number; status_message?: string }>;
  };
  const task = b.tasks?.[0];
  const code = task?.status_code ?? b.status_code;
  const message = task?.status_message ?? b.status_message;
  return new SerpError(
    `DataForSEO SERP task failed${code ? ` (${code})` : ""}${message ? `: ${message}` : ""}`,
    // 40101: the search engine returned an error. 5xxxx: DataForSEO's own trouble.
    code === 40101 || (code !== undefined && code >= 50000),
  );
}

export function parseSerpApi(body: unknown, url: string): boolean {
  const b = body as { error?: string; organic_results?: Array<{ link?: string }> };
  if (b.error && !/hasn't returned any results/i.test(b.error)) throw new SerpError(`SerpApi: ${b.error}`);
  return includes(
    (b.organic_results ?? []).map((r) => r.link),
    url,
  );
}

export function parseDataForSeoSerp(body: unknown, url: string): boolean {
  const task = (
    body as {
      tasks?: Array<{ status_code?: number; result?: Array<{ items?: Array<{ type?: string; url?: string }> }> }>;
    }
  ).tasks?.[0];
  if (!task || (task.status_code && task.status_code >= 40000)) throw taskFailure(body);
  const items = task.result?.[0]?.items ?? [];
  return includes(
    items.filter((i) => i.type === "organic").map((i) => i.url),
    url,
  );
}

export type SerpResult = { position: number; url: string; title: string; description: string };

export function parseSerpApiTop(body: unknown): SerpResult[] {
  const b = body as {
    error?: string;
    organic_results?: Array<{ position?: number; link?: string; title?: string; snippet?: string }>;
  };
  if (b.error && !/hasn't returned any results/i.test(b.error)) throw new SerpError(`SerpApi: ${b.error}`);
  return (b.organic_results ?? []).flatMap((r, i) =>
    r.link ? [{ position: r.position ?? i + 1, url: r.link, title: r.title ?? "", description: r.snippet ?? "" }] : [],
  );
}

export function parseDataForSeoTop(body: unknown): SerpResult[] {
  const task = (
    body as {
      tasks?: Array<{
        status_code?: number;
        result?: Array<{
          items?: Array<{
            type?: string;
            rank_group?: number;
            url?: string;
            title?: string;
            description?: string;
          }>;
        }>;
      }>;
    }
  ).tasks?.[0];
  if (!task || (task.status_code && task.status_code >= 40000)) throw taskFailure(body);
  return (task.result?.[0]?.items ?? []).flatMap((r, i) =>
    r.type === "organic" && r.url
      ? [{ position: r.rank_group ?? i + 1, url: r.url, title: r.title ?? "", description: r.description ?? "" }]
      : [],
  );
}

const isTransient = (err: unknown) =>
  (err instanceof SerpError && err.transient) || (err instanceof Error && err.name === "TimeoutError");

/**
 * One search, tried twice if it fails in a way that can pass. Gives the error
 * back rather than throwing it, so a caller with other searches can carry on. A
 * failure that won't pass, like a bad key or an empty balance, still throws.
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

/** Who ranks for a search right now, for cold outreach: top organic results, United States, English. */
export function createSerpSearch(id: SerpProviderId, apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (keyword: string): Promise<SerpResult[]> => {
    if (id === "serpapi") {
      const q = new URLSearchParams({ engine: "google", q: keyword, num: "10", api_key: apiKey });
      const res = await fetchImpl(`https://serpapi.com/search.json?${q}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new SerpError(`SerpApi returned HTTP ${res.status}`, res.status >= 500);
      return parseSerpApiTop(await res.json());
    }
    const res = await fetchImpl("https://api.dataforseo.com/v3/serp/google/organic/live/regular", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keyword, location_code: 2840, language_code: "en", depth: 10 }]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new SerpError(`DataForSEO returned HTTP ${res.status}`, res.status >= 500);
    return parseDataForSeoTop(await res.json());
  };
}

export function createSerpProvider(id: SerpProviderId, apiKey: string, fetchImpl: typeof fetch = fetch): SerpProvider {
  const timeout = () => AbortSignal.timeout(20_000);
  const ok = async (res: Response, name: string) => {
    if (!res.ok) throw new SerpError(`${name} returned HTTP ${res.status}`);
    return res.json();
  };
  switch (id) {
    case "serpapi":
      return {
        id,
        async isIndexed(url) {
          const q = new URLSearchParams({ engine: "google", q: serpQuery(url), num: "10", api_key: apiKey });
          const res = await fetchImpl(`https://serpapi.com/search.json?${q}`, { signal: timeout() });
          return parseSerpApi(await ok(res, "SerpApi"), url);
        },
      };
    case "dataforseo":
      return {
        id,
        async isIndexed(url) {
          const res = await fetchImpl("https://api.dataforseo.com/v3/serp/google/organic/live/regular", {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([{ keyword: serpQuery(url), location_code: 2840, language_code: "en", depth: 10 }]),
            signal: timeout(),
          });
          return parseDataForSeoSerp(await ok(res, "DataForSEO"), url);
        },
      };
  }
}
