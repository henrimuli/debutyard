import { describe, expect, it, vi } from "vitest";
import {
  createSerpProvider,
  normalizeForSerp,
  parseDataForSeoSerp,
  parseDataForSeoTop,
  parseSerpApi,
  searchOrError,
  SerpError,
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

describe("searchOrError", () => {
  const rows = [{ position: 1 }];
  const engineError = () => {
    try {
      return parseDataForSeoTop({ tasks: [{ status_code: 40101, status_message: "Internal SE Server Error." }] });
    } catch (err) {
      return err as SerpError;
    }
  };

  it("doesn't try again after a success", async () => {
    const search = vi.fn().mockResolvedValue(rows);
    expect(await searchOrError(search, "k", 0)).toEqual({ rows });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("tries a search engine error once more", async () => {
    const search = vi.fn().mockRejectedValueOnce(engineError()).mockResolvedValue(rows);
    expect(await searchOrError(search, "k", 0)).toEqual({ rows });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("hands back the error when it fails twice", async () => {
    const search = vi.fn().mockRejectedValue(engineError());
    const r = await searchOrError(search, "k", 0);
    expect(r).toHaveProperty("error");
    expect("error" in r && r.error.message).toContain("(40101)");
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("treats a timeout as something that can pass", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const search = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue(rows);
    expect(await searchOrError(search, "k", 0)).toEqual({ rows });
  });

  it("throws straight away when trying again can't help", async () => {
    const search = vi.fn().mockRejectedValue(new SerpError("DataForSEO SERP task failed (40200): Payment Required."));
    await expect(searchOrError(search, "k", 0)).rejects.toThrow("40200");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("marks only passing failures as such", () => {
    const fails = (status_code: number) => {
      try {
        parseDataForSeoTop({ tasks: [{ status_code }] });
      } catch (err) {
        return (err as SerpError).transient;
      }
    };
    expect(fails(40101)).toBe(true);
    expect(fails(50401)).toBe(true);
    expect(fails(40200)).toBe(false);
    expect(fails(40501)).toBe(false);
  });
});
