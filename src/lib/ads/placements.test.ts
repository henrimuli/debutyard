import { describe, expect, it } from "vitest";
import { getSku, isPurchasable } from "@/lib/payments/skus";
import { cpcCents, paidEndForNextCharge, PLACEMENTS, remainingByWeek, shouldExtend } from "./placements";

describe("shouldExtend (CPC guarantee)", () => {
  const base = { placement: "leaderboard" as const, paidCents: 1500, extensions: 0 };
  it("extends while cost per click is over $1", () => {
    expect(shouldExtend({ ...base, clicks: 0 })).toBe(true);
    expect(shouldExtend({ ...base, clicks: 14 })).toBe(true);
    expect(shouldExtend({ ...base, clicks: 15 })).toBe(false);
  });
  it("stops after the extension limit, for comped slots, and where not offered", () => {
    expect(shouldExtend({ ...base, clicks: 0, extensions: 4 })).toBe(false);
    expect(shouldExtend({ ...base, clicks: 0, paidCents: 0 })).toBe(false);
    expect(shouldExtend({ ...base, clicks: 0, placement: "home_top" })).toBe(false);
  });
  it("computes CPC", () => {
    expect(cpcCents(1500, 0)).toBeNull();
    expect(cpcCents(1500, 7)).toBe(214);
  });
});

describe("recurring slots", () => {
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const monday = (s: string) => new Date(`${s}T00:00:00Z`);

  it("pays up to the Monday after the next charge", () => {
    // Bought Wed Nov 4 for the week of Nov 9: the next charge, Nov 11, pays for the week of Nov 16.
    expect(paidEndForNextCharge(d("2026-11-11"))).toEqual(monday("2026-11-16"));
    expect(paidEndForNextCharge(d("2026-11-15"))).toEqual(monday("2026-11-16"));
    expect(paidEndForNextCharge(monday("2026-11-16"))).toEqual(monday("2026-11-23"));
  });

  it("never leaves a gap before a monthly charge, whichever month it is", () => {
    for (let month = 0; month < 12; month++) {
      const charge = new Date(Date.UTC(2027, month, 31));
      expect(paidEndForNextCharge(charge).getTime()).toBeGreaterThan(charge.getTime());
    }
  });

  it("costs the same as one-time and can't be bought without a booking", () => {
    const plans = Object.values(PLACEMENTS).flatMap((p) =>
      Object.entries(p.recurring ?? {}).map(([d, id]) => ({ one: p.skus[d as "week"]!, id })),
    );
    expect(plans).toHaveLength(5);
    for (const { one, id } of plans) {
      expect(getSku(id)?.amountCents).toBe(getSku(one)?.amountCents);
      expect(isPurchasable(getSku(id)!)).toBe(false);
    }
  });

  it("isn't offered on one-slot placements", () => {
    for (const p of Object.values(PLACEMENTS)) if (p.cap === 1) expect(p.recurring).toBeUndefined();
  });
});

describe("remainingByWeek", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const weeks = [
    { key: "A", startsAt: d("2026-11-02"), endsAt: d("2026-11-09") },
    { key: "B", startsAt: d("2026-11-09"), endsAt: d("2026-11-16") },
  ];
  it("counts bookings that overlap each week", () => {
    const month = { startsAt: d("2026-10-19"), paidEndsAt: d("2026-11-09") };
    const weekB = { startsAt: d("2026-11-09"), paidEndsAt: d("2026-11-16") };
    expect(remainingByWeek(weeks, [month, weekB, weekB], 2)).toEqual({ A: 1, B: 0 });
  });
});
