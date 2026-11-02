import { describe, expect, it } from "vitest";
import {
  COUNT_RANGE,
  countLabel,
  packageForSku,
  selectTargets,
  targetCountFor,
  type TargetCandidate,
} from "./packages";

describe("package sizes", () => {
  it("advertises 30, 60 and 90+", () => {
    expect([countLabel("starter"), countLabel("growth"), countLabel("scale")]).toEqual(["30", "60", "90+"]);
    expect(COUNT_RANGE).toBe("30–90+");
  });

  it("gives Starter and Growth exactly their count", () => {
    expect(targetCountFor("starter")).toBe(30);
    expect(targetCountFor("growth")).toBe(60);
  });

  it("gives Scale 91 to 95, across the whole range of the random number", () => {
    expect(targetCountFor("scale", () => 0)).toBe(91);
    expect(targetCountFor("scale", () => 0.2)).toBe(92);
    expect(targetCountFor("scale", () => 0.5)).toBe(93);
    expect(targetCountFor("scale", () => 0.7)).toBe(94);
    expect(targetCountFor("scale", () => 0.999999)).toBe(95);
  });
});

const dir = (id: string, over: Partial<TargetCandidate> = {}): TargetCandidate => ({
  id,
  niche: "general",
  dr: 50,
  linkType: "dofollow",
  badgeRequired: false,
  guided: false,
  isActive: true,
  starred: false,
  acceptanceRate: null,
  ...over,
});

describe("selectTargets", () => {
  const all = [
    dir("general-80", { dr: 80 }),
    dir("ai-40", { niche: "ai", dr: 40 }),
    dir("dev-90", { niche: "devtools", dr: 90 }),
    dir("badge-95", { dr: 95, badgeRequired: true }),
    dir("guided-99", { dr: 99, guided: true }),
    dir("nofollow-85", { dr: 85, linkType: "nofollow" }),
    dir("unknown-75", { dr: 75, linkType: "unknown" }),
    dir("inactive-70", { dr: 70, isActive: false }),
    dir("unmeasured", { dr: null }),
  ];

  it("ranks niche matches, then general by DR, then other niches; skips ineligible", () => {
    expect(selectTargets(all, { count: 10, categories: ["ai"], allowBadges: false })).toEqual([
      "ai-40",
      "general-80",
      "unmeasured",
      "dev-90",
    ]);
  });

  it("includes badge-gated directories only when allowed, respects count and exclusions", () => {
    expect(selectTargets(all, { count: 2, categories: [], allowBadges: true })).toEqual(["badge-95", "general-80"]);
    expect(
      selectTargets(all, { count: 10, categories: [], allowBadges: false, exclude: new Set(["general-80"]) }),
    ).not.toContain("general-80");
  });

  it("puts every badge directory first when badges are allowed, with no limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => dir(`b-${i}`, { dr: 10 + i, badgeRequired: true }));
    const picked = selectTargets([...many, dir("strong", { dr: 99 })], {
      count: 9,
      categories: [],
      allowBadges: true,
    });
    expect(picked.slice(0, 8).every((id) => id.startsWith("b-"))).toBe(true);
    expect(picked[8]).toBe("strong");
  });

  it("always picks starred directories first, over badges, niche and authority", () => {
    const picked = selectTargets(
      [
        dir("badge-99", { dr: 99, badgeRequired: true }),
        dir("ai-90", { niche: "ai", dr: 90 }),
        dir("starred-10", { dr: 10, starred: true }),
      ],
      { count: 3, categories: ["ai"], allowBadges: true },
    );
    expect(picked).toEqual(["starred-10", "badge-99", "ai-90"]);
  });

  it("still won't put a starred directory on an order it can't go on", () => {
    const starred = { starred: true, dr: 99 };
    const picked = selectTargets(
      [
        dir("nofollow", { ...starred, linkType: "nofollow" }),
        dir("inactive", { ...starred, isActive: false }),
        dir("guided", { ...starred, guided: true }),
        dir("needs-badge", { ...starred, badgeRequired: true }),
        dir("plain"),
      ],
      { count: 5, categories: [], allowBadges: false },
    );
    expect(picked).toEqual(["plain"]);
  });

  it("maps SKUs to packages", () => {
    expect(packageForSku("submission_growth")).toBe("growth");
    expect(packageForSku("launch_pro")).toBeNull();
  });
});
