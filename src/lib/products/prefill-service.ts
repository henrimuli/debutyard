import "server-only";
import { fetchPage, type PageResult } from "@/lib/fetch-page";
import { UnsafeUrlError } from "@/lib/net";
import { extractPrefill, prefillPages, type Prefill } from "./prefill";

/** Time allowed for the extra pages (features, pricing, about), read in parallel after the homepage. */
const EXTRA_PAGES_MS = 2500;

/** Fetches a site and suggests listing details, with copy built from its homepage and a couple of linked pages. */
export async function prefillFromSite(
  url: string,
): Promise<{ ok: true; data: Prefill } | { ok: false; error: string }> {
  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  let page: PageResult;
  try {
    page = await fetchPage(normalized, { purpose: "read", timeoutMs: 8000 });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ok: false, error: err.message };
    return { ok: false, error: "We couldn't reach that site. You can fill the details in by hand." };
  }
  if (page.blocked)
    return { ok: false, error: "Your site blocks automated visits. You can fill the details in by hand." };
  if (page.status >= 400) return { ok: false, error: `Your site returned HTTP ${page.status}.` };

  // Pages that are slow, fail or aren't HTML are skipped; the homepage alone still fills the form.
  // Firecrawl only helps with these if the homepage needed it too.
  const fallback = page.via === "firecrawl";
  const extra = await Promise.allSettled(
    prefillPages(page.body, page.url).map((u) =>
      fetchPage(u, { purpose: "read", timeoutMs: EXTRA_PAGES_MS, maxBytes: 800_000, fallback }),
    ),
  );
  const pages = extra.flatMap((r) =>
    r.status === "fulfilled" && r.value.status < 400 && !r.value.blocked && r.value.contentType.includes("html")
      ? [{ html: r.value.body, url: r.value.url }]
      : [],
  );
  return { ok: true, data: extractPrefill(page.body, page.url, pages) };
}
