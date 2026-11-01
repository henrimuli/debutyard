import { describe, expect, it } from "vitest";
import { roundRobin } from "./fair-share";

describe("roundRobin", () => {
  it("takes one from each group in turn", () => {
    expect(roundRobin([["a1", "a2", "a3"], ["b1"], ["c1", "c2"]], 10)).toEqual(["a1", "b1", "c1", "a2", "c2", "a3"]);
  });

  it("stops at the limit, so a big group waits behind the small ones", () => {
    expect(roundRobin([["a1", "a2", "a3", "a4"], ["b1"]], 3)).toEqual(["a1", "b1", "a2"]);
  });

  it("handles nothing to do", () => {
    expect(roundRobin([], 5)).toEqual([]);
    expect(roundRobin([[], []], 5)).toEqual([]);
    expect(roundRobin([["a"]], 0)).toEqual([]);
  });
});
