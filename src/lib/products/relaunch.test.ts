import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: () => ({}), schema: {} }));
vi.mock("@/lib/notifications", () => ({}));
const { relaunchDaysForSku, relaunchOffer } = await import("./relaunch");

describe("relaunchOffer", () => {
  it("sells each paid debut its own length of featured time", () => {
    expect(relaunchOffer("fast_track")).toEqual({ sku: "relaunch_fast_track", days: 7, amountCents: 900 });
    expect(relaunchOffer("pro")).toEqual({ sku: "relaunch_pro", days: 14, amountCents: 1400 });
    expect(relaunchOffer("premium")).toEqual({ sku: "relaunch_premium", days: 30, amountCents: 3900 });
  });

  it("has no offer for Spotlight or free listings", () => {
    expect(relaunchOffer("spotlight")).toBeNull();
    expect(relaunchOffer("free")).toBeNull();
  });
});

describe("relaunchDaysForSku", () => {
  it("reads the length from what was bought", () => {
    expect(relaunchDaysForSku("relaunch_pro")).toBe(14);
    expect(relaunchDaysForSku("launch_pro")).toBeNull();
  });
});
