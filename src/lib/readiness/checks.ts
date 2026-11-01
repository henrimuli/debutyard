import type { BadgeCheck } from "@/lib/badges/detect";
import { findTags, pageTitle } from "@/lib/html";
import type { Prefill } from "@/lib/products/prefill";

/** Launch-readiness checks. Pure: the service fetches the page and looks up duplicates. */

export type CheckStatus = "pass" | "warn" | "fail";
export type Check = { id: string; label: string; status: CheckStatus; detail: string; weight: number };

export type Existing = { slug: string; status: string; debutEnded: boolean } | null;

export type PageFacts = {
  finalUrl: string;
  status: number;
  html: string;
  prefill: Prefill;
  badge: BadgeCheck;
  /** Our plain fetch was turned away and we only got the page another way. */
  blocksBots?: boolean;
};

const points: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

export function scoreChecks(checks: Check[]): number {
  const total = checks.reduce((n, c) => n + c.weight, 0);
  if (total === 0) return 0;
  return Math.round((100 * checks.reduce((n, c) => n + c.weight * points[c.status], 0)) / total);
}

export function duplicateCheck(existing: Existing): Check {
  const base = { id: "unique", label: "Not already listed", weight: 15 };
  if (!existing) return { ...base, status: "pass", detail: "This domain isn't on DebutYard yet." };
  if (existing.status === "approved" && existing.debutEnded) {
    return {
      ...base,
      status: "warn",
      detail: `Already debuted at /p/${existing.slug}. Shipped a big new version? A Relaunch puts it back on the board.`,
    };
  }
  return {
    ...base,
    status: "fail",
    detail: `Already ${existing.status === "approved" ? "listed" : "submitted"} at /p/${existing.slug}.`,
  };
}

/** Checks for a page that couldn't be fetched at all. */
export function unreachableChecks(reason: string, existing: Existing): Check[] {
  return [
    { id: "reachable", label: "Site is reachable", status: "fail", detail: reason, weight: 20 },
    duplicateCheck(existing),
  ];
}

export function pageChecks(page: PageFacts, existing: Existing): Check[] {
  const checks: Check[] = [];
  const https = page.finalUrl.startsWith("https://");
  checks.push({
    id: "https",
    label: "Served over HTTPS",
    status: https ? "pass" : "fail",
    detail: https ? "Good." : "Visitors and directories expect HTTPS. Most hosts give you a free certificate.",
    weight: 15,
  });

  const ok = page.status >= 200 && page.status < 300;
  checks.push({
    id: "reachable",
    label: "Site is reachable",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `Responded ${page.status}.`
      : `Responded ${page.status}. Reviewers will reject a page that doesn't load.`,
    weight: 20,
  });

  if (page.blocksBots) {
    checks.push({
      id: "bots",
      label: "Open to bots",
      status: "warn",
      detail: "Your site blocks simple bots. Some directories and AI crawlers may not see it.",
      weight: 5,
    });
  }

  const title = pageTitle(page.html)?.trim();
  checks.push({
    id: "title",
    label: "Page title",
    status: !title ? "fail" : title.length < 10 || title.length > 70 ? "warn" : "pass",
    detail: !title
      ? "No <title>. Add one with your product name and what it does."
      : title.length > 70
        ? `${title.length} characters; search results cut off around 60–70.`
        : title.length < 10
          ? "Very short. Say what the product does, not just its name."
          : `"${title}"`,
    weight: 10,
  });

  const metas = findTags(page.html, "meta");
  const meta = (key: string) =>
    metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === key && m.content)?.content?.trim();
  const description = meta("description");
  checks.push({
    id: "description",
    label: "Meta description",
    status: !description ? "fail" : description.length < 50 || description.length > 160 ? "warn" : "pass",
    detail: !description
      ? "No meta description. Search engines and link previews use it."
      : description.length > 160
        ? `${description.length} characters; aim for 50–160.`
        : description.length < 50
          ? `Only ${description.length} characters; aim for 50–160.`
          : "Good length.",
    weight: 10,
  });

  checks.push({
    id: "og_image",
    label: "Social preview image",
    status: page.prefill.imageUrl ? "pass" : "warn",
    detail: page.prefill.imageUrl
      ? "og:image found, so shared links get a preview."
      : "No og:image. Links shared on X, LinkedIn and Slack will show no image.",
    weight: 10,
  });

  const hasIcon = findTags(page.html, "link").some((l) => /\bicon\b/i.test(l.rel ?? ""));
  checks.push({
    id: "icon",
    label: "Icon / logo",
    status: hasIcon ? "pass" : "warn",
    detail: hasIcon
      ? "Found an icon we can use as your logo."
      : "No icon link found; you can upload a logo when you submit.",
    weight: 5,
  });

  const robots = (meta("robots") ?? "").toLowerCase();
  checks.push({
    id: "indexable",
    label: "Indexable",
    status: robots.includes("noindex") ? "fail" : "pass",
    detail: robots.includes("noindex")
      ? "The page has noindex, so search engines won't list it (and backlinks won't help)."
      : "No noindex tag.",
    weight: 5,
  });

  checks.push(duplicateCheck(existing));

  checks.push({
    id: "badge",
    label: "DebutYard badge",
    status: page.badge.ok ? "pass" : "warn",
    detail: page.badge.ok
      ? "Badge found: a free debut gets a dofollow link."
      : page.badge.reason === "nofollow"
        ? page.badge.detail
        : "Not on the page yet. Free debuts need it for a dofollow link; paid debuts don't.",
    weight: 10,
  });

  return checks;
}

/** A listing draft from the page, trimmed to the submit form's limits. */
export function suggestedListing(prefill: Prefill) {
  const cut = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return {
    name: cut(prefill.name, 60) ?? null,
    tagline: cut(prefill.tagline, 80) ?? null,
    description: cut(prefill.description, 2000) ?? null,
    logoUrl: prefill.logoUrl ?? null,
    categories: prefill.categories,
  };
}
