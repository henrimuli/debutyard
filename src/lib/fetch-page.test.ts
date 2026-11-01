import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/env";
import { fetchPage, isBotWall, isThinPage, type FetchPageOpts } from "./fetch-page";
import { UnsafeUrlError } from "./net";

const publicDns = async () => ["93.184.216.34"];
const longText = `<html><title>Acme</title><body><p>${"Invoices that chase themselves. ".repeat(20)}</p></body></html>`;
const rescued = "<html><title>Acme, as a browser saw it</title><body>Real page</body></html>";

type Scrape = { status?: number; body?: unknown; throws?: boolean };

/** Routes Firecrawl's endpoint to `scrape` and everything else to `direct`, recording what Firecrawl was sent. */
function fakeFetch(direct: () => Response | Promise<Response>, scrape: Scrape = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).startsWith("https://api.firecrawl.dev/")) {
      sent.push(JSON.parse(String(init?.body)));
      if (scrape.throws) throw new Error("socket hang up");
      const body = scrape.body ?? {
        success: true,
        data: {
          rawHtml: rescued,
          markdown: "# Acme",
          metadata: { statusCode: 200, url: "https://acme.example/final" },
        },
      };
      return Response.json(body, { status: scrape.status ?? 200 });
    }
    return direct();
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

const opts = (fetchImpl: typeof fetch, rest: Partial<FetchPageOpts> = {}): FetchPageOpts => ({
  purpose: "verify",
  resolve: publicDns,
  fetchImpl,
  ...rest,
});
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });
const URL_ = "https://acme.example/";

describe("isBotWall and isThinPage", () => {
  it("treats refusals and challenge pages as walls, but not an ordinary error", () => {
    for (const status of [401, 403, 429]) expect(isBotWall({ status, body: "" })).toBe(true);
    expect(isBotWall({ status: 200, body: "<title>Just a moment...</title>" })).toBe(true);
    expect(isBotWall({ status: 503, body: "<title>Attention Required! | Cloudflare</title>" })).toBe(true);
    for (const status of [200, 404, 500, 503]) expect(isBotWall({ status, body: "<title>Acme</title>" })).toBe(false);
  });

  it("spots a page with only an app shell", () => {
    const page = (body: string, contentType = "text/html") => ({ status: 200, contentType, body });
    expect(isThinPage(page('<div id="root"></div><script>' + "x".repeat(5000) + "</script>"))).toBe(true);
    expect(isThinPage(page(longText))).toBe(false);
    expect(isThinPage(page("{}", "application/json"))).toBe(false);
    expect(isThinPage({ ...page(""), status: 404 })).toBe(false);
  });
});

describe("fetchPage", () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    resetEnvForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
    resetEnvForTests();
    vi.restoreAllMocks();
  });

  it("uses the direct page when it's fine, without spending a credit", async () => {
    const { fetchImpl, sent } = fakeFetch(() => html(longText));
    const page = await fetchPage(URL_, opts(fetchImpl));
    expect(page).toMatchObject({ via: "direct", status: 200, blocked: false, directBlocked: false });
    expect(sent).toEqual([]);
  });

  it.each([401, 403, 429, 503])("falls back on HTTP %i", async (status) => {
    const { fetchImpl, sent } = fakeFetch(() => html("nope", status));
    const page = await fetchPage(URL_, opts(fetchImpl));
    expect(page).toMatchObject({
      via: "firecrawl",
      status: 200,
      url: "https://acme.example/final",
      body: rescued,
      blocked: false,
      directBlocked: true,
    });
    expect(sent).toHaveLength(1);
  });

  it("falls back on a challenge page served as a 200", async () => {
    const { fetchImpl } = fakeFetch(() => html("<title>Just a moment...</title>"));
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "firecrawl", directBlocked: true });
  });

  it("falls back on a connection error or timeout, without calling that blocked", async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "firecrawl", directBlocked: false });
  });

  it("leaves real errors alone", async () => {
    for (const status of [404, 410, 500]) {
      const { fetchImpl, sent } = fakeFetch(() => html("gone", status));
      expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "direct", status, blocked: false });
      expect(sent).toEqual([]);
    }
  });

  it("retries a near-empty page only when reading content", async () => {
    const shell = () => html('<div id="root"></div>');
    const verify = fakeFetch(shell);
    expect(await fetchPage(URL_, opts(verify.fetchImpl))).toMatchObject({ via: "direct" });
    expect(verify.sent).toEqual([]);
    const read = fakeFetch(shell);
    expect(await fetchPage(URL_, opts(read.fetchImpl, { purpose: "read" }))).toMatchObject({
      via: "firecrawl",
      directBlocked: false,
    });
  });

  it("keeps a thin page that loaded over a Firecrawl error page", async () => {
    const { fetchImpl } = fakeFetch(() => html('<div id="root"></div>'), {
      body: { success: true, data: { rawHtml: "Not found", metadata: { statusCode: 404 } } },
    });
    expect(await fetchPage(URL_, opts(fetchImpl, { purpose: "read" }))).toMatchObject({ via: "direct", status: 200 });
  });

  it("believes Firecrawl when a blocked page turns out to be gone", async () => {
    const { fetchImpl } = fakeFetch(() => html("nope", 403), {
      body: { success: true, data: { rawHtml: "Not found", metadata: { statusCode: 404 } } },
    });
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "firecrawl", status: 404, blocked: false });
  });

  it("reports blocked when Firecrawl is turned away too", async () => {
    const { fetchImpl } = fakeFetch(() => html("nope", 403), {
      body: { success: true, data: { rawHtml: "Denied", metadata: { statusCode: 403 } } },
    });
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "direct", status: 403, blocked: true });
  });

  it("reports what Firecrawl saw when the direct fetch got no answer at all", async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new TypeError("fetch failed")), {
      body: { success: true, data: { rawHtml: "Denied", metadata: { statusCode: 403 } } },
    });
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "firecrawl", status: 403, blocked: true });
  });

  it.each<[string, Scrape]>([
    ["out of credits", { status: 402, body: { success: false, error: "Payment required" } }],
    ["rate limited", { status: 429, body: { success: false, error: "Rate limit exceeded" } }],
    ["a failed scrape", { body: { success: false, error: "Scrape failed" } }],
    ["no HTML back", { body: { success: true, data: {} } }],
    ["a network error", { throws: true }],
  ])("is no worse off after %s", async (_name, scrape) => {
    const blocked = fakeFetch(() => html("nope", 403), scrape);
    expect(await fetchPage(URL_, opts(blocked.fetchImpl))).toMatchObject({ via: "direct", status: 403, blocked: true });
    const failing = fakeFetch(() => Promise.reject(new TypeError("fetch failed")), scrape);
    await expect(fetchPage(URL_, opts(failing.fetchImpl))).rejects.toThrow("fetch failed");
  });

  it("does nothing extra without an API key", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    resetEnvForTests();
    const { fetchImpl, sent } = fakeFetch(() => html("nope", 403));
    expect(await fetchPage(URL_, opts(fetchImpl))).toMatchObject({ via: "direct", status: 403, blocked: true });
    expect(sent).toEqual([]);
  });

  it("stays direct when the fallback is turned off", async () => {
    const { fetchImpl, sent } = fakeFetch(() => html("nope", 403));
    expect(await fetchPage(URL_, opts(fetchImpl, { fallback: false }))).toMatchObject({ via: "direct" });
    expect(sent).toEqual([]);
  });

  it("never sends an unsafe URL to Firecrawl", async () => {
    const { fetchImpl, sent } = fakeFetch(
      () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }),
    );
    await expect(fetchPage(URL_, opts(fetchImpl))).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(
      fetchPage("https://internal.example/", opts(fetchImpl, { resolve: async () => ["10.0.0.5"] })),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(sent).toEqual([]);
  });

  it("asks for a fresh, uncached copy when verifying and allows a recent one when reading", async () => {
    const verify = fakeFetch(() => html("nope", 403));
    await fetchPage(URL_, opts(verify.fetchImpl));
    expect(verify.sent[0]).toMatchObject({ url: URL_, formats: ["rawHtml"], maxAge: 0, storeInCache: false });

    const read = fakeFetch(() => html("nope", 403));
    const page = await fetchPage(URL_, opts(read.fetchImpl, { purpose: "read", markdown: true }));
    expect(read.sent[0]).toMatchObject({ formats: ["rawHtml", "markdown"], onlyMainContent: true, maxAge: 86_400_000 });
    expect(read.sent[0]).not.toHaveProperty("storeInCache");
    expect(page.markdown).toBe("# Acme");
  });

  it("holds Firecrawl's page to the size cap", async () => {
    const { fetchImpl } = fakeFetch(() => html("nope", 403));
    expect((await fetchPage(URL_, opts(fetchImpl, { maxBytes: 10 }))).body).toHaveLength(10);
  });
});
