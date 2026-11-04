import { isPlatformHost, registrableDomain } from "@/lib/outreach/rules";
import { domainOf } from "@/lib/slug";

/** Stores and marketplaces where each product has its own page, on top of the outreach list of platforms. */
const MARKETPLACES =
  /(^|\.)(visualstudio\.com|npmjs\.com|pypi\.org|huggingface\.co|chatgpt\.com|itch\.io|shopify\.com|atlassian\.com|slack\.com|figma\.com|zapier\.com)$/;

/** Query parameters that name the product on a store page: Google Play's `id`, the VS Code marketplace's `itemName`. */
const PRODUCT_PARAMS = ["id", "itemName"];

/** The registrable domain to search listings under: both `app.acme.com` and `acme.com` sit under `acme.com`. */
export function siteRoot(websiteUrl: string): string {
  const host = domainOf(websiteUrl);
  return registrableDomain(host) ?? host;
}

/**
 * What makes two listings the same site. Normally the registrable domain, so
 * `www.acme.com` and `app.acme.com` match `acme.com`. On a host many products
 * share, the domain says nothing, so the page counts: `github.com/a/one` and
 * `github.com/b/two` are different products.
 */
export function siteKey(websiteUrl: string): string {
  const host = domainOf(websiteUrl);
  if (!isPlatformHost(host) && !MARKETPLACES.test(host)) return siteRoot(websiteUrl);
  const url = new URL(websiteUrl);
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  const params = PRODUCT_PARAMS.filter((p) => url.searchParams.has(p)).map((p) => `${p}=${url.searchParams.get(p)}`);
  return `${host}${path}${params.length ? `?${params.join("&")}` : ""}`.toLowerCase();
}

export type ListingOnSite = { websiteUrl: string; createdBy: string; status: string };

/**
 * The listing that stops this one, if any.
 * - Anyone's listing in review or approved holds the site. Relaunching happens on
 *   the same row, so it never gets here.
 * - Someone else's draft, rejected or archived listing doesn't, or anyone could
 *   lock a site by starting a draft for it. It's first to review.
 * - A maker's own draft or rejected listing stops a second new one for that site:
 *   they should finish the one they have.
 * - The same maker can list separate products on separate subdomains.
 */
export function findDuplicate<T extends ListingOnSite>(
  mine: { websiteUrl: string; ownerId: string; isNew: boolean },
  existing: T[],
): T | undefined {
  const key = siteKey(mine.websiteUrl);
  const host = domainOf(mine.websiteUrl);
  return existing.find((other) => {
    if (other.status === "archived" || siteKey(other.websiteUrl) !== key) return false;
    const own = other.createdBy === mine.ownerId;
    if (own && domainOf(other.websiteUrl) !== host) return false;
    return other.status === "pending" || other.status === "approved" || (own && mine.isNew);
  });
}

/** What the maker is told when `findDuplicate` finds a listing. */
export function duplicateMessage(websiteUrl: string, duplicate: ListingOnSite, ownerId: string): string {
  const host = domainOf(websiteUrl);
  return duplicate.createdBy === ownerId
    ? `You already have a listing for ${host}. Open it from your dashboard to edit or relaunch it.`
    : `${host} is already listed on DebutYard. If it's yours, email us and we'll sort it out.`;
}
