import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { adsConfigured, generateKeywordIdeas, type KeywordIdea } from "./google-ads";

/**
 * Keyword signals for the writer agent, all real data:
 * - search volume and competition from Google Keyword Planner (cached 30 days),
 * - Google autocomplete, which shows a phrase people actually type,
 * (what currently ranks comes from grounded search, see ai/actions).
 */

const CACHE_DAYS = 30;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export type KeywordData = {
  keyword: string;
  volume: number | null;
  competition: KeywordIdea["competition"];
  competitionIndex: number | null;
};

/** Volume and competition for each keyword, from the cache or Keyword Planner. Never throws. */
export async function keywordMetrics(
  keywords: string[],
): Promise<{ data: Map<string, KeywordData>; available: boolean }> {
  const wanted = [...new Set(keywords.map(norm).filter(Boolean))].slice(0, 60);
  const data = new Map<string, KeywordData>();
  if (wanted.length === 0) return { data, available: adsConfigured() };
  const fresh = Date.now() - CACHE_DAYS * 86_400_000;
  const cached = await db()
    .select()
    .from(schema.keywordMetrics)
    .where(inArray(schema.keywordMetrics.keyword, wanted))
    .catch(() => []);
  for (const c of cached) {
    if (c.fetchedAt.getTime() < fresh) continue;
    data.set(c.keyword, {
      keyword: c.keyword,
      volume: c.avgMonthlySearches,
      competition: (c.competition as KeywordIdea["competition"]) ?? "UNKNOWN",
      competitionIndex: c.competitionIndex,
    });
  }
  const missing = wanted.filter((k) => !data.has(k));
  if (missing.length === 0) return { data, available: true };
  if (!adsConfigured()) return { data, available: data.size > 0 };

  const ideas: KeywordIdea[] = [];
  for (let i = 0; i < missing.length; i += 20) ideas.push(...(await generateKeywordIdeas(missing.slice(i, i + 20))));
  // Keyword Planner returns related ideas too; keep them all, they're useful later.
  const rows = new Map<string, typeof schema.keywordMetrics.$inferInsert>();
  for (const idea of ideas) {
    const k = norm(idea.keyword);
    if (!k) continue;
    rows.set(k, {
      keyword: k,
      avgMonthlySearches: idea.avgMonthlySearches,
      competition: idea.competition,
      competitionIndex: idea.competitionIndex,
      fetchedAt: new Date(),
    });
    data.set(k, {
      keyword: k,
      volume: idea.avgMonthlySearches,
      competition: idea.competition,
      competitionIndex: idea.competitionIndex,
    });
  }
  // A keyword Planner knows nothing about is cached as "no volume" so it isn't asked again.
  if (ideas.length > 0) {
    for (const k of missing) {
      if (!rows.has(k))
        rows.set(k, { keyword: k, avgMonthlySearches: 0, competition: "UNKNOWN", fetchedAt: new Date() });
      if (!data.has(k)) data.set(k, { keyword: k, volume: 0, competition: "UNKNOWN", competitionIndex: null });
    }
    const values = [...rows.values()];
    for (let i = 0; i < values.length; i += 200) {
      await db()
        .insert(schema.keywordMetrics)
        .values(values.slice(i, i + 200))
        .onConflictDoUpdate({
          target: schema.keywordMetrics.keyword,
          set: {
            avgMonthlySearches: schema.keywordMetrics.avgMonthlySearches,
            competition: schema.keywordMetrics.competition,
            competitionIndex: schema.keywordMetrics.competitionIndex,
            fetchedAt: new Date(),
          },
        })
        .catch((err) => console.error("[blog keywords] cache write failed", err));
    }
  }
  return { data, available: ideas.length > 0 || data.size > 0 };
}

/** Google's autocomplete suggestions for a phrase (free, unauthenticated). Empty on any failure. */
export async function autocomplete(seed: string): Promise<string[]> {
  const q = seed.trim().slice(0, 100);
  if (!q) return [];
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json[1]) ? json[1].map(norm).filter(Boolean).slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** Whether Google autocompletes the phrase itself, a sign people really search it. */
export async function isAutocompleted(keyword: string): Promise<boolean> {
  const k = norm(keyword);
  const words = k.split(" ");
  const prefix = words.length > 1 ? words.slice(0, -1).join(" ") + " " + words.at(-1)!.slice(0, 2) : k.slice(0, 4);
  const suggestions = await autocomplete(prefix);
  return suggestions.some((s) => s === k || s.startsWith(`${k} `));
}

/** "high" | "medium" | "low", computed in code from real data, never taken from the model. */
export function opportunity(d: { volume: number | null; competitionIndex: number | null }, autocompleted: boolean) {
  if (d.volume === null) return autocompleted ? "medium" : "low";
  const comp = d.competitionIndex ?? 50;
  if (d.volume >= 500 && comp <= 40) return "high";
  if (d.volume >= 100 || (d.volume >= 30 && autocompleted)) return "medium";
  return "low";
}
