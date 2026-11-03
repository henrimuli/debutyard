import type { OutreachSerpRow } from "@/db/schema/outreach";

/**
 * Picks the search the email can truthfully talk about: a real competitor at
 * the top, the business not already there, and a real gap in authority. Pure.
 */

export type KeywordResults = {
  keyword: string;
  serp: OutreachSerpRow[];
  /** Domain → name, for the results that are direct competitors. */
  competitors: Map<string, string>;
};

/** "At the top" has to mean it. */
const TOP_POSITION = 3;
/** Already ranking this well, the pitch would be wrong. */
const ALREADY_RANKS = 5;
/** Smaller gaps than this aren't why they aren't ranking, or not clearly enough to say so. */
const MIN_GAP = 15;

export type KeywordPick =
  | {
      ok: true;
      keyword: string;
      competitors: Array<{ name: string; domain: string; position: number; authority: number }>;
    }
  | { ok: false; reason: string };

export function pickKeyword(
  results: KeywordResults[],
  domain: string,
  own: number,
  scoreOf: (domain: string) => number | null,
): KeywordPick {
  let reason = "no_competitor_on_top";
  for (const r of results) {
    const mine = r.serp.find((s) => s.domain === domain);
    if (mine && mine.position <= ALREADY_RANKS) {
      reason = "already_ranks";
      continue;
    }
    const rivals = r.serp
      .filter((s) => r.competitors.has(s.domain) && s.domain !== domain)
      .filter((s, i, all) => all.findIndex((x) => x.domain === s.domain) === i)
      .sort((a, b) => a.position - b.position)
      .flatMap((s) => {
        const authority = scoreOf(s.domain);
        return authority === null
          ? []
          : [{ name: r.competitors.get(s.domain)!, domain: s.domain, position: s.position, authority }];
      })
      .filter((c) => c.position <= TOP_POSITION + 2 && c.authority - own >= MIN_GAP)
      .slice(0, 2);
    if (rivals.length === 0 || rivals[0]!.position > TOP_POSITION) {
      if (reason !== "already_ranks") reason = rivals.length ? "no_competitor_on_top" : "no_authority_gap";
      continue;
    }
    return { ok: true, keyword: r.keyword, competitors: rivals };
  }
  return { ok: false, reason };
}
