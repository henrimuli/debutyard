/**
 * The block we used to email for clients to paste themselves, for orders from
 * before the live block (see lib/badge-block). Pure.
 */

/** Badge-gated rows not found on the client's site after this long are swapped for badge-free directories. */
export const BADGE_WAIT_DAYS = 7;

/** One HTML block with every directory's badge, for the client to paste into their footer. */
export function badgeBlockHtml(badges: Array<{ name: string; snippet: string }>): string {
  const items = badges.map((b) => `  <!-- ${b.name.replace(/--/g, "-")} -->\n  ${b.snippet.trim()}`).join("\n");
  return [
    "<!-- Launch directory badges. Keep these on your site while the listings are live. -->",
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">',
    items,
    "</div>",
  ].join("\n");
}
