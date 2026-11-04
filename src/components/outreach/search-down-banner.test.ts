import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SearchDownStreak } from "@/lib/outreach/search-health";
import { SearchDownBanner } from "./search-down-banner";

const streak = (over: Partial<SearchDownStreak>): SearchDownStreak => ({
  runs: 1,
  lastAt: new Date(Date.UTC(2026, 10, 5, 9)),
  since: new Date(Date.UTC(2026, 10, 5, 3)),
  error: "OpenSERP returned HTTP 429",
  needsProxy: false,
  ...over,
});
const html = (s: SearchDownStreak) => renderToStaticMarkup(createElement(SearchDownBanner, { streak: s }));

describe("SearchDownBanner", () => {
  it("mentions a short streak quietly, with the error", () => {
    const out = html(streak({ runs: 2 }));
    expect(out).toContain('role="status"');
    expect(out).toContain("The last 2 research runs");
    expect(out).toContain("OpenSERP returned HTTP 429");
    expect(out).not.toContain("proxy");
  });

  it("says when it's time for a proxy, loudly", () => {
    const out = html(streak({ runs: 4, needsProxy: true }));
    expect(out).toContain('role="alert"');
    expect(out).toContain("needs a proxy");
    expect(out).toContain("4 runs in a row");
    expect(out).toContain("proxies.global");
  });

  it("points at our own services when a proxy wouldn't help", () => {
    const out = html(streak({ runs: 3, needsProxy: false, error: "OpenSERP returned HTTP 502: Permission denied" }));
    expect(out).toContain('role="alert"');
    expect(out).toContain("keeps failing");
    expect(out).toContain("Permission denied");
    expect(out).not.toContain("proxies.global");
  });
});
