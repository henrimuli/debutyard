/** The site origin, without a trailing slash. Read lazily so tests can set it. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://debutyard.com").replace(/\/+$/, "");
}
