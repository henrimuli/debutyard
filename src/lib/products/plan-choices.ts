import "server-only";
import { env } from "@/env";
import { dnsRecordValue } from "@/lib/badges/detect";
import { badgeSnippet } from "@/lib/badges/svg";
import { fastTrackCredit } from "@/lib/billing/service";
import { enabledProviders, formatUsd, getSku } from "@/lib/payments";
import type { ProviderId } from "@/lib/payments/types";
import { TIERS, tierRank, type Tier } from "@/lib/products/input";
import { getEditableProduct } from "@/lib/products/queries";
import { activeFreeCount, badgeRecord, bookableWeeks, MAX_ACTIVE_FREE, nextFreeWeek } from "@/lib/products/service";
import { PACKAGES } from "@/lib/submissions/packages";
import { onSpotlightWaitlist, SPOTLIGHT_DAYS, SPOTLIGHT_SPOTS, spotlightAvailable } from "@/lib/products/spotlight";
import { formatWeekLabel, formatWeekRange, weekKeyFor } from "@/lib/weeks";

export type PlanOption = {
  tier: Tier;
  label: string;
  price: string;
  perks: string[];
  picksWeek: boolean;
  available: boolean;
  note?: string;
  /** Spotlight only: every spot is taken, so it can't be bought until one opens. */
  soldOut?: boolean;
};

/** Everything the plan step needs, for the plan page and the debut modal. */
export type PlanChoices = {
  productId: string;
  productName: string;
  status: string;
  options: PlanOption[];
  weeks: Array<{ key: string; label: string }>;
  providers: ProviderId[];
  /** Maker Pro: true when this quarter's free Fast Track is unused, false when used, null without Pro. */
  freeFastTrack: boolean | null;
  /** The maker is on the Spotlight waitlist (and hasn't been emailed about an opening yet). */
  spotlightWaitlisted: boolean;
  /** The badge a free debut needs before it can be submitted. */
  badge: {
    verified: boolean;
    /** An owner or admin is signed in: they may submit without the badge. */
    override: boolean;
    snippets: { light: string; dark: string };
    previewUrls: { light: string; dark: string };
    dnsHost: string;
    dnsValue: string;
  };
};

/** Every paid tier's first perk: no queue, and no waiting for Monday. */
const INSTANT = "Instant debut: live as soon as it's approved, no queue";

const perks: Record<Tier, string[]> = {
  free: [
    "Debuts on a Monday, in the next week with a free slot",
    "Needs our badge on your site, checked before you submit",
    "Dofollow link while the badge stays up",
    "Top 3 of the week keep the link for good",
  ],
  fast_track: [INSTANT, "7 days featured on the homepage", "No badge required", "Guaranteed dofollow link"],
  pro: [
    INSTANT,
    "Or pick a later debut week",
    "14 days featured on the homepage",
    "Weekly newsletter inclusion",
    "Guaranteed dofollow link",
  ],
  premium: [
    INSTANT,
    "Or pick a later debut week",
    "30 days featured on the homepage",
    "Weekly newsletter inclusion",
    "Guaranteed dofollow link",
    "Written launch post on our blog",
  ],
  // Spotlight replaces the featured cards rather than adding to them, so a listing is only ever in one.
  spotlight: [
    INSTANT,
    `${SPOTLIGHT_DAYS} days in the homepage Spotlight, above the featured cards`,
    `Only ${SPOTLIGHT_SPOTS} Spotlight spots at any time`,
    "Top newsletter slot",
    "Guaranteed dofollow link",
    "Written launch post on our blog",
    `Bundled: submission to ${PACKAGES.starter.count} directories`,
  ],
};

/**
 * The maker's plan options for one of their listings, or null if it isn't theirs.
 * `override` (owners and admins) lifts the badge requirement and the waiting-debut cap.
 */
export async function planChoices(
  userId: string,
  productId: string,
  opts: { override?: boolean } = {},
): Promise<PlanChoices | null> {
  const override = opts.override ?? false;
  const editable = /^[0-9a-f-]{36}$/.test(productId) ? await getEditableProduct(productId, userId) : null;
  if (!editable) return null;
  const p = editable.product;

  const [freeWeek, activeFree, credit, badge, spotlightOpen, waitlisted] = await Promise.all([
    nextFreeWeek(),
    activeFreeCount(userId, p.id),
    fastTrackCredit(userId),
    badgeRecord(p.id),
    spotlightAvailable(p.id),
    onSpotlightWaitlist(userId),
  ]);
  const siteUrl = env().NEXT_PUBLIC_SITE_URL;
  const freeAvailable =
    (p.status === "draft" || p.status === "rejected") &&
    p.tier === "free" &&
    (override || activeFree < MAX_ACTIVE_FREE);
  const thisWeek = weekKeyFor(new Date());

  const options: PlanOption[] = (Object.keys(TIERS) as Tier[]).map((tier) => {
    const sku = TIERS[tier].sku ? getSku(TIERS[tier].sku!) : undefined;
    const upgrade = tierRank(tier) > tierRank(p.tier);
    const soldOut = tier === "spotlight" && upgrade && !spotlightOpen;
    const available = tier === "free" ? freeAvailable : upgrade && !soldOut;
    return {
      tier,
      label: TIERS[tier].label,
      price: sku ? formatUsd(sku.amountCents) : "$0",
      perks: perks[tier],
      picksWeek: TIERS[tier].picksWeek,
      available,
      soldOut,
      note:
        tier === "free"
          ? freeAvailable
            ? `Free debuts go live on Mondays. Yours: ${formatWeekLabel(freeWeek)} (${formatWeekRange(freeWeek)}), after review`
            : p.tier !== "free"
              ? "You already have a paid debut"
              : activeFree >= MAX_ACTIVE_FREE
                ? `You have ${MAX_ACTIVE_FREE} free debuts waiting already`
                : "Already submitted"
          : soldOut
            ? `All ${SPOTLIGHT_SPOTS} Spotlight spots are taken. Join the waitlist and we'll email you when one opens.`
            : "Goes live the moment it's approved (usually within 24 hours) and joins this week's board",
    };
  });

  return {
    productId: p.id,
    productName: p.name,
    status: p.status,
    options,
    weeks: bookableWeeks().map((k) => ({
      key: k,
      label:
        k === thisWeek
          ? "Now: live as soon as it's approved, on this week's board"
          : `${formatWeekLabel(k)} · ${formatWeekRange(k)}`,
    })),
    providers: enabledProviders(),
    freeFastTrack: credit.eligible ? credit.available : null,
    spotlightWaitlisted: waitlisted,
    badge: {
      verified: badge?.status === "verified",
      override,
      snippets: {
        light: badgeSnippet({ siteUrl, slug: p.slug, theme: "light" }),
        dark: badgeSnippet({ siteUrl, slug: p.slug, theme: "dark" }),
      },
      previewUrls: { light: `/badge/${p.slug}?theme=light`, dark: `/badge/${p.slug}?theme=dark` },
      dnsHost: p.domain,
      dnsValue: dnsRecordValue(badge?.dnsToken ?? ""),
    },
  };
}
