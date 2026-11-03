import { describe, expect, it } from "vitest";
import {
  chooseVariant,
  copyAgeDays,
  MAX_TESTING,
  probabilityBest,
  refreshDue,
  retirements,
  type VariantStats,
} from "./bandit";

/** A repeatable random source. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const v = (id: string, sent: number, engaged: number, unhappy = 0): VariantStats => ({ id, sent, engaged, unhappy });

describe("chooseVariant", () => {
  it("handles none and one", () => {
    expect(chooseVariant([], seeded())).toBeNull();
    expect(chooseVariant([v("a", 0, 0)], seeded())).toBe("a");
  });

  it("gives the better version most sends, and the weaker one some", () => {
    const rng = seeded();
    const stats = [v("good", 200, 30), v("weak", 200, 4)];
    const picks = Array.from({ length: 1000 }, () => chooseVariant(stats, rng));
    expect(picks.filter((p) => p === "good").length).toBeGreaterThan(950);
  });

  it("splits fairly between versions with no results", () => {
    const rng = seeded();
    const stats = [v("a", 0, 0), v("b", 0, 0)];
    const picks = Array.from({ length: 1000 }, () => chooseVariant(stats, rng));
    const a = picks.filter((p) => p === "a").length;
    expect(a).toBeGreaterThan(400);
    expect(a).toBeLessThan(600);
  });
});

describe("probabilityBest", () => {
  it("adds up to one and favours the better version", () => {
    const p = probabilityBest([v("good", 200, 30), v("weak", 200, 4)], seeded());
    expect(p.get("good")! + p.get("weak")!).toBeCloseTo(1);
    expect(p.get("good")!).toBeGreaterThan(0.95);
  });
});

describe("retirements", () => {
  it("never judges a version before it has enough sends", () => {
    expect(retirements([v("a", 50, 10), v("b", 50, 0)], seeded())).toEqual([]);
  });

  it("retires a clear loser after enough sends", () => {
    const out = retirements([v("good", 150, 25), v("weak", 150, 2)], seeded());
    expect(out.map((r) => r.id)).toEqual(["weak"]);
  });

  it("retires a version people complain about, early", () => {
    const out = retirements([v("rude", 40, 5, 4), v("fine", 40, 3)], seeded());
    expect(out.map((r) => r.id)).toEqual(["rude"]);
  });

  it("always keeps one", () => {
    expect(retirements([v("only", 500, 0, 100)], seeded())).toEqual([]);
    const out = retirements([v("a", 100, 1, 50), v("b", 100, 1, 50)], seeded());
    expect(out).toHaveLength(1);
  });
});

describe("copy refresh", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("measures from the newest version", () => {
    expect(copyAgeDays([daysAgo(30), daysAgo(3), null], now)).toBe(3);
    expect(copyAgeDays([null], now)).toBeNull();
  });

  it("is due after two weeks", () => {
    expect(refreshDue({ testing: 2, waiting: false, ageDays: 14 })).toBe(true);
    expect(refreshDue({ testing: 2, waiting: false, ageDays: 13 })).toBe(false);
  });

  it("waits for a decision on the last proposal", () => {
    expect(refreshDue({ testing: 2, waiting: true, ageDays: 30 })).toBe(false);
  });

  it("doesn't pile on when plenty are running or nothing has started", () => {
    expect(refreshDue({ testing: MAX_TESTING, waiting: false, ageDays: 30 })).toBe(false);
    expect(refreshDue({ testing: 0, waiting: false, ageDays: null })).toBe(false);
  });
});
