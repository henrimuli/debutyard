import type { PostSummary } from "@/lib/blog/types";

const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "vs",
  "what",
  "with",
  "your",
  "you",
  "do",
  "does",
  "best",
]);

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Ranks other articles by topical closeness: same cluster, same category, shared tags, then
 * overlap in title/keyword words, with recency as the tie-break. Deterministic and cheap, so it
 * can run on every render of a statically cached page.
 */
export function rankRelated(current: PostSummary, candidates: PostSummary[], limit: number): PostSummary[] {
  const curWords = new Set([...words(current.title), ...words(current.focusKeyword)]);
  const curTags = new Set(current.tags.map((t) => t.toLowerCase()));

  return candidates
    .filter((c) => c.id !== current.id)
    .map((c) => {
      let score = 0;
      if (current.cluster && c.cluster === current.cluster) score += 4;
      if (current.category && c.category?.id === current.category.id) score += 2;
      for (const t of c.tags) if (curTags.has(t.toLowerCase())) score += 2;
      const cw = new Set([...words(c.title), ...words(c.focusKeyword)]);
      for (const w of cw) if (curWords.has(w)) score += 1;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score || b.c.publishedAt.localeCompare(a.c.publishedAt))
    .slice(0, limit)
    .map((x) => x.c);
}
