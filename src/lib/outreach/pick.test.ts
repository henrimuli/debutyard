import { describe, expect, it } from "vitest";
import { pickKeyword, type KeywordResults } from "./pick";

const row = (position: number, domain: string) => ({ position, domain, url: `https://${domain}/`, title: domain });

const scores: Record<string, number> = { "buffer.com": 91, "later.com": 88, "close.com": 20, "acme.com": 6 };
const scoreOf = (d: string) => scores[d] ?? null;

const results = (over: Partial<KeywordResults> = {}): KeywordResults => ({
  keyword: "cross-post to tiktok",
  serp: [row(1, "buffer.com"), row(2, "later.com"), row(7, "acme.com")],
  competitors: new Map([
    ["buffer.com", "Buffer"],
    ["later.com", "Later"],
  ]),
  ...over,
});

describe("pickKeyword", () => {
  it("picks competitors at the top with a real gap", () => {
    const pick = pickKeyword([results()], "acme.com", 6, scoreOf);
    expect(pick).toEqual({
      ok: true,
      keyword: "cross-post to tiktok",
      competitors: [
        { name: "Buffer", domain: "buffer.com", position: 1, authority: 91 },
        { name: "Later", domain: "later.com", position: 2, authority: 88 },
      ],
    });
  });

  it("skips a search the business already ranks for and tries the next", () => {
    const pick = pickKeyword(
      [results({ keyword: "mine", serp: [row(1, "buffer.com"), row(2, "acme.com")] }), results()],
      "acme.com",
      6,
      scoreOf,
    );
    expect(pick.ok && pick.keyword).toBe("cross-post to tiktok");
  });

  it("says so when the business already ranks everywhere", () => {
    const pick = pickKeyword([results({ serp: [row(2, "acme.com"), row(3, "buffer.com")] })], "acme.com", 6, scoreOf);
    expect(pick).toEqual({ ok: false, reason: "already_ranks" });
  });

  it("won't call position six the top", () => {
    const pick = pickKeyword([results({ serp: [row(6, "buffer.com")] })], "acme.com", 6, scoreOf);
    expect(pick.ok).toBe(false);
  });

  it("needs a real authority gap", () => {
    const pick = pickKeyword(
      [results({ serp: [row(1, "close.com")], competitors: new Map([["close.com", "Close"]]) })],
      "acme.com",
      10,
      scoreOf,
    );
    expect(pick).toEqual({ ok: false, reason: "no_authority_gap" });
  });

  it("ignores a competitor with no measured score, and results that aren't competitors", () => {
    expect(
      pickKeyword(
        [results({ serp: [row(1, "unknown.com")], competitors: new Map([["unknown.com", "Unknown"]]) })],
        "acme.com",
        6,
        scoreOf,
      ).ok,
    ).toBe(false);
    expect(pickKeyword([results({ competitors: new Map() })], "acme.com", 6, scoreOf).ok).toBe(false);
  });
});
