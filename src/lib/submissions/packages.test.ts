import { describe, expect, it } from "vitest";
import { packageForSku, selectTargets, type TargetCandidate } from "./packages";

const dir = (id: string, over: Partial<TargetCandidate> = {}): TargetCandidate => ({
  id,
  niche: "general",
  dr: 50,
  linkType: "dofollow",
  badgeRequired: false,
  guided: false,
  isActive: true,
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

  it("maps SKUs to packages", () => {
    expect(packageForSku("submission_growth")).toBe("growth");
    expect(packageForSku("launch_pro")).toBeNull();
  });
});
