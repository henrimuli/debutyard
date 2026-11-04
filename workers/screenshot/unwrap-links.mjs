/**
 * Google sometimes returns results with the destination behind a /goto or /url
 * link. Each one redirects to the real page, so we ask where it goes and never
 * load the page itself. Google limits rapid lookups, so they go one at a time
 * and stop at the first that doesn't give an answer. Outreach only needs the
 * site, so a link we couldn't look up falls back to the result's own domain.
 */

const GAP_MS = 1_000;
const WAIT_MS = 3_000;
/** The app waits on this, on top of the search itself. */
const BUDGET_MS = 10_000;

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

const wrappedLink = (raw) => {
  const link = typeof raw === "string" ? parse(raw) : null;
  return link?.protocol === "https:" && isWrapped(link) ? link : null;
};

/** The page a wrapped link goes to, or null if Google won't say. */
async function lookUp(link, fetchImpl) {
  try {
    const res = await fetchImpl(link, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(WAIT_MS),
    });
    const location = res.headers.get("location");
    const to = res.status >= 300 && res.status < 400 && location ? parse(new URL(location, link).href) : null;
    return to && /^https?:$/.test(to.protocol) && !isWrapped(to) && !isRefusal(to) ? to.href : null;
  } catch {
    return null;
  }
}

/** The site's front page from a result's domain, unless that's missing, malformed or Google itself. */
function fromDomain(domain) {
  if (typeof domain !== "string" || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return null;
  const site = parse(`https://${domain}/`);
  return site && !isGoogle(site) ? site.href : null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * OpenSERP's response with wrapped result links swapped for the real pages, or
 * else the result's site. A link with neither stays wrapped, so the app sees a
 * failed search rather than a Google URL posing as a competitor.
 */
export async function unwrapLinks(body, { fetchImpl = fetch, gapMs = GAP_MS, budgetMs = BUDGET_MS } = {}) {
  if (!Array.isArray(body?.results)) return body;
  const started = Date.now();
  let lookups = 0;
  let limited = false;
  const results = [];
  for (const result of body.results) {
    const link = wrappedLink(result?.url);
    if (!link) {
      results.push(result);
      continue;
    }
    let url = null;
    if (!limited && Date.now() - started < budgetMs) {
      if (lookups++ > 0) await wait(gapMs);
      url = await lookUp(link, fetchImpl);
      limited = !url;
    }
    results.push({ ...result, url: url ?? fromDomain(result.domain) ?? result.url });
  }
  return { ...body, results };
}
