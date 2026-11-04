import { describe, expect, it } from "vitest";
import { PROXY_AFTER_RUNS, searchDownStreak, type ResearchRun } from "./search-health";

const at = (hour: number) => new Date(Date.UTC(2026, 10, 5, hour));
const down = (hour: number, message = "OpenSERP returned HTTP 429"): ResearchRun => ({
  startedAt: at(hour),
  results: { research: { searchDown: message, searched: false } },
});
const worked = (hour: number): ResearchRun => ({ startedAt: at(hour), results: { research: { searched: true } } });
const quiet = (hour: number): ResearchRun => ({ startedAt: at(hour), results: { research: { searched: false } } });

describe("searchDownStreak", () => {
  it("is nothing when searches work or no run failed", () => {
    expect(searchDownStreak([])).toBeNull();
    expect(searchDownStreak([worked(9), down(6)])).toBeNull();
    expect(searchDownStreak([quiet(9), worked(6)])).toBeNull();
  });

  it("reports the latest failure and when the streak began", () => {
    expect(searchDownStreak([down(9, "OpenSERP returned HTTP 403"), down(6), worked(3)])).toEqual({
      runs: 2,
      lastAt: at(9),
      since: at(6),
      error: "OpenSERP returned HTTP 403",
      needsProxy: false,
    });
  });

  it(`asks for a proxy after ${PROXY_AFTER_RUNS} runs in a row`, () => {
    expect(searchDownStreak([down(9), down(6)])?.needsProxy).toBe(false);
    expect(searchDownStreak([down(9), down(6), down(3)])).toMatchObject({ runs: 3, needsProxy: true });
  });

  it("doesn't ask for a proxy when our own services are what's failing", () => {
    const broken = "OpenSERP returned HTTP 502: all 2 attempts failed for google";
    expect(searchDownStreak([down(9, broken), down(6), down(3)])).toMatchObject({ runs: 3, needsProxy: false });
    const unreachable = "Couldn't reach the worker: fetch failed";
    expect(searchDownStreak([down(9, unreachable), down(6), down(3)])?.needsProxy).toBe(false);
  });

  it("isn't reset by runs that never searched", () => {
    expect(searchDownStreak([quiet(12), down(9), quiet(6), down(3)])).toMatchObject({ runs: 2, lastAt: at(9) });
  });

  it("ignores runs with nothing logged, like a crash or a run with outreach off", () => {
    const empty = [
      { startedAt: at(12), results: null },
      { startedAt: at(11), results: { research: { error: "boom" } } },
    ];
    expect(searchDownStreak([...empty, down(9)])).toMatchObject({ runs: 1 });
  });

  it("starts a new streak when a run worked and then got blocked", () => {
    const both: ResearchRun = {
      startedAt: at(9),
      results: { research: { searchDown: "OpenSERP returned HTTP 429", searched: true } },
    };
    expect(searchDownStreak([both, down(6), down(3)])).toMatchObject({ runs: 1, since: at(9) });
  });
});
