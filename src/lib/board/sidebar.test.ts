import { describe, expect, it } from "vitest";
import { mixSidebar } from "./sidebar";

const blocks = ["winners", "categories", "digest", "fair"];

describe("mixSidebar", () => {
  it("leaves the blocks alone without sponsors", () => {
    expect(mixSidebar([], blocks, 3)).toEqual(blocks);
  });

  it("puts a lone sponsor first", () => {
    expect(mixSidebar(["a"], blocks)).toEqual(["a", ...blocks]);
  });

  it("spreads sponsors evenly between the blocks", () => {
    expect(mixSidebar(["a", "b", "c"], blocks)).toEqual(["a", "winners", "b", "categories", "c", "digest", "fair"]);
  });

  it("fits a full week of 10 sponsors, keeping every sponsor and block once and in order", () => {
    const sponsors = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const mixed = mixSidebar(sponsors, blocks);
    expect(mixed).toHaveLength(14);
    expect(mixed.filter((x) => blocks.includes(x))).toEqual(blocks);
    expect(mixed.slice(0, 3)).toEqual(["s0", "s1", "winners"]);
  });

  it("rotates who goes first", () => {
    expect(mixSidebar(["a", "b", "c"], blocks, 1).filter((x) => !blocks.includes(x))).toEqual(["b", "c", "a"]);
    expect(mixSidebar(["a", "b", "c"], blocks, 4).filter((x) => !blocks.includes(x))).toEqual(["b", "c", "a"]);
  });
});
