import { describe, expect, it } from "vitest";
import { getSku } from "@/lib/payments/skus";
import { combine, fastTrackSlots, formatLimit, planFeatures, planForSku, planRank, PLAN_CARDS, PLANS } from "./plans";

const plan = (id: string) => PLANS.find((p) => p.id === id)!;

describe("plans", () => {
  it("gives free users the base limits", () => {
    expect(combine([]).limits).toMatchObject({ links: 10, listings: 2, fastTracks: 0, extraBookingWeeks: 0 });
  });

  it("takes the highest of each limit across plans", () => {
    const { limits, features } = combine([plan("maker_pro"), plan("maker_unlimited")]);
    expect(limits).toEqual(plan("maker_unlimited").limits);
    expect(features.has("pro_badge")).toBe(true);
  });

  it("ranks Unlimited above Pro and maps every SKU to its plan", () => {
    expect(planRank("maker_unlimited")).toBeGreaterThan(planRank("maker_pro"));
    for (const card of PLAN_CARDS) {
      expect(planForSku(card.monthly)?.id).toBe(card.id);
      expect(planForSku(card.yearly)?.id).toBe(card.id);
      expect(getSku(card.monthly)?.type).toBe("recurring");
      expect(getSku(card.yearly)?.type).toBe("recurring");
    }
  });

  it("shows fair-use ceilings as Unlimited", () => {
    expect(formatLimit(100)).toBe("100");
    expect(formatLimit(plan("maker_unlimited").limits.links)).toBe("Unlimited");
    expect(formatLimit(plan("maker_unlimited").limits.listings)).toBe("Unlimited");
  });

  it("numbers a quarter's Fast Track credits, keeping the first as the plain quarter", () => {
    expect(fastTrackSlots("2026-Q4")).toEqual(["2026-Q4", "2026-Q4#2", "2026-Q4#3"]);
    expect(fastTrackSlots("2026-Q4", 1)).toEqual(["2026-Q4"]);
  });

  it("lists what each plan includes", () => {
    expect(planFeatures(combine([]).limits)).toEqual(
      expect.arrayContaining(["2 listings", "10 monitored links", "Book sponsor slots 12 weeks ahead"]),
    );
    const pro = planFeatures(plan("maker_pro").limits);
    expect(pro).toEqual(
      expect.arrayContaining([
        "100 listings",
        "100 monitored links",
        "1 free Fast Track each quarter",
        "Authority Score tracking and drop alerts for 100 domains",
        "Book sponsor slots 16 weeks ahead",
      ]),
    );
    const unlimited = planFeatures(plan("maker_unlimited").limits);
    expect(unlimited).toEqual(
      expect.arrayContaining([
        "Unlimited listings",
        "Unlimited monitored links",
        "3 free Fast Tracks each quarter",
        "Authority Score tracking and drop alerts for unlimited domains",
        "Book sponsor slots 20 weeks ahead",
      ]),
    );
  });

  it("doesn't sell Authority Score tracking where it isn't set up", () => {
    expect(planFeatures(plan("maker_pro").limits, { authority: false }).join()).not.toContain("Authority Score");
  });
});
