import { describe, expect, it } from "vitest";
import { extractPrefill } from "@/lib/products/prefill";
import { duplicateCheck, pageChecks, scoreChecks, suggestedListing } from "./checks";

const good = `<html><head><title>Acme: invoices that chase themselves</title>
<meta name="description" content="Acme sends polite, automatic reminders so your clients pay on time, every time.">
<meta property="og:image" content="/og.png"><link rel="icon" href="/favicon.svg"></head>
<body><a href="https://debutyard.com/p/acme">Featured on DebutYard</a></body></html>`;

const facts = (html: string, finalUrl = "https://acme.io/", status = 200) => ({
  finalUrl,
  status,
  html,
  prefill: extractPrefill(html, finalUrl),
  badge: html.includes("debutyard.com")
    ? ({ ok: true } as const)
    : ({ ok: false, reason: "not_found", detail: "" } as const),
});

describe("pageChecks", () => {
  it("scores a well-prepared page 100", () => {
    const checks = pageChecks(facts(good), null);
    expect(checks.filter((c) => c.status !== "pass")).toEqual([]);
    expect(scoreChecks(checks)).toBe(100);
  });

  it("warns when only Firecrawl could get past the site's bot protection", () => {
    const checks = pageChecks({ ...facts(good), blocksBots: true }, null);
    expect(checks.filter((c) => c.status !== "pass")).toMatchObject([{ id: "bots", status: "warn" }]);
    expect(checks.find((c) => c.id === "bots")?.detail).toContain("blocks simple bots");
    expect(scoreChecks(checks)).toBeLessThan(100);
  });

  it("flags http, missing meta, noindex and a missing badge", () => {
    const checks = pageChecks(
      facts(`<html><head><meta name="robots" content="noindex"></head></html>`, "http://acme.io/"),
      null,
    );
    const by = Object.fromEntries(checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({
      https: "fail",
      title: "fail",
      description: "fail",
      og_image: "warn",
      indexable: "fail",
      badge: "warn",
      unique: "pass",
    });
    expect(scoreChecks(checks)).toBeLessThan(50);
  });

  it("fails duplicates and suggests a relaunch for past debuts", () => {
    expect(duplicateCheck({ slug: "acme", status: "pending", debutEnded: false }).status).toBe("fail");
    const past = duplicateCheck({ slug: "acme", status: "approved", debutEnded: true });
    expect(past.status).toBe("warn");
    expect(past.detail).toContain("Relaunch");
  });

  it("suggests a listing within the form's limits", () => {
    const s = suggestedListing({
      url: "x",
      name: "A".repeat(70),
      tagline: "Short",
      description: undefined,
      categories: ["ai"],
    });
    expect(s.name).toHaveLength(60);
    expect(s).toMatchObject({ tagline: "Short", description: null, categories: ["ai"] });
  });
});
