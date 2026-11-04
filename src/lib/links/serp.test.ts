import { describe, expect, it, vi } from "vitest";
import {
  createSerpProvider,
  createSerpSearch,
  normalizeForSerp,
  parseOpenSerp,
  parseOpenSerpIndexed,
  searchOrError,
  SerpError,
  serpQuery,
} from "./serp";

const page = "https://www.dir.test/p/acme/";
const organic = (url: string, rank = 1) => ({ rank, type: "organic", url, title: "T", snippet: "S" });
const body = (...results: object[]) => ({ meta: { engines_failed: [] }, results });
const answering = (json: unknown, status = 200) =>
  vi.fn(async () => Response.json(json, { status })) as unknown as typeof fetch;
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err as SerpError;
  }
  throw new Error("didn't throw");
};

describe("OpenSERP results", () => {
  it("keeps organic results and maps their fields", () => {
    expect(parseOpenSerp(body({ rank: 1, type: "ad", url: "https://ad.test" }, organic("https://a.test/", 2)))).toEqual(
      [{ position: 2, url: "https://a.test/", title: "T", description: "S" }],
    );
  });

  it("treats a failed engine or a missing list as something that can pass", () => {
    expect(fails(() => parseOpenSerp({ meta: { engines_failed: ["google"] }, results: [] })).transient).toBe(true);
    expect(fails(() => parseOpenSerp({ error: "captcha_detected" })).transient).toBe(true);
  });

  it("refuses links Google has hidden, so Google never reads as a competitor", () => {
    const hidden = body(organic("https://a.test/"), organic("https://www.google.com/goto?url=CAESWAHr", 2));
    expect(fails(() => parseOpenSerp(hidden)).transient).toBe(true);
    expect(fails(() => parseOpenSerp(body(organic("https://www.google.es/url?q=x")))).transient).toBe(true);
    // A real Google page isn't a hidden link.
    expect(parseOpenSerp(body(organic("https://support.google.com/goto-help")))).toHaveLength(1);
  });
});

describe("outreach search", () => {
  it("asks the worker with the secret", async () => {
    const fetchImpl = answering(body(organic("https://a.test/")));
    const rows = await createSerpSearch("https://worker.test", "SECRET", fetchImpl)("invoicing software");
    expect(rows).toHaveLength(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://worker.test/search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET");
    expect(JSON.parse(init.body as string)).toEqual({ text: "invoicing software", limit: 10 });
  });

  it("reads no results as a block, not as no competitors", async () => {
    const err = await createSerpSearch("https://worker.test", "S", answering(body()))("k").catch((e) => e);
    expect(err).toBeInstanceOf(SerpError);
    expect(err.transient).toBe(true);
  });

  it.each([
    [429, true],
    [403, true],
    [502, true],
    [504, true],
    [401, false],
    [400, false],
  ])("treats HTTP %i as passing: %s", async (status, transient) => {
    const err = await createSerpSearch(
      "https://worker.test",
      "S",
      answering({ error: "x" }, status),
    )("k").catch((e) => e);
    expect(err.transient).toBe(transient);
  });
});

describe("index check", () => {
  it("normalizes URLs like a results page shows them", () => {
    expect(normalizeForSerp("https://WWW.Dir.test/p/acme/")).toBe("dir.test/p/acme");
    expect(normalizeForSerp("http://dir.test/p/acme?x=1")).toBe("dir.test/p/acme?x=1");
    expect(serpQuery(page)).toBe("site:dir.test/p/acme");
  });

  it("looks for the exact page, and no results is a real no", async () => {
    expect(parseOpenSerpIndexed(body(organic("https://dir.test/p/acme")), page)).toBe(true);
    expect(parseOpenSerpIndexed(body(organic("https://dir.test/p/other")), page)).toBe(false);
    expect(parseOpenSerpIndexed(body(), page)).toBe(false);
    const fetchImpl = answering(body());
    expect(await createSerpProvider("https://worker.test", "S", fetchImpl).isIndexed(page)).toBe(false);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string).text).toBe("site:dir.test/p/acme");
  });
});

describe("searchOrError", () => {
  const rows = [{ position: 1 }];
  const engineError = () => {
    try {
      return parseOpenSerp({ meta: { engines_failed: ["google"] } });
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
    expect("error" in r && r.error.message).toContain("engine failed");
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("treats a timeout as something that can pass", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const search = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue(rows);
    expect(await searchOrError(search, "k", 0)).toEqual({ rows });
  });

  it("throws straight away when trying again can't help", async () => {
    const search = vi.fn().mockRejectedValue(new SerpError("OpenSERP returned HTTP 401"));
    await expect(searchOrError(search, "k", 0)).rejects.toThrow("401");
    expect(search).toHaveBeenCalledTimes(1);
  });
});
