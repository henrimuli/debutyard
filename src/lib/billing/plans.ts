/** What each subscription plan unlocks (PLAN §5.4). Pure config. */
import { BOOKING_HORIZON_WEEKS } from "@/lib/ads/placements";

export type Feature = "dr_tracking" | "pro_badge";
export type Limit = "links" | "listings" | "domains" | "fastTracks" | "extraBookingWeeks";

export type Plan = {
  id: string;
  label: string;
  skus: string[];
  features: Feature[];
  limits: Record<Limit, number>;
};

/** What anyone gets without a plan. */
export const FREE_LIMITS: Record<Limit, number> = {
  links: 10,
  listings: 2,
  domains: 0,
  fastTracks: 0,
  extraBookingWeeks: 0,
};

/** "Unlimited" is sold as unlimited, with these fair-use ceilings behind it (see the terms). */
const FAIR_USE = { links: 10_000, listings: 1_000, domains: 1_000 };

/** Lowest first: a plan's position is its rank. */
export const PLANS: Plan[] = [
  {
    id: "maker_pro",
    label: "Maker Pro",
    skus: ["sub_maker_pro_monthly", "sub_maker_pro_yearly"],
    features: ["dr_tracking", "pro_badge"],
    limits: { links: 100, listings: 100, domains: 100, fastTracks: 1, extraBookingWeeks: 4 },
  },
  {
    id: "maker_unlimited",
    label: "Maker Unlimited",
    skus: ["sub_maker_unlimited_monthly", "sub_maker_unlimited_yearly"],
    features: ["dr_tracking", "pro_badge"],
    limits: { ...FAIR_USE, fastTracks: 3, extraBookingWeeks: 8 },
  },
];

export const MAKER_SKUS = PLANS.flatMap((p) => p.skus);

export const planForSku = (sku: string) => PLANS.find((p) => p.skus.includes(sku)) ?? null;
export const planRank = (id: string) => PLANS.findIndex((p) => p.id === id);

/** The furthest ahead anyone can book, so a recurring slot can check every week someone else might. */
export const MAX_EXTRA_BOOKING_WEEKS = Math.max(...PLANS.map((p) => p.limits.extraBookingWeeks));
const MAX_FAST_TRACKS = Math.max(...PLANS.map((p) => p.limits.fastTracks));

/** A limit at a fair-use ceiling reads as "Unlimited". */
export const isUnlimited = (n: number) => n >= FAIR_USE.listings;
export const formatLimit = (n: number) => (isUnlimited(n) ? "Unlimited" : String(n));

/** Combines a user's plans: every feature, and the highest of each limit. */
export function combine(plans: Plan[]): { features: Set<Feature>; limits: Record<Limit, number> } {
  const limits = { ...FREE_LIMITS };
  for (const p of plans) {
    for (const key of Object.keys(limits) as Limit[]) limits[key] = Math.max(limits[key], p.limits[key]);
  }
  return { features: new Set(plans.flatMap((p) => p.features)), limits };
}

/** "2026-Q4": the period for quarterly perks (UTC). */
export function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * Period keys for a quarter's free Fast Tracks, one per credit: "2026-Q4", "2026-Q4#2", "2026-Q4#3".
 * The unique key on plan_credits makes each one claimable once. Defaults to every credit any plan has.
 */
export function fastTrackSlots(quarter: string, count = MAX_FAST_TRACKS): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? quarter : `${quarter}#${i + 1}`));
}

/** The bullets on a plan card. `authority` is off where no Authority Score provider is set up, so we don't sell it. */
export function planFeatures(limits: Record<Limit, number>, { authority = true } = {}): string[] {
  const paid = limits.fastTracks > 0;
  const plural = (n: number, word: string) => `${formatLimit(n)} ${word}${n === 1 ? "" : "s"}`;
  return [
    plural(limits.listings, "listing"),
    plural(limits.links, "monitored link"),
    ...(paid ? [`${limits.fastTracks} free Fast Track${limits.fastTracks === 1 ? "" : "s"} each quarter`] : []),
    ...(paid && authority
      ? [
          `Authority Score tracking and drop alerts for ${isUnlimited(limits.domains) ? "unlimited" : limits.domains} domains`,
        ]
      : []),
    ...(paid ? ["Pro badge on your profile and listings"] : []),
    `Book sponsor slots ${BOOKING_HORIZON_WEEKS + limits.extraBookingWeeks} weeks ahead`,
    "Weekly debut on the board, with our badge on your site",
    "Directory tracker and free tools",
  ];
}

/** The paid plan cards: one per plan, with a SKU for each way of paying. */
export const PLAN_CARDS = [
  { id: "maker_pro", label: "Maker Pro", monthly: "sub_maker_pro_monthly", yearly: "sub_maker_pro_yearly" },
  {
    id: "maker_unlimited",
    label: "Maker Unlimited",
    monthly: "sub_maker_unlimited_monthly",
    yearly: "sub_maker_unlimited_yearly",
  },
] as const;
export type PlanCard = (typeof PLAN_CARDS)[number];
