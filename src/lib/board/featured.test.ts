import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: () => ({}) }));
const { featuredEndsAt, featuredStartsAt, isFeaturedNow, isHeroNow } = await import("./featured");

describe("featured windows", () => {
  const week = "2026-W44"; // starts Mon Oct 26 2026
  const at = (iso: string) => new Date(iso);

  it("opens at the debut week, or at approval if that came later, and closes after the tier's days", () => {
    expect(featuredStartsAt(week, at("2026-10-01T00:00:00Z"))).toEqual(at("2026-10-26T00:00:00Z"));
    expect(featuredStartsAt(week, at("2026-10-28T15:00:00Z"))).toEqual(at("2026-10-28T15:00:00Z"));
    expect(featuredEndsAt("pro", week, null)).toEqual(at("2026-11-09T00:00:00Z"));
    expect(featuredEndsAt("free", week, null)).toBeNull();
  });
  const booked = at("2026-10-20T09:00:00Z"); // approved before its week started

  it("features Fast Track 7 days, Pro 14 and Premium/Spotlight 30 from the debut week's start", () => {
    expect(isFeaturedNow("fast_track", week, booked, at("2026-11-01T23:59:59Z"))).toBe(true);
    expect(isFeaturedNow("fast_track", week, booked, at("2026-11-02T00:00:00Z"))).toBe(false);
    expect(isFeaturedNow("pro", week, booked, at("2026-10-26T00:00:00Z"))).toBe(true);
    expect(isFeaturedNow("pro", week, booked, at("2026-11-08T23:59:59Z"))).toBe(true);
    expect(isFeaturedNow("pro", week, booked, at("2026-11-09T00:00:00Z"))).toBe(false);
    expect(isFeaturedNow("premium", week, booked, at("2026-11-24T00:00:00Z"))).toBe(true);
    expect(isFeaturedNow("premium", week, booked, at("2026-11-25T00:00:00Z"))).toBe(false);
  });

  it("counts from approval for an instant debut approved mid-week", () => {
    const approved = at("2026-10-28T15:00:00Z"); // Wednesday
    expect(isFeaturedNow("fast_track", week, approved, at("2026-11-04T14:59:59Z"))).toBe(true);
    expect(isFeaturedNow("fast_track", week, approved, at("2026-11-04T15:00:00Z"))).toBe(false);
  });

  it("never features before the debut week or for free", () => {
    expect(isFeaturedNow("pro", week, booked, at("2026-10-25T23:59:59Z"))).toBe(false);
    expect(isFeaturedNow("free", week, booked, at("2026-10-27T00:00:00Z"))).toBe(false);
  });

  it("keeps Spotlight in the Spotlight for 30 days from going live, and only Spotlight", () => {
    const approved = at("2026-10-28T15:00:00Z");
    expect(isHeroNow("spotlight", week, approved, at("2026-10-28T14:59:59Z"))).toBe(false);
    expect(isHeroNow("spotlight", week, approved, at("2026-11-20T00:00:00Z"))).toBe(true);
    expect(isHeroNow("spotlight", week, approved, at("2026-11-27T14:59:59Z"))).toBe(true);
    expect(isHeroNow("spotlight", week, approved, at("2026-11-27T15:00:00Z"))).toBe(false);
    expect(isHeroNow("premium", week, approved, at("2026-10-30T00:00:00Z"))).toBe(false);
  });
});
