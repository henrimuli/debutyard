import { describe, expect, it } from "vitest";
import { atlasCsv, atlasTier, atlasTiers, type AtlasDirectory } from "./kit-atlas";

const dir = (over: Partial<AtlasDirectory>): AtlasDirectory => ({
  slug: "x",
  name: "X",
  url: "https://x.test",
  submitUrl: null,
  description: "",
  niche: "general",
  pricing: "free",
  dr: null,
  linkType: "unknown",
  badgeRequired: false,
  needsAccount: true,
  guided: false,
  queueEstimateDays: null,
  submissionNotes: "",
  ...over,
});

describe("atlasTier", () => {
  it("puts maker-run communities first whatever their link", () => {
    expect(atlasTier(dir({ guided: true, pricing: "paid", linkType: "dofollow" }))).toBe("launch-day");
  });
  it("counts free and freemium dofollow without a badge as quick wins", () => {
    expect(atlasTier(dir({ linkType: "dofollow" }))).toBe("free-wins");
    expect(atlasTier(dir({ pricing: "freemium", linkType: "dofollow" }))).toBe("free-wins");
    expect(atlasTier(dir({ linkType: "dofollow", badgeRequired: true }))).toBe("long-tail");
    expect(atlasTier(dir({ linkType: "nofollow" }))).toBe("long-tail");
  });
  it("only recommends paying for high-authority directories", () => {
    expect(atlasTier(dir({ pricing: "paid", dr: 72 }))).toBe("worth-paying");
    expect(atlasTier(dir({ pricing: "paid", dr: 30 }))).toBe("long-tail");
    expect(atlasTier(dir({ pricing: "paid", dr: null }))).toBe("long-tail");
  });
});

describe("atlasTiers", () => {
  it("sorts each tier by authority with unknown scores last", () => {
    const tiers = atlasTiers([
      dir({ name: "B", linkType: "dofollow", dr: null }),
      dir({ name: "A", linkType: "dofollow", dr: 40 }),
      dir({ name: "C", linkType: "dofollow", dr: 80 }),
    ]);
    expect(tiers.find((t) => t.id === "free-wins")!.items.map((d) => d.name)).toEqual(["C", "A", "B"]);
  });
});

describe("atlasCsv", () => {
  it("quotes commas and neutralizes spreadsheet formulas", () => {
    const csv = atlasCsv([
      dir({ name: "=HYPERLINK(1)", submissionNotes: 'Fee, "one-off"', linkType: "dofollow", dr: 50 }),
    ]);
    const [head, row] = csv.trim().split("\r\n");
    expect(head!.startsWith("tier,name,submit_url")).toBe(true);
    expect(row).toContain("'=HYPERLINK(1)");
    expect(row).toContain('"Fee, ""one-off"""');
    expect(row).toContain("https://x.test");
  });
});
