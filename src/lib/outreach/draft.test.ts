import { describe, expect, it } from "vitest";
import {
  closingIsValid,
  fillDraft,
  FIXED_COPY,
  fixedVariations,
  renderOutreachEmail,
  spamWordIn,
  type DraftContext,
} from "./draft";
import { allSpins } from "./variety";

const ctx: DraftContext = {
  business: "Acme",
  keyword: "cross-post to tiktok",
  competitors: [{ name: "Buffer" }, { name: "Later" }],
  forbiddenNames: ["buffer", "hootsuite"],
};

const good = {
  subject: "who's ranking for {keyword}",
  paragraphs: [
    "I looked at who shows up when people search for {keyword}. {competitor1} and {competitor2} sit at the top, and a big part of why is a much higher domain rating than {business} has.",
    "Your product looks like a real fit for that search. Directories give a product a dofollow link when it's listed, those links help grow a domain rating, and that earns more trust from Google. I submit products by hand to directories that fit and verify every link.",
  ],
};

describe("fillDraft", () => {
  it("fills every fact from the research", () => {
    const r = fillDraft(good, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject).toBe("who's ranking for cross-post to tiktok");
    expect(r.paragraphs[0]).toContain("Buffer and Later");
    expect(r.paragraphs[0]).toContain("than Acme has");
    expect(r.paragraphs.join(" ")).not.toMatch(/\d/);
  });

  it("puts quote marks around the search phrase in the body, not the subject", () => {
    const r = fillDraft(good, ctx);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.paragraphs[0]).toContain('search for "cross-post to tiktok".');
    expect(r.subject).not.toContain('"');
  });

  it.each([['"{keyword}"'], ["'{keyword}'"], ["\u201c{keyword}\u201d"]])(
    "doesn't double the marks when the model wrote %s",
    (quoted) => {
      const paragraphs = [good.paragraphs[0]!.replace("{keyword}", quoted), good.paragraphs[1]!];
      const r = fillDraft({ ...good, paragraphs }, ctx);
      if (!r.ok) throw new Error(r.problems.join());
      expect(r.paragraphs[0]).toContain('search for "cross-post to tiktok".');
    },
  );

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
    ["a rating promise", "These links will raise your domain rating."],
    ["a figure in words", "They are ten times stronger."],
    ["a score", "Your score is low."],
    ["an Authority Score", "Theirs is a stronger Authority Score."],
    ["a claim about all directories", "All directories give followed links."],
    ["a claim about every directory", "Every directory passes trust."],
    ["a score placeholder", "It sits at {business_score}."],
    ["a missing possessive", "That grows a site domain rating."],
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

  it.each([
    ["directories", "directories"],
    ["dofollow", "dofollow"],
    ["a domain rating", "domain rating"],
    ["Google", "Google"],
    ["by hand", "by hand"],
  ])("rejects a last paragraph without %s", (word, expected) => {
    const last = good.paragraphs[1]!.replace(new RegExp(word.replace("a ", ""), "gi"), "stuff");
    const r = broken({ paragraphs: [good.paragraphs[0]!, last] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain(`doesn't mention`);
    if (!r.ok) expect(r.problems.join().toLowerCase()).toContain(expected.toLowerCase());
  });

  it("lets it say so about the directories we use", () => {
    expect(withLine("The ones I use all give a followed link.").ok).toBe(true);
  });

  it("rejects a draft with no contrast before the punchline", () => {
    const r = broken({
      paragraphs: [good.paragraphs[0]!.replace("a much higher domain rating", "more history"), good.paragraphs[1]!],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("contrast");
  });
});

describe("renderOutreachEmail", () => {
  const render = (seed: string) =>
    renderOutreachEmail({
      business: "Acme & Co $1",
      subject: "A subject",
      paragraphs: ["First paragraph.", "Second paragraph."],
      closing: "{{Here's how it works|This is how it works}} if you'd like a look.",
      linkUrl: "https://debutyard.com/s/tok",
      postalAddress: "A501 ShawHill Plaza, Moi Drive, Nairobi",
      seed,
    });
  const email = render("tok");

  it("comes out the same every time for the same email", () => {
    expect(render("tok").text).toBe(email.text);
  });

  it("differs between emails", () => {
    const texts = new Set(Array.from({ length: 50 }, (_, i) => render(`tok-${i}`).text));
    expect(texts.size).toBeGreaterThan(40);
  });

  it("includes Henry's own opening among the options", () => {
    const all = Array.from({ length: 2000 }, (_, i) => render(`t${i}`).text);
    expect(
      all.some((t) =>
        t.startsWith(
          "Hey team,\n\nCongrats on the launch, I came across Acme & Co $1 and wanted to reach out directly.",
        ),
      ),
    ).toBe(true);
  });

  it("always carries the business, link, signature and address, with nothing left to fill", () => {
    for (let i = 0; i < 200; i++) {
      const { text } = render(`tok-${i}`);
      expect(text).toContain("Acme & Co $1");
      expect(text).toMatch(/if you'd like a look\.\nhttps:\/\/debutyard\.com\/s\/tok/);
      expect(text).toContain("Henry\nFounder, DebutYard");
      expect(text).toContain("A501 ShawHill Plaza, Moi Drive, Nairobi");
      expect(text).not.toMatch(/[{}]/);
    }
  });

  it("has an opt-out but no unsubscribe link, and is plain text", () => {
    expect(email.text).not.toMatch(/unsubscribe|\/u\//i);
    expect(email.text).not.toMatch(/<[a-z]/i);
    expect(email).not.toHaveProperty("html");
  });

  it("refuses a closing it can't fill, or broken spintax", () => {
    const base = {
      business: "A",
      subject: "s",
      paragraphs: ["x"],
      linkUrl: "u",
      postalAddress: "p",
      seed: "s",
    };
    expect(() => renderOutreachEmail({ ...base, closing: "{link:Take a look}" })).toThrow();
    expect(() => renderOutreachEmail({ ...base, closing: "{{broken" })).toThrow();
  });
});

describe("fixed wording", () => {
  it("has thousands of combinations before the closing", () => {
    expect(fixedVariations()).toBeGreaterThan(1000);
  });

  it("never says anything a filter dislikes, in any wording", () => {
    for (const template of Object.values(FIXED_COPY)) {
      for (const wording of allSpins(template)) {
        expect(spamWordIn(wording)).toBeNull();
        expect(wording).not.toMatch(/[$€£]|pricing|https?:/i);
      }
    }
  });
});

describe("spam words", () => {
  it("rejects a draft using one", () => {
    const r = fillDraft(
      { ...good, paragraphs: [good.paragraphs[0]!, `${good.paragraphs[1]} It's a great opportunity.`] },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("opportunity");
  });

  it("doesn't catch innocent words inside longer ones", () => {
    expect(spamWordIn("We learn from early adopters and cashew farmers.")).toBeNull();
  });
});

describe("closingIsValid", () => {
  it("accepts a sentence, spun or not", () => {
    expect(closingIsValid("Take a look when you can.")).toBe(true);
    expect(closingIsValid("{{Take a look|Have a read}} when you can.")).toBe(true);
  });

  it("checks every wording", () => {
    expect(closingIsValid("{{Take a look|See our pricing}} when you can.")).toBe(false);
    expect(closingIsValid("{{Take a look|Click here}} when you can.")).toBe(false);
  });

  it("refuses broken spintax, placeholders and links", () => {
    expect(closingIsValid("{{Take a look")).toBe(false);
    expect(closingIsValid("{link:Take a look} when you can.")).toBe(false);
    expect(closingIsValid("See debutyard.com when you can.")).toBe(false);
    expect(closingIsValid("")).toBe(false);
  });
});
