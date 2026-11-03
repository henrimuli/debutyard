import { describe, expect, it } from "vitest";
import { closingIsValid, fillDraft, renderOutreachEmail, type DraftContext } from "./draft";

const ctx: DraftContext = {
  business: "Acme",
  keyword: "cross-post to tiktok",
  competitors: [
    { name: "Buffer", authority: 91 },
    { name: "Later", authority: 88 },
  ],
  businessAuthority: 6,
  forbiddenNames: ["buffer", "hootsuite"],
};

const good = {
  subject: "who's ranking for {keyword}",
  paragraphs: [
    "I looked at who shows up when people search for {keyword}. {competitor1} and {competitor2} sit at the top, with Authority Scores of {competitor1_score} and {competitor2_score}, and {business} is at {business_score}.",
    "Your product looks like a real fit for that search, but Google tends to favour sites with more trusted links, so it's hard to break through at that level. Building that authority is what we do, by submitting your product by hand to directories that fit it and verifying every link.",
  ],
};

describe("fillDraft", () => {
  it("fills every fact from the research", () => {
    const r = fillDraft(good, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject).toBe("who's ranking for cross-post to tiktok");
    expect(r.paragraphs[0]).toContain("Buffer and Later");
    expect(r.paragraphs[0]).toContain("91 and 88");
    expect(r.paragraphs[0]).toContain("Acme is at 6");
  });

  const broken = (patch: Partial<typeof good>) => fillDraft({ ...good, ...patch }, ctx);
  const withLine = (line: string) => broken({ paragraphs: [good.paragraphs[0]!, `${good.paragraphs[1]} ${line}`] });

  it.each([
    ["a price", "It starts at $99."],
    ["pricing words", "Our pricing is simple."],
    ["a free offer", "The first one is free."],
    ["a package", "Our growth package fits."],
    ["a number written by hand", "We cover about 90 sites."],
    ["a promise", "We guarantee results."],
    ["a ranking promise", "This will rank you."],
    ["a link", "See debutyard.com for more."],
    ["a name written by hand", "Unlike the others, hootsuite does not."],
    ["a capitalised name in a sentence", "It works like Zapier does."],
    ["an unknown placeholder", "Ask {founder} about it."],
    ["an em dash", "We help — by hand."],
  ])("rejects %s", (_, line) => {
    expect(withLine(line).ok).toBe(false);
  });

  it("rejects a draft that leaves out the facts", () => {
    const r = broken({
      paragraphs: [
        "We help businesses grow their authority with careful work done by hand. ".repeat(4),
        "It really works well for everyone who tries it and we would love to help you.",
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("{keyword}");
  });

  it("rejects bad subjects and shapes", () => {
    expect(broken({ subject: "" }).ok).toBe(false);
    expect(broken({ subject: "Quick question!" }).ok).toBe(false);
    expect(broken({ subject: `${"long ".repeat(20)}{keyword}` }).ok).toBe(false);
    expect(broken({ paragraphs: [good.paragraphs[0]!] }).ok).toBe(false);
  });

  it("uses no second competitor when there isn't one", () => {
    const r = fillDraft(good, { ...ctx, competitors: [ctx.competitors[0]!] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("{competitor2}");
  });
});

describe("renderOutreachEmail", () => {
  const email = renderOutreachEmail({
    business: "Acme & Co",
    subject: "A subject",
    paragraphs: ["First paragraph.", "Second paragraph."],
    closing: "{link:Here's how it works} if you'd like a look.",
    linkUrl: "https://debutyard.com/s/tok",
    unsubscribeUrl: "https://debutyard.com/u/tok",
    postalAddress: "A501 ShawHill Plaza, Moi Drive, Nairobi",
  });

  it("opens and signs off the same way every time", () => {
    expect(
      email.text.startsWith(
        "Hey team,\n\nCongrats on the launch, I came across Acme & Co and wanted to reach out directly.",
      ),
    ).toBe(true);
    expect(email.text).toContain("Henry\nFounder, DebutYard");
  });

  it("carries the link, the address and the unsubscribe in both parts", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("https://debutyard.com/s/tok");
      expect(part).toContain("https://debutyard.com/u/tok");
      expect(part).toContain("A501 ShawHill Plaza, Moi Drive, Nairobi");
    }
    expect(email.text).not.toContain("{link:");
    expect(email.html).not.toContain("{link:");
  });

  it("is plain: no images, tables or buttons, and escapes names", () => {
    expect(email.html).not.toMatch(/<img|<table|<button/i);
    expect(email.html).toContain("Acme &amp; Co");
  });

  it("never carries a price", () => {
    expect(email.text).not.toMatch(/\$\d/);
  });
});

describe("closingIsValid", () => {
  it("needs a link and no prices", () => {
    expect(closingIsValid("{link:Take a look} when you can.")).toBe(true);
    expect(closingIsValid("Take a look when you can.")).toBe(false);
    expect(closingIsValid("{link:See our pricing} here.")).toBe(false);
  });
});
