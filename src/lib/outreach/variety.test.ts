import { describe, expect, it } from "vitest";
import { allSpins, isValidSpin, overlap, repeatedPhrases, spin, variations } from "./variety";

describe("spin", () => {
  it("always gives the same result for the same seed", () => {
    const t = "{{Hey|Hi|Hello}} {{team|there}}, {{one|two|three}}";
    expect(spin(t, "tok-1")).toBe(spin(t, "tok-1"));
  });

  it("uses every option across seeds, roughly evenly", () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const s = spin("{{a|b|c}}", `tok-${i}`);
      seen[s] = (seen[s] ?? 0) + 1;
    }
    for (const option of ["a", "b", "c"]) {
      expect(seen[option]).toBeGreaterThan(800);
      expect(seen[option]).toBeLessThan(1200);
    }
  });

  it("trims options written with spaces, as in {{ hey | hi }}", () => {
    expect(allSpins("{{ hey | hi }} Marc")).toEqual(["hey Marc", "hi Marc"]);
  });

  it("handles nesting", () => {
    expect(allSpins("{{a|b {{c|d}}}}!")).toEqual(["a!", "b c!", "b d!"]);
  });

  it("leaves placeholders alone, even right against the braces", () => {
    expect(spin("{{{business}}}", "x")).toBe("{business}");
    expect(allSpins("{{hi {business}|{keyword} results}} now")).toEqual(["hi {business} now", "{keyword} results now"]);
  });

  it("leaves plain text alone", () => {
    expect(spin("No choices, a|b here.", "x")).toBe("No choices, a|b here.");
  });

  it.each([
    ["an unclosed group", "{{a|b"],
    ["a stray close", "a}}"],
    ["an empty option", "{{a||b}}"],
    ["a blank option", "{{a| }}"],
    ["an unclosed placeholder", "{{a|{b}}"],
  ])("refuses %s", (_, t) => {
    expect(isValidSpin(t)).toBe(false);
    expect(() => spin(t, "x")).toThrow();
  });
});

describe("variations", () => {
  it("multiplies choices and adds nested ones", () => {
    expect(variations("plain")).toBe(1);
    expect(variations("{{a|b}} {{c|d|e}}")).toBe(6);
    expect(variations("{{a|b {{c|d}}}}")).toBe(3);
    expect(allSpins("{{a|b}} {{c|d|e}}")).toHaveLength(6);
  });

  it("caps how many it lists", () => {
    expect(allSpins("{{a|b}}{{a|b}}{{a|b}}{{a|b}}", 5)).toHaveLength(5);
  });
});

describe("overlap", () => {
  const sentence = "Google tends to favour sites with more trusted links around here";

  it("is high for the same words, whatever the numbers", () => {
    expect(overlap(`${sentence} at 91`, `${sentence} at 44`)).toBe(1);
  });

  it("is zero for different words, and for text too short to compare", () => {
    expect(overlap(sentence, "Completely different wording about another subject in this mail")).toBe(0);
    expect(overlap("too short", sentence)).toBe(0);
  });

  it("measures the share of the first text", () => {
    const share = overlap(`${sentence} and then a fresh ending nobody else has written`, sentence);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.7);
  });
});

describe("repeatedPhrases", () => {
  const stock = "we submit products by hand to directories";
  const bodies = Array.from(
    { length: 10 },
    (_, i) => `${stock}. Number ${"abcdefghij"[i]} says other things entirely.`,
  );

  it("finds what recurs and says in how many emails", () => {
    const found = repeatedPhrases(bodies);
    expect(found.map((f) => f.phrase)).toContain("we submit products by hand");
    expect(found[0]!.emails).toBe(10);
  });

  it("ignores what's meant to repeat", () => {
    const found = repeatedPhrases(bodies, { except: stock });
    expect(found.map((f) => f.phrase)).not.toContain("we submit products by hand");
  });

  it("needs at least five emails", () => {
    expect(repeatedPhrases(bodies.slice(0, 4))).toEqual([]);
  });
});
