import "server-only";
import { sql } from "drizzle-orm";
import { queryRows } from "@/db";
import { weekBounds, weekKeyFor } from "@/lib/weeks";

/** How long each paid tier stays in the homepage featured rail, from the moment it goes live. */
export const FEATURED_DAYS = { fast_track: 7, pro: 14, premium: 30, spotlight: 30 } as const;

export type FeaturedItem = {
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  tier: "fast_track" | "pro" | "premium" | "spotlight";
  hero: boolean;
};

/**
 * Is a paid product inside its featured window right now? The window opens when
 * the listing goes live: its debut week's Monday, or approval if that came later
 * (instant debuts approved mid-week get their full days). Pure.
 */
export function isFeaturedNow(tier: string, weekKey: string, approvedAt: Date | null, now = new Date()): boolean {
  const days = FEATURED_DAYS[tier as keyof typeof FEATURED_DAYS];
  if (!days) return false;
  const start = Math.max(weekBounds(weekKey).startsAt.getTime(), approvedAt?.getTime() ?? 0);
  return now.getTime() >= start && now.getTime() < start + days * 86_400_000;
}

/**
 * Spotlight sits in the homepage Spotlight for its 30 days instead of the
 * featured cards, so a listing is only ever in one of the two.
 */
export function isHeroNow(tier: string, weekKey: string, approvedAt: Date | null, now = new Date()): boolean {
  return tier === "spotlight" && isFeaturedNow(tier, weekKey, approvedAt, now);
}

/** What's in the featured rail now: paid debuts inside their window. */
export async function featuredNow(now = new Date()): Promise<FeaturedItem[]> {
  const current = weekKeyFor(now);
  const rows = (await queryRows(sql`
    select slug, name, tagline, logo_url, tier, launch_week_key, approved_at
    from products
    where status = 'approved' and tier in ('fast_track', 'pro', 'premium', 'spotlight') and launch_week_key <= ${current}
    order by case tier when 'spotlight' then 0 when 'premium' then 1 when 'pro' then 2 else 3 end, approved_at
  `)) as unknown as Array<{
    slug: string;
    name: string;
    tagline: string;
    logo_url: string | null;
    tier: FeaturedItem["tier"];
    launch_week_key: string;
    approved_at: Date | string | null;
  }>;
  const paid = rows
    .filter((r) => isFeaturedNow(r.tier, r.launch_week_key, r.approved_at ? new Date(r.approved_at) : null, now))
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      logoUrl: r.logo_url,
      tier: r.tier,
      hero: isHeroNow(r.tier, r.launch_week_key, r.approved_at ? new Date(r.approved_at) : null, now),
    }));
  return [...paid.filter((p) => p.hero), ...paid.filter((p) => !p.hero)];
}

export type CardMedia = { imageUrl: string | null; websiteUrl: string };

/** First screenshot and site URL by slug, for the homepage's sponsored cards. */
export async function cardMediaForSlugs(slugs: string[]) {
  const out = new Map<string, CardMedia>();
  if (slugs.length === 0) return out;
  const rows = (await queryRows(sql`
    select p.slug, p.website_url,
      (select m.url from product_media m where m.product_id = p.id order by m.position limit 1) as image_url
    from products p
    where p.slug in (${sql.join(
      slugs.map((s) => sql`${s}`),
      sql`, `,
    )})
  `)) as unknown as Array<{ slug: string; website_url: string; image_url: string | null }>;
  for (const r of rows) out.set(r.slug, { imageUrl: r.image_url, websiteUrl: r.website_url });
  return out;
}
