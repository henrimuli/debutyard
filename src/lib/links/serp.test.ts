import { describe, expect, it, vi } from "vitest";
import {
  createSerpProvider,
  normalizeForSerp,
  parseDataForSeoSerp,
  parseDataForSeoTop,
  parseSerpApi,
  serpQuery,
} from "./serp";

const page = "https://www.dir.test/p/acme/";

describe("index check", () => {
  it("normalizes URLs like a results page shows them", () => {
    expect(normalizeForSerp("https://WWW.Dir.test/p/acme/")).toBe("dir.test/p/acme");
    expect(normalizeForSerp("http://dir.test/p/acme?x=1")).toBe("dir.test/p/acme?x=1");
    expect(serpQuery(page)).toBe("site:dir.test/p/acme");
  });

  it("reads SerpApi results", () => {
    expect(parseSerpApi({ organic_results: [{ link: "https://dir.test/p/acme" }] }, page)).toBe(true);
    expect(parseSerpApi({ organic_results: [{ link: "https://dir.test/p/other" }] }, page)).toBe(false);
    expect(parseSerpApi({ error: "Google hasn't returned any results for this query." }, page)).toBe(false);
    expect(() => parseSerpApi({ error: "Invalid API key." }, page)).toThrow();
  });

  it("reads DataForSEO results, organic items only", () => {
    const body = (items: unknown[]) => ({ tasks: [{ status_code: 20000, result: [{ items }] }] });
    expect(parseDataForSeoSerp(body([{ type: "organic", url: "http://dir.test/p/acme" }]), page)).toBe(true);
    expect(parseDataForSeoSerp(body([{ type: "paid", url: "https://dir.test/p/acme" }]), page)).toBe(false);
    expect(() => parseDataForSeoSerp({ tasks: [{ status_code: 40101 }] }, page)).toThrow();
    expect(() => parseDataForSeoTop({ tasks: [{ status_code: 40200, status_message: "Payment Required." }] })).toThrow(
      "DataForSEO SERP task failed (40200): Payment Required.",
    );
    expect(() => parseDataForSeoTop({ status_code: 50000, status_message: "Internal Error.", tasks: [] })).toThrow(
      "(50000): Internal Error.",
    );
  });

  it("sends the site: query", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ organic_results: [] }));
    await createSerpProvider("serpapi", "KEY", fetchImpl as unknown as typeof fetch).isIndexed(page);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("q")).toBe("site:dir.test/p/acme");
    expect(new URL(url).searchParams.get("api_key")).toBe("KEY");
  });
});
