import { describe, expect, it, vi } from "vitest";
import {
  chartPoints,
  createAhrefsProvider,
  drChange,
  DR_ATTRIBUTION,
  DrProviderError,
  DrRateLimitError,
  parseAhrefs,
} from "./providers";

describe("Ahrefs Domain Rating", () => {
  it("reads the score and clamps it to 0-100", () => {
    expect(parseAhrefs({ domain_rating: { domain_rating: 42.5, license: "https://ahrefs.com/" } })).toEqual({
      dr: 42.5,
    });
    expect(parseAhrefs({ domain_rating: { domain_rating: 0 } })).toEqual({ dr: 0 });
    expect(parseAhrefs({ domain_rating: { domain_rating: 140 } })).toEqual({ dr: 100 });
    expect(() => parseAhrefs({})).toThrow(DrProviderError);
  });

  it("asks the free endpoint with the key and a pinned version", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ domain_rating: { domain_rating: 20 } }));
    const p = createAhrefsProvider("KEY", fetchImpl as unknown as typeof fetch);
    expect(await p.fetchDr("acme.io")).toEqual({ dr: 20 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe("https://api.ahrefs.com/v3/public/domain-rating-free");
    expect(u.searchParams.get("target")).toBe("acme.io");
    expect(u.searchParams.get("version")).toBe("dr3");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer KEY");
  });

  it("tells being throttled apart from other failures", async () => {
    const status = (n: number) =>
      createAhrefsProvider("KEY", (async () => new Response("{}", { status: n })) as unknown as typeof fetch).fetchDr(
        "a.io",
      );
    await expect(status(429)).rejects.toThrow(DrRateLimitError);
    const other = await status(403).catch((err) => err);
    expect(other).toBeInstanceOf(DrProviderError);
    expect(other).not.toBeInstanceOf(DrRateLimitError);
  });

  it("carries the credit the licence asks for", () => {
    expect(DR_ATTRIBUTION).toMatchObject({ text: "Domain Rating by Ahrefs", url: "https://ahrefs.com/" });
  });
});

describe("charts", () => {
  const at = (d: string) => new Date(`2026-${d}T00:00:00Z`);
  const pts = [
    { at: at("10-01"), dr: 7 },
    { at: at("10-15"), dr: 12 },
    { at: at("10-29"), dr: 19 },
  ];

  it("summarises the change since the first reading", () => {
    expect(drChange(pts)).toEqual({ from: 7, to: 19, delta: 12 });
    expect(drChange([])).toBeNull();
  });

  it("maps readings into the box, oldest on the left, higher DR higher up", () => {
    const xy = chartPoints(pts, 200, 60);
    expect(xy[0][0]).toBe(4);
    expect(xy[2][0]).toBe(196);
    expect(xy[2][1]).toBeLessThan(xy[0][1]);
    expect(xy.every(([, y]) => y >= 4 && y <= 56)).toBe(true);
  });
});
