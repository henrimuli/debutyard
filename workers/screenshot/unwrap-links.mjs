/**
 * Google sometimes returns results with the destination behind a /goto or /url
 * link. Each one redirects to the real page, so we ask where it goes and never
 * load the page itself.
 */

const WAIT_MS = 5_000;

const isGoogle = (u) => /^(www\.|consent\.|ipv4\.|ipv6\.)?google\.(com|[a-z]{2,3}(\.[a-z]{2})?)$/i.test(u.hostname);
const isWrapped = (u) => isGoogle(u) && /^\/(goto|url)\/?$/.test(u.pathname);
/** Where Google sends a client it's refusing, which isn't a result. */
const isRefusal = (u) => isGoogle(u) && (u.hostname.startsWith("consent.") || /^\/sorry\b/.test(u.pathname));

function parse(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** The page a wrapped link goes to, or the link unchanged if it isn't wrapped or won't say. */
async function resolveLink(raw, fetchImpl) {
  const link = parse(raw);
  if (link?.protocol !== "https:" || !isWrapped(link)) return raw;
  try {
    const res = await fetchImpl(link, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(WAIT_MS),
    });
    const location = res.headers.get("location");
    const to = res.status >= 300 && res.status < 400 && location ? parse(new URL(location, link).href) : null;
    if (!to || !/^https?:$/.test(to.protocol) || isWrapped(to) || isRefusal(to)) return raw;
    return to.href;
  } catch {
    return raw;
  }
}

/**
 * OpenSERP's response with wrapped result links swapped for the real pages. A
 * link that can't be resolved stays wrapped, so the app sees a failed search
 * rather than a Google URL posing as a competitor.
 */
export async function unwrapLinks(body, fetchImpl = fetch) {
  if (!Array.isArray(body?.results)) return body;
  const results = await Promise.all(
    body.results.map(async (r) =>
      typeof r?.url === "string" ? { ...r, url: await resolveLink(r.url, fetchImpl) } : r,
    ),
  );
  return { ...body, results };
}
