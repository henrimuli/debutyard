import { describe, expect, it } from "vitest";
import { isValidSlug, slugify, uniqueSlug } from "@/lib/blog/slug";

describe("slugify", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(slugify("  Héllo, World! It's 2026 & beyond ")).toBe("hello-world-its-2026-and-beyond");
  });
  it("returns empty for symbols only", () => {
    expect(slugify("!!!")).toBe("");
  });
  it("caps length on a word boundary", () => {
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(70);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("suffixes on collision and avoids reserved route names", () => {
    expect(uniqueSlug("a", new Set(["a", "a-2"]))).toBe("a-3");
    expect(uniqueSlug("category", new Set())).toBe("category-post");
    expect(uniqueSlug("", new Set())).toBe("untitled");
  });
});

describe("isValidSlug", () => {
  it("accepts kebab-case only", () => {
    expect(isValidSlug("good-slug-1")).toBe(true);
    expect(isValidSlug("Bad_Slug")).toBe(false);
    expect(isValidSlug("-x")).toBe(false);
  });
});
