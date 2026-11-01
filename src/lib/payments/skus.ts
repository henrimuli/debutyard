/**
 * Single source of truth for everything DebutYard sells (PLAN.md §5).
 * Amounts are USD cents. Both Paystack and PayPal read prices from here.
 */

export type OneTimeKind = "launch" | "relaunch" | "featured" | "submission";
export type Interval = "monthly" | "annually";

type BaseSku = {
  id: string;
  name: string;
  description: string;
  amountCents: number;
};

export type OneTimeSku = BaseSku & { type: "one_time"; kind: OneTimeKind };
export type RecurringSku = BaseSku & { type: "recurring"; interval: Interval };
export type Sku = OneTimeSku | RecurringSku;

const oneTime = (
  kind: OneTimeKind,
  id: string,
  name: string,
  amountCents: number,
  description: string,
): OneTimeSku => ({
  type: "one_time",
  kind,
  id,
  name,
  amountCents,
  description,
});

const recurring = (
  id: string,
  name: string,
  amountCents: number,
  interval: Interval,
  description: string,
): RecurringSku => ({
  type: "recurring",
  interval,
  id,
  name,
  amountCents,
  description,
});

export const SKUS = [
  // Launch tiers
  oneTime(
    "launch",
    "launch_fast_track",
    "Fast Track",
    1500,
    "Instant debut on approval, 7 days featured, no badge required, guaranteed dofollow link.",
  ),
  oneTime(
    "launch",
    "launch_pro",
    "Pro Debut",
    3900,
    "Instant debut on approval (or pick a week), 14 days featured, newsletter inclusion.",
  ),
  oneTime(
    "launch",
    "launch_premium",
    "Premium Debut",
    7900,
    "Instant debut on approval (or pick a week), 30 days featured, newsletter inclusion, written launch post.",
  ),
  oneTime(
    "launch",
    "launch_spotlight",
    "Spotlight",
    14900,
    "Instant debut on approval, 30 days in the homepage Spotlight (3 spots at any time), written launch post, 40-directory submission package.",
  ),
  oneTime("relaunch", "relaunch", "Relaunch", 1500, "One more week on the board for a new version."),

  // Featured placements
  oneTime(
    "featured",
    "featured_leaderboard_week",
    "Leaderboard slot (1 week)",
    1500,
    "Rotating featured slot between #3 and #4.",
  ),
  oneTime("featured", "featured_home_rail_week", "Homepage rail (1 week)", 2900, "Featured rail on the homepage."),
  oneTime("featured", "featured_home_rail_month", "Homepage rail (1 month)", 8900, "Featured rail on the homepage."),
  oneTime("featured", "featured_home_top_week", "Homepage top sponsor (1 week)", 5900, "The single top sponsor slot."),
  oneTime(
    "featured",
    "featured_home_top_month",
    "Homepage top sponsor (1 month)",
    17900,
    "The single top sponsor slot.",
  ),
  oneTime(
    "featured",
    "featured_home_sidebar_week",
    "Homepage sidebar (1 week)",
    2000,
    "A card in the homepage sidebar.",
  ),
  oneTime(
    "featured",
    "featured_home_sidebar_month",
    "Homepage sidebar (1 month)",
    5900,
    "A card in the homepage sidebar.",
  ),
  oneTime("featured", "featured_category_week", "Category sponsor (1 week)", 1900, "Sponsor one category page."),
  oneTime(
    "featured",
    "featured_newsletter_issue",
    "Newsletter sponsor (1 issue)",
    4900,
    "Sponsor one weekly newsletter.",
  ),

  // Directory submission service (done in-house)
  oneTime(
    "submission",
    "submission_starter",
    "Submissions: Starter",
    9900,
    "40 niche-matched directories, live tracking, 3 months Link Monitor.",
  ),
  oneTime(
    "submission",
    "submission_growth",
    "Submissions: Growth",
    17900,
    "100 directories, live tracking, 6 months Link Monitor.",
  ),
  oneTime(
    "submission",
    "submission_scale",
    "Submissions: Scale",
    29900,
    "180+ directories, tailored copy, 12 months Link Monitor.",
  ),

  // Subscriptions
  recurring(
    "sub_link_monitor_100",
    "Link Monitor (100 links)",
    900,
    "monthly",
    "Weekly checks on 100 backlinks you add, with an email when one is removed or turns nofollow.",
  ),
  recurring(
    "sub_link_monitor_100_yearly",
    "Link Monitor (100 links, yearly)",
    9000,
    "annually",
    "Weekly checks on 100 backlinks you add, with an email when one is removed or turns nofollow.",
  ),
  recurring(
    "sub_link_monitor_500",
    "Link Monitor (500 links)",
    1900,
    "monthly",
    "Weekly checks on 500 backlinks you add, with an email when one is removed or turns nofollow.",
  ),
  recurring(
    "sub_link_monitor_500_yearly",
    "Link Monitor (500 links, yearly)",
    19000,
    "annually",
    "Weekly checks on 500 backlinks you add, with an email when one is removed or turns nofollow.",
  ),
  recurring(
    "sub_maker_pro_monthly",
    "Maker Pro (monthly)",
    1200,
    "monthly",
    "A free Fast Track each quarter, Authority Score tracking, 100 monitored links, a Pro badge, early slot booking.",
  ),
  recurring("sub_maker_pro_yearly", "Maker Pro (yearly)", 9900, "annually", "Maker Pro for a year: two months free."),
  recurring(
    "sub_always_featured",
    "Always Featured",
    4900,
    "monthly",
    "One listing in the homepage featured rail and rotating as a category sponsor.",
  ),
  recurring(
    "sub_always_featured_yearly",
    "Always Featured (yearly)",
    49000,
    "annually",
    "One listing in the homepage featured rail and rotating as a category sponsor.",
  ),
  recurring("sub_agency", "Agency", 79900, "monthly", "5 client submissions a month with white-label reports."),
] as const satisfies readonly Sku[];

export type SkuId = (typeof SKUS)[number]["id"];

const byId = new Map<string, Sku>(SKUS.map((s) => [s.id, s]));

export function getSku(id: string): Sku | undefined {
  return byId.get(id);
}

/**
 * What can be bought directly from /api/checkout: submission packages and
 * plans. Launch tiers are sold in the submit flow and featured slots through
 * the /advertise booking calendar. Agency waits for Phase 5.
 */
export function isPurchasable(sku: Sku): boolean {
  if (sku.type === "recurring") return sku.id !== "sub_agency";
  return sku.kind === "submission";
}

export function isSkuId(id: string): id is SkuId {
  return byId.has(id);
}

/** Formats cents as "$15" or "$15.50". */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
