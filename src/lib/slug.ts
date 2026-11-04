/** "My Cool App!" → "my-cool-app". Empty input gives "". */
export function slugify(input: string, maxLength = 48): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Short random suffix for de-duplicating slugs. */
export function randomSuffix(length = 4): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Returns `base` if free, else `base-2`, `base-3`… and finally a random suffix.
 * `isTaken` checks the database.
 */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const root = base || randomSuffix(6);
  if (!(await isTaken(root))) return root;
  for (let n = 2; n <= 5; n++) {
    const candidate = `${root}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${root}-${randomSuffix()}`;
}

/** Normalises a URL's hostname for duplicate detection: lowercase, no "www.", no trailing dot. */
export function domainOf(url: string): string {
  return new URL(url).hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}
