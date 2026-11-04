/**
 * Domain Rating from Ahrefs' free endpoint. The response is parsed by a pure
 * function so the mapping is unit-tested.
 */

export type DrReading = { dr: number };

/**
 * What domain_metrics.provider says for these readings. Rows from earlier
 * providers stay in the table, on another scale, so reads only take this one.
 */
export const DR_SOURCE = "ahrefs";

/**
 * Ahrefs' licence asks for this credit next to any Domain Rating we show, with
 * "Ahrefs" as a working link. On the page, that's <DrAttribution />.
 */
export const DR_ATTRIBUTION = {
  text: "Domain Rating by Ahrefs",
  url: "https://ahrefs.com/",
  license: "https://ahrefs.com/legal/domain-rating-license",
} as const;

/** The credit where a link can't go, like a CSV heading. */
export const DR_ATTRIBUTION_PLAIN = `${DR_ATTRIBUTION.text} (${DR_ATTRIBUTION.url})`;

export interface DrProvider {
  fetchDr(domain: string): Promise<DrReading>;
}

type FetchLike = typeof fetch;

export class DrProviderError extends Error {}
/** Ahrefs asked us to slow down. The licence rules out working around that, so a run stops here. */
export class DrRateLimitError extends DrProviderError {}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

export function parseAhrefs(body: unknown): DrReading {
  const dr = (body as { domain_rating?: { domain_rating?: number } }).domain_rating?.domain_rating;
  if (typeof dr !== "number") throw new DrProviderError("Ahrefs returned no domain rating");
  return { dr: clamp(dr) };
}

export function createAhrefsProvider(apiKey: string, fetchImpl: FetchLike = fetch): DrProvider {
  return {
    async fetchDr(domain) {
      // The version is pinned so a change to Ahrefs' default can't move every score at once.
      const q = new URLSearchParams({ target: domain, version: "dr3", output: "json" });
      const res = await fetchImpl(`https://api.ahrefs.com/v3/public/domain-rating-free?${q}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429) throw new DrRateLimitError("Ahrefs returned HTTP 429");
      if (!res.ok) throw new DrProviderError(`Ahrefs returned HTTP ${res.status}`);
      return parseAhrefs(await res.json());
    },
  };
}

/** How big a drop (in DR points, since the previous snapshot) triggers an alert. */
export const DR_DROP_ALERT = 5;

export type DrPoint = { at: Date; dr: number };

/** "Domain Rating 7 → 19 since intake": first and latest reading, and the change. */
export function drChange(points: DrPoint[]): { from: number; to: number; delta: number } | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const from = sorted[0].dr;
  const to = sorted[sorted.length - 1].dr;
  return { from, to, delta: Math.round((to - from) * 10) / 10 };
}

/** SVG polyline points for a line chart in a `w`×`h` box with `pad` inside. Pure. */
export function chartPoints(points: DrPoint[], w: number, h: number, pad = 4): Array<[number, number]> {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const t0 = sorted[0].at.getTime();
  const span = sorted[sorted.length - 1].at.getTime() - t0 || 1;
  const values = sorted.map((p) => p.dr);
  const lo = Math.max(0, Math.min(...values) - 5);
  const hi = Math.min(100, Math.max(...values) + 5);
  const range = hi - lo || 1;
  return sorted.map((p) => [
    Math.round((pad + ((p.at.getTime() - t0) / span) * (w - 2 * pad)) * 10) / 10,
    Math.round((h - pad - ((p.dr - lo) / range) * (h - 2 * pad)) * 10) / 10,
  ]);
}
