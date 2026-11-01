/** What each subscription plan unlocks (PLAN §5.4). Pure config. */

export type Feature = "dr_tracking" | "pro_badge" | "free_fast_track" | "early_booking" | "always_featured";
export type Limit = "links";

export type Plan = {
  id: string;
  label: string;
  skus: string[];
  features: Feature[];
  limits: Record<Limit, number>;
};

/** Manual links anyone can monitor without a plan. */
export const FREE_LIMITS: Record<Limit, number> = { links: 10 };

export const ALWAYS_FEATURED_SKUS = ["sub_always_featured", "sub_always_featured_yearly"];

export const PLANS: Plan[] = [
  {
    id: "link_monitor_100",
    label: "Link Monitor",
    skus: ["sub_link_monitor_100", "sub_link_monitor_100_yearly"],
    features: [],
    limits: { links: 100 },
  },
  {
    id: "link_monitor_500",
    label: "Link Monitor 500",
    skus: ["sub_link_monitor_500", "sub_link_monitor_500_yearly"],
    features: [],
    limits: { links: 500 },
  },
  {
    id: "maker_pro",
    label: "Maker Pro",
    skus: ["sub_maker_pro_monthly", "sub_maker_pro_yearly"],
    features: ["dr_tracking", "pro_badge", "free_fast_track", "early_booking"],
    limits: { links: 100 },
  },
  {
    id: "always_featured",
    label: "Always Featured",
    skus: ALWAYS_FEATURED_SKUS,
    features: ["always_featured"],
    limits: { links: 0 },
  },
];

/** The plan cards on the billing page: one per plan, with a SKU for each way of paying. */
export const PLAN_CARDS = [
  { label: "Maker Pro", monthly: "sub_maker_pro_monthly", yearly: "sub_maker_pro_yearly" },
  { label: "Link Monitor 100", monthly: "sub_link_monitor_100", yearly: "sub_link_monitor_100_yearly" },
  { label: "Link Monitor 500", monthly: "sub_link_monitor_500", yearly: "sub_link_monitor_500_yearly" },
  { label: "Always Featured", monthly: "sub_always_featured", yearly: "sub_always_featured_yearly" },
] as const;

export const planForSku = (sku: string) => PLANS.find((p) => p.skus.includes(sku)) ?? null;

/** Combines a user's plans: every feature, and the highest of each limit. */
export function combine(plans: Plan[]): { features: Set<Feature>; limits: Record<Limit, number> } {
  return {
    features: new Set(plans.flatMap((p) => p.features)),
    limits: { links: Math.max(FREE_LIMITS.links, ...plans.map((p) => p.limits.links)) },
  };
}

/** "2026-Q4": the period for quarterly perks (UTC). */
export function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Featured slots can be booked this many weeks ahead; Maker Pro adds `PRO_EXTRA_WEEKS`. */
export const PRO_EXTRA_WEEKS = 4;
