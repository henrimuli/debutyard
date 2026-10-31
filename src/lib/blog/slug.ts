const MAX_SLUG_LENGTH = 70;

/** Lowercase, ASCII, hyphen-separated. Empty input yields an empty string. */
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= MAX_SLUG_LENGTH) return s;
  // Cut on a word boundary so slugs never end mid-word.
  const cut = s.slice(0, MAX_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 100;
}

/** Slugs that would collide with real routes under /blog. */
const RESERVED = new Set([
  "category",
  "tag",
  "author",
  "rss.xml",
  "feed",
  "search",
  "page",
  "new",
  "preview",
  "review",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** Returns `base`, or `base-2`, `base-3`… the first one not in `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || "untitled";
  let candidate = isReservedSlug(root) ? `${root}-post` : root;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}
