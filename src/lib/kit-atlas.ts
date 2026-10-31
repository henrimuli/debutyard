/** The Founder Kit's Directory Atlas: the directory catalog sorted into the order to work through it. */

export type AtlasDirectory = {
  slug: string;
  name: string;
  url: string;
  submitUrl: string | null;
  description: string;
  niche: string;
  pricing: "free" | "freemium" | "paid";
  dr: number | null;
  linkType: "dofollow" | "nofollow" | "unknown";
  badgeRequired: boolean;
  needsAccount: boolean;
  guided: boolean;
  queueEstimateDays: number | null;
  submissionNotes: string;
};

export type AtlasTierId = "launch-day" | "free-wins" | "worth-paying" | "long-tail";

export const ATLAS_TIERS: { id: AtlasTierId; title: string; advice: string }[] = [
  {
    id: "launch-day",
    title: "Launch day: do these yourself",
    advice:
      "Big communities that reward a real maker showing up. Post on launch day, stay in the comments for the first few hours, and never ask for upvotes.",
  },
  {
    id: "free-wins",
    title: "Week one: free, followed links, no badge",
    advice:
      "The best effort-to-value submissions. Work down the list by authority; each takes 5–10 minutes with your copy ready.",
  },
  {
    id: "worth-paying",
    title: "Worth paying for",
    advice:
      "High-authority directories with a fee. Pick two or three that match your niche rather than buying everything.",
  },
  {
    id: "long-tail",
    title: "The long tail",
    advice:
      "Smaller, nofollow, badge-gated or niche sites. Useful for referral traffic and brand searches; batch them in month two.",
  },
];

/** Paid directories below this authority are not "worth paying" for and drop to the long tail. */
const PAID_MIN_DR = 50;

export function atlasTier(d: AtlasDirectory): AtlasTierId {
  if (d.guided) return "launch-day";
  if (d.pricing !== "paid" && d.linkType === "dofollow" && !d.badgeRequired) return "free-wins";
  if (d.pricing === "paid" && (d.dr ?? 0) >= PAID_MIN_DR) return "worth-paying";
  return "long-tail";
}

/** Tiers in reading order, each sorted by authority (unknown last), then name. */
export function atlasTiers(dirs: AtlasDirectory[]) {
  const byDr = (a: AtlasDirectory, b: AtlasDirectory) => (b.dr ?? -1) - (a.dr ?? -1) || a.name.localeCompare(b.name);
  return ATLAS_TIERS.map((t) => ({ ...t, items: dirs.filter((d) => atlasTier(d) === t.id).sort(byDr) }));
}

const csvCell = (v: string | number | boolean | null) => {
  const s = v === null ? "" : String(v);
  // Leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function atlasCsv(dirs: AtlasDirectory[]): string {
  const head = [
    "tier",
    "name",
    "submit_url",
    "authority",
    "pricing",
    "link",
    "badge_required",
    "account_needed",
    "queue_days",
    "niche",
    "notes",
  ];
  const titles = Object.fromEntries(ATLAS_TIERS.map((t) => [t.id, t.title]));
  const rows = atlasTiers(dirs).flatMap((t) =>
    t.items.map((d) => [
      titles[t.id]!,
      d.name,
      d.submitUrl || d.url,
      d.dr,
      d.pricing,
      d.linkType,
      d.badgeRequired,
      d.needsAccount,
      d.queueEstimateDays,
      d.niche,
      d.submissionNotes,
    ]),
  );
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
