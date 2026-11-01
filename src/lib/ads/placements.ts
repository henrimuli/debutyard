import type { SkuId } from "@/lib/payments/skus";
import { weekStart } from "@/lib/weeks";

/** Bookable featured placements (PLAN §5.2). Pure config, shared by server and client. */

export type Placement = "leaderboard" | "home_rail" | "home_top" | "home_sidebar" | "category" | "newsletter";
export type Duration = "week" | "month";

export type PlacementConfig = {
  id: Placement;
  label: string;
  description: string;
  /** Concurrent bookings allowed per week (per category for category sponsors). */
  cap: number;
  skus: Partial<Record<Duration, SkuId>>;
  /** Plans that renew the slot until cancelled. Not on one-slot placements, which a subscriber could hold for good. */
  recurring?: Partial<Record<Duration, SkuId>>;
  /** CPC guarantee: the slot stays up free, a week at a time, until cost per click is ≤ $1. */
  cpcGuarantee: boolean;
};

export const PLACEMENTS: Record<Placement, PlacementConfig> = {
  leaderboard: {
    id: "leaderboard",
    label: "Leaderboard slot",
    description: "A clearly labelled featured row between #3 and #4 on this week's board. Rotates between sponsors.",
    cap: 3,
    skus: { week: "featured_leaderboard_week" },
    recurring: { week: "sub_ad_leaderboard_week" },
    cpcGuarantee: true,
  },
  home_rail: {
    id: "home_rail",
    label: "Homepage featured rail",
    description: "A card in the featured rail above the board on the homepage.",
    cap: 6,
    skus: { week: "featured_home_rail_week", month: "featured_home_rail_month" },
    recurring: { week: "sub_ad_home_rail_week", month: "sub_ad_home_rail_month" },
    cpcGuarantee: true,
  },
  home_top: {
    id: "home_top",
    label: "Homepage top sponsor",
    description: "The single banner at the top of the homepage. One sponsor at a time.",
    cap: 1,
    skus: { week: "featured_home_top_week", month: "featured_home_top_month" },
    cpcGuarantee: false,
  },
  home_sidebar: {
    id: "home_sidebar",
    label: "Homepage sidebar",
    description: "A card in the homepage sidebar, mixed in beside this week's board.",
    cap: 10,
    skus: { week: "featured_home_sidebar_week", month: "featured_home_sidebar_month" },
    recurring: { week: "sub_ad_home_sidebar_week", month: "sub_ad_home_sidebar_month" },
    cpcGuarantee: false,
  },
  category: {
    id: "category",
    label: "Category sponsor",
    description: "The banner at the top of one category page. One sponsor per category.",
    cap: 1,
    skus: { week: "featured_category_week" },
    cpcGuarantee: true,
  },
  newsletter: {
    id: "newsletter",
    label: "Newsletter sponsor",
    description: "The sponsor block in one Monday digest, between the winners and the new debuts.",
    cap: 1,
    skus: { week: "featured_newsletter_issue" },
    cpcGuarantee: false,
  },
};

export const PLACEMENT_IDS = Object.keys(PLACEMENTS) as Placement[];
export const WEEKS_PER: Record<Duration, number> = { week: 1, month: 4 };
/** How far ahead slots can be booked. */
export const BOOKING_HORIZON_WEEKS = 12;
/** How long an unpaid booking holds its slot. */
export const HOLD_MINUTES = 60;
export const CPC_TARGET_CENTS = 100;
export const MAX_EXTENSIONS = 4;

/**
 * CPC guarantee decision at the end of a slot. Extend a week if the
 * placement offers it, extensions remain, and cost per click is still over $1.
 */
export function shouldExtend(input: {
  placement: Placement;
  paidCents: number;
  clicks: number;
  extensions: number;
}): boolean {
  if (!PLACEMENTS[input.placement].cpcGuarantee || input.paidCents <= 0) return false;
  if (input.extensions >= MAX_EXTENSIONS) return false;
  return input.clicks === 0 || input.paidCents / input.clicks > CPC_TARGET_CENTS;
}

export function cpcCents(paidCents: number, clicks: number): number | null {
  return clicks > 0 ? Math.round(paidCents / clicks) : null;
}

/**
 * How long a recurring slot is paid for, given when the next charge is due: the Monday
 * after it. Every charge lands before the week it pays for, so coverage never runs out
 * before the next charge. Providers bill by calendar month, so a monthly plan runs 4 or 5 weeks.
 */
export function paidEndForNextCharge(nextCharge: Date): Date {
  return new Date(weekStart(nextCharge).getTime() + 7 * 86_400_000);
}

/** How many concurrent bookings are left in each week. Pure; `bookings` are the live ones overlapping. */
export function remainingByWeek(
  weeks: Array<{ key: string; startsAt: Date; endsAt: Date }>,
  bookings: Array<{ startsAt: Date; paidEndsAt: Date }>,
  cap: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of weeks) {
    const used = bookings.filter((b) => b.startsAt < w.endsAt && b.paidEndsAt > w.startsAt).length;
    out[w.key] = Math.max(0, cap - used);
  }
  return out;
}
