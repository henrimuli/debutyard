/** Done-for-you submission packages (PLAN §5.3). Pure config. */

export type PackageId = "starter" | "growth" | "scale";

/**
 * `monitorMonths`: Link Monitor included after delivery. `extra`: the package
 * promises more than its count ("90+"), so each order gets 1 to this many on top.
 */
export const PACKAGES: Record<
  PackageId,
  { sku: string; label: string; count: number; extra?: number; days: number; monitorMonths: number }
> = {
  starter: { sku: "submission_starter", label: "Starter", count: 30, days: 7, monitorMonths: 3 },
  growth: { sku: "submission_growth", label: "Growth", count: 60, days: 14, monitorMonths: 6 },
  scale: { sku: "submission_scale", label: "Scale", count: 90, extra: 5, days: 14, monitorMonths: 12 },
};

/** A package's size as we advertise it: "30", or "90+". */
export function countLabel(id: PackageId): string {
  return `${PACKAGES[id].count}${PACKAGES[id].extra ? "+" : ""}`;
}

/** The smallest and largest packages, for copy: "30–90+". */
export const COUNT_RANGE = `${PACKAGES.starter.count}–${countLabel("scale")}`;

/** How many directories a new order gets, fixed when it's bought. Scale lands on 91 to 95. */
export function targetCountFor(id: PackageId, random: () => number = Math.random): number {
  const { count, extra } = PACKAGES[id];
  return extra ? count + 1 + Math.floor(random() * extra) : count;
}

export function packageForSku(sku: string): PackageId | null {
  return (Object.keys(PACKAGES) as PackageId[]).find((p) => PACKAGES[p].sku === sku) ?? null;
}

/** Our product categories → directory niche, for matching targets. */
const NICHE_OF_CATEGORY: Record<string, "ai" | "devtools" | "b2b"> = {
  ai: "ai",
  "developer-tools": "devtools",
  devops: "devtools",
  data: "devtools",
  "open-source": "devtools",
  security: "devtools",
  sales: "b2b",
  hr: "b2b",
  "customer-support": "b2b",
  finance: "b2b",
  analytics: "b2b",
};

export function nichesFor(categories: string[]): Set<string> {
  return new Set(categories.map((c) => NICHE_OF_CATEGORY[c]).filter(Boolean));
}

export type TargetCandidate = {
  id: string;
  niche: string;
  dr: number | null;
  linkType: string;
  badgeRequired: boolean;
  guided: boolean;
  isActive: boolean;
  starred: boolean;
  acceptanceRate: number | null;
};

/** Can this directory go on an order at all? Only ones we know give a dofollow link. */
export function isOrderTarget(c: Pick<TargetCandidate, "isActive" | "guided" | "linkType">): boolean {
  return c.isActive && !c.guided && c.linkType === "dofollow";
}

/**
 * Picks directories for an order, best first: active, not guided, dofollow,
 * badge-gated only if the client allows badges. Directories staff starred come
 * first, then badge-gated ones, as many as fit. Niche matches and general
 * directories rank above other niches; then DR, then our acceptance rate. Pure.
 */
export function selectTargets(
  candidates: TargetCandidate[],
  opts: { count: number; categories: string[]; allowBadges: boolean; exclude?: Set<string> },
): string[] {
  const niches = nichesFor(opts.categories);
  const fit = (c: TargetCandidate) => (niches.has(c.niche) ? 2 : c.niche === "general" || c.niche === "indie" ? 1 : 0);
  return candidates
    .filter((c) => isOrderTarget(c) && (opts.allowBadges || !c.badgeRequired) && !opts.exclude?.has(c.id))
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        Number(b.badgeRequired) - Number(a.badgeRequired) ||
        fit(b) - fit(a) ||
        (b.dr ?? -1) - (a.dr ?? -1) ||
        (b.acceptanceRate ?? 0.5) - (a.acceptanceRate ?? 0.5) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, opts.count)
    .map((c) => c.id);
}
