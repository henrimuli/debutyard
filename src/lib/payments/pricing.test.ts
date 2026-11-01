import { describe, expect, it } from "vitest";
import { CouponError, MIN_CHARGE_CENTS, quote, type CouponRule } from "./pricing";
import { getSku, isPurchasable, SKUS, type OneTimeSku } from "./skus";

const starter = getSku("submission_starter") as OneTimeSku;

function coupon(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    id: "c1",
    code: "LAUNCH20",
    percentOff: 20,
    amountOffCents: null,
    appliesToSkus: [],
    maxRedemptions: null,
    redeemedCount: 0,
    expiresAt: null,
    ...overrides,
  };
}

describe("quote", () => {
  it("charges list price without a coupon", () => {
    expect(quote(starter, null)).toEqual({
      listAmountCents: 9900,
      discountCents: 0,
      amountCents: 9900,
      couponId: null,
    });
  });

  it("applies a percentage coupon", () => {
    expect(quote(starter, coupon())).toMatchObject({ discountCents: 1980, amountCents: 7920, couponId: "c1" });
  });

  it("applies a fixed-amount coupon", () => {
    expect(quote(starter, coupon({ percentOff: null, amountOffCents: 2500 })).amountCents).toBe(7400);
  });

  it("never charges below the minimum", () => {
    const q = quote(starter, coupon({ percentOff: 100 }));
    expect(q.amountCents).toBe(MIN_CHARGE_CENTS);
    expect(q.discountCents).toBe(9900 - MIN_CHARGE_CENTS);
  });

  it("rejects expired, exhausted and out-of-scope coupons", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    expect(() => quote(starter, coupon({ expiresAt: new Date("2026-10-25T00:00:00Z") }), now)).toThrow(CouponError);
    expect(() => quote(starter, coupon({ maxRedemptions: 5, redeemedCount: 5 }))).toThrow(CouponError);
    expect(() => quote(starter, coupon({ appliesToSkus: ["launch_pro"] }))).toThrow(CouponError);
  });

  it("rejects malformed coupons", () => {
    expect(() => quote(starter, coupon({ percentOff: 150 }))).toThrow(CouponError);
    expect(() => quote(starter, coupon({ percentOff: null, amountOffCents: -5 }))).toThrow(CouponError);
  });
});

describe("SKU catalog", () => {
  it("has unique ids and positive whole-cent prices", () => {
    const ids = SKUS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKUS) expect(Number.isInteger(s.amountCents) && s.amountCents > 0).toBe(true);
  });

  it("sells the submission service and every plan but Agency at checkout", () => {
    expect(SKUS.filter(isPurchasable).map((s) => s.id)).toEqual([
      "submission_starter",
      "submission_growth",
      "submission_scale",
      "sub_link_monitor_100",
      "sub_link_monitor_100_yearly",
      "sub_link_monitor_500",
      "sub_link_monitor_500_yearly",
      "sub_maker_pro_monthly",
      "sub_maker_pro_yearly",
      "sub_always_featured",
      "sub_always_featured_yearly",
    ]);
  });
});
