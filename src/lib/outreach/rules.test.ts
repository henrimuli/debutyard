import { describe, expect, it } from "vitest";
import {
  bestEmail,
  cleanWebsite,
  contactPages,
  directorySignals,
  extractEmails,
  findLaunchDate,
  findVisitLink,
  healthProblem,
  isPlatformHost,
  isRecentLaunch,
  listingCandidates,
  looksLikeScanner,
  recentPageLink,
  registrableDomain,
  scoreEmail,
  sectionLooksRecent,
  sendsDue,
  dailyTarget,
  MAILBOX_DAILY_CAP,
  parseMailboxes,
  pickSender,
} from "./rules";

const NOW = new Date("2026-11-03T15:00:00Z");

describe("domains", () => {
  it("reduces a URL or host to its registrable domain", () => {
    expect(registrableDomain("https://www.app.acme.co.uk/x?y=1")).toBe("acme.co.uk");
    expect(registrableDomain("acme.com")).toBe("acme.com");
    expect(registrableDomain("not a url")).toBeNull();
  });

  it("treats a site on a shared host as its own, and flags the host", () => {
    expect(registrableDomain("https://acme.vercel.app")).toBe("acme.vercel.app");
    expect(isPlatformHost("acme.vercel.app")).toBe(true);
    expect(isPlatformHost("apps.apple.com")).toBe(true);
    expect(isPlatformHost("acme.com")).toBe(false);
  });

  it("strips the directory's tracking from a website", () => {
    expect(cleanWebsite("https://acme.com/?utm_source=foundrlist&utm_medium=referral")).toBe("https://acme.com");
    expect(cleanWebsite("mailto:x@y.com")).toBeNull();
  });
});

describe("finding listings on a directory", () => {
  const page = (body: string) => `<html><body>${body}</body></html>`;
  const products = ["a", "b", "c", "d"].map((s) => `<a href="/product/${s}">Product ${s}</a>`).join("");

  it("keeps repeating listing links and other sites, and drops navigation", () => {
    const found = listingCandidates(
      page(
        `${products}<a href="/blog/x">Blog</a><a href="/pricing">Pricing</a><a href="https://acme.com/?utm_source=dir">Acme</a><a href="https://x.com/dir">X</a>`,
      ),
      "https://dir.com/",
    );
    const urls = found.map((c) => c.url);
    expect(urls).toContain("https://dir.com/product/a");
    expect(urls).toContain("https://acme.com/?utm_source=dir");
    expect(urls.some((u) => u.includes("/blog") || u.includes("/pricing") || u.includes("x.com"))).toBe(false);
  });

  it("leaves out paid placements", () => {
    const found = listingCandidates(
      page(
        `<a href="https://ad.com/?utm_source=dir&utm_campaign=sponsored_ad">Ad</a><a rel="sponsored" href="https://paid.com/">Paid</a>`,
      ),
      "https://dir.com/",
    );
    expect(found).toEqual([]);
  });

  it("needs a pattern before trusting internal links", () => {
    expect(listingCandidates(page(`<a href="/product/a">A</a>`), "https://dir.com/")).toEqual([]);
  });

  it("finds a page of recent launches", () => {
    expect(recentPageLink(page(`<a href="/launches/week">This week</a>`), "https://dir.com/")).toBe(
      "https://dir.com/launches/week",
    );
    expect(recentPageLink(page(`<a href="/about">About</a>`), "https://dir.com/")).toBeNull();
  });

  it("finds the link to the product on a listing page", () => {
    expect(
      findVisitLink(
        page(`<a href="https://other.com">Partner</a><a href="https://acme.com">Visit website</a>`),
        "https://dir.com/p/acme",
      ),
    ).toBe("https://acme.com/");
    expect(findVisitLink(page(`<a href="https://acme.com?ref=dir">Acme</a>`), "https://dir.com/p/acme")).toBe(
      "https://acme.com/?ref=dir",
    );
    expect(findVisitLink(page(`<a href="/go/acme">Acme</a>`), "https://dir.com/p/acme")).toBe(
      "https://dir.com/go/acme",
    );
  });

  it("doesn't guess when no link is clearly the product", () => {
    expect(findVisitLink(page(`<a href="https://partner.com">Partner</a>`), "https://dir.com/p/acme")).toBeNull();
  });
});

describe("recent launches", () => {
  it("accepts sections that promise new launches and refuses rankings", () => {
    expect(sectionLooksRecent("Launching today")).toBe(true);
    expect(sectionLooksRecent("This week")).toBe(true);
    expect(sectionLooksRecent("Top this week")).toBe(false);
    expect(sectionLooksRecent("Trending")).toBe(false);
    expect(sectionLooksRecent("Featured new tools")).toBe(false);
  });

  it("reads a date from structured data, a time tag or the text", () => {
    expect(findLaunchDate(`<script>{"datePublished":"2026-11-01"}</script>`, NOW)?.toISOString()).toContain(
      "2026-11-01",
    );
    expect(findLaunchDate(`<time datetime="2026-10-30T10:00:00Z">Oct 30</time>`, NOW)?.toISOString()).toContain(
      "2026-10-30",
    );
    expect(findLaunchDate(`<p>Launched 3 days ago</p>`, NOW)?.toISOString()).toContain("2026-10-31");
    expect(findLaunchDate(`<p>Launched today</p>`, NOW)).toEqual(NOW);
    expect(findLaunchDate(`<p>Nothing here</p>`, NOW)).toBeNull();
  });

  it("ignores dates in the future and old launches", () => {
    expect(findLaunchDate(`<time datetime="2027-01-01">Soon</time>`, NOW)).toBeNull();
    expect(isRecentLaunch(new Date("2026-10-25T00:00:00Z"), NOW)).toBe(true);
    expect(isRecentLaunch(new Date("2026-09-01T00:00:00Z"), NOW)).toBe(false);
  });
});

describe("never a directory", () => {
  const product = { url: "https://acme.com", html: "<h1>Invoices that chase themselves</h1>", title: "Acme invoicing" };

  it("passes an ordinary product", () => {
    expect(directorySignals(product)).toEqual([]);
  });

  it.each([
    ["a directory's domain", { ...product, url: "https://bestdirectory.com" }],
    ["launch in the domain", { ...product, url: "https://launchllama.co" }],
    ["a .tools domain", { ...product, url: "https://twelve.tools" }],
    ["a tools list title", { ...product, title: "Discover the best AI tools" }],
    ["a launch platform description", { ...product, description: "The launch platform for makers" }],
    ["a directory heading", { ...product, html: "<h1>The startup directory</h1>" }],
    ["a submit link", { ...product, html: `<a href="/submit">Go</a>` }],
    ["a submit label", { ...product, html: `<a href="/new">Submit your tool</a>` }],
    ["selling backlinks", { ...product, title: "Dofollow backlinks for your SaaS" }],
  ])("rejects %s", (_, input) => {
    expect(directorySignals(input).length).toBeGreaterThan(0);
  });

  it("rejects a page linking out to many other sites", () => {
    const html = Array.from({ length: 25 }, (_, i) => `<a href="https://site${i}.com">S</a>`).join("");
    expect(directorySignals({ ...product, html }).join()).toContain("25 other sites");
  });

  it("doesn't count social links as outbound", () => {
    const html = `<a href="https://x.com/a">X</a><a href="https://github.com/a">G</a>`;
    expect(directorySignals({ ...product, html })).toEqual([]);
  });
});

describe("finding an address", () => {
  it("reads mailto links, text and obfuscations", () => {
    expect(extractEmails(`<a href="mailto:Hello@Acme.com?subject=Hi">Mail</a>`)).toEqual(["hello@acme.com"]);
    expect(extractEmails(`<p>Write to team@acme.com.</p>`)).toEqual(["team@acme.com"]);
    expect(extractEmails(`<p>hello [at] acme [dot] com</p>`)).toEqual(["hello@acme.com"]);
    // Cloudflare's obfuscation of a@b.co with key 0x10.
    const hex = "10" + [..."a@b.co"].map((c) => (c.charCodeAt(0) ^ 0x10).toString(16).padStart(2, "0")).join("");
    expect(extractEmails(`<a data-cfemail="${hex}">x</a>`)).toEqual(["a@b.co"]);
  });

  it("isn't fooled by asset names", () => {
    expect(extractEmails(`<p>logo@2x.png</p>`)).toEqual([]);
  });

  it("takes the site's own address over a free one, and the friendliest of those", () => {
    const html = `<a href="mailto:support@acme.com">s</a><a href="mailto:hello@acme.com">h</a><a href="mailto:acme@gmail.com">g</a>`;
    expect(bestEmail(html, "acme.com")).toBe("hello@acme.com");
    expect(bestEmail(`<a href="mailto:acme@gmail.com">g</a>`, "acme.com")).toBe("acme@gmail.com");
  });

  it.each([
    "noreply@acme.com",
    "abuse@acme.com",
    "privacy@acme.com",
    "legal@acme.com",
    "you@acme.com",
    "hello@example.com",
  ])("refuses %s", (email) => {
    expect(scoreEmail(email, "acme.com")).toBeNull();
  });

  it("refuses someone else's domain", () => {
    expect(scoreEmail("hello@hosting.com", "acme.com")).toBeNull();
  });

  it("looks on the contact, about, privacy and terms pages", () => {
    const html = `<footer><a href="/privacy-policy">Privacy</a><a href="/about-us">About</a></footer>`;
    expect(contactPages(html, "https://acme.com/")).toEqual([
      "https://acme.com/contact",
      "https://acme.com/about-us",
      "https://acme.com/privacy-policy",
      "https://acme.com/terms",
    ]);
  });
});

describe("pacing", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 3, h, 35));

  it("spreads the day's emails across the window", () => {
    let sent = 0;
    for (let h = 0; h < 24; h++) sent += sendsDue(at(h), 5, sent);
    expect(sent).toBe(5);
    expect(sendsDue(at(13), 5, 0)).toBe(1);
    expect(sendsDue(at(14), 5, 1)).toBe(1);
  });

  it("sends nothing outside the window, at the limit or at zero", () => {
    expect(sendsDue(at(3), 5, 0)).toBe(0);
    expect(sendsDue(at(21), 5, 5)).toBe(0);
    expect(sendsDue(at(15), 0, 0)).toBe(0);
  });

  it("reaches higher limits too", () => {
    let sent = 0;
    for (let h = 0; h < 24; h++) sent += sendsDue(at(h), 24, sent);
    expect(sent).toBe(24);
  });

  it("catches up after a missed run", () => {
    expect(sendsDue(at(21), 5, 2)).toBe(3);
  });
});

describe("mailboxes", () => {
  const hosts = { smtpHost: "smtp.test", imapHost: "imap.test" };
  const list = (...entries: unknown[]) => JSON.stringify(entries);

  it("reads a list, defaulting the login to the address and the hosts to the shared ones", () => {
    const { boxes, problems } = parseMailboxes(
      list(
        { from: "Henry <Henry@Hello.Test>", pass: "a" },
        { from: "h2@hello.test", pass: "b", user: "login2", smtpHost: "other.test" },
      ),
      hosts,
    );
    expect(problems).toEqual([]);
    expect(boxes[0]).toEqual({
      address: "henry@hello.test",
      from: "Henry <Henry@Hello.Test>",
      user: "henry@hello.test",
      pass: "a",
      smtpHost: "smtp.test",
      imapHost: "imap.test",
    });
    expect(boxes[1]).toMatchObject({ user: "login2", smtpHost: "other.test" });
  });

  it("treats no setting as no mailboxes, not a problem", () => {
    expect(parseMailboxes(undefined, hosts)).toEqual({ boxes: [], problems: [] });
    expect(parseMailboxes("  ", hosts)).toEqual({ boxes: [], problems: [] });
  });

  it("keeps the good entries when one is bad", () => {
    const { boxes, problems } = parseMailboxes(
      list(
        { from: "a@hello.test", pass: "x" },
        { from: "nope", pass: "x" },
        { from: "b@hello.test" },
        { from: "A@hello.test", pass: "y" },
        null,
      ),
      hosts,
    );
    expect(boxes.map((b) => b.address)).toEqual(["a@hello.test"]);
    expect(problems).toHaveLength(4);
  });

  it("never repeats a password in a problem", () => {
    const secret = "s3cret-value";
    const broken = parseMailboxes(`[{"from":"a@hello.test","pass":"${secret}"`, hosts);
    expect(broken.boxes).toEqual([]);
    expect(broken.problems.join()).not.toContain(secret);
    const noHost = parseMailboxes(list({ from: "a@hello.test", pass: secret }), {});
    expect(noHost.problems.join()).not.toContain(secret);
  });

  it("spreads sends to the least used mailbox", () => {
    const boxes = [{ address: "a" }, { address: "b" }, { address: "c" }];
    expect(pickSender(boxes, {})?.address).toBe("a");
    expect(pickSender(boxes, { a: 1 })?.address).toBe("b");
    expect(pickSender(boxes, { a: 2, b: 1, c: 2 })?.address).toBe("b");
  });

  it("never goes over a mailbox's daily cap, and skips a broken one", () => {
    const boxes = [{ address: "a" }, { address: "b" }];
    const full = MAILBOX_DAILY_CAP;
    expect(pickSender(boxes, { a: full })?.address).toBe("b");
    expect(pickSender(boxes, { a: full, b: full })).toBeNull();
    expect(pickSender(boxes, {}, new Set(["a"]))?.address).toBe("b");
    expect(pickSender(boxes, {}, new Set(["a", "b"]))).toBeNull();
  });

  it("sends each of ten mailboxes its full cap, and no more", () => {
    const boxes = Array.from({ length: 10 }, (_, i) => ({ address: `m${i}` }));
    const sent: Record<string, number> = {};
    let total = 0;
    for (let picked = pickSender(boxes, sent); picked; picked = pickSender(boxes, sent)) {
      sent[picked.address] = (sent[picked.address] ?? 0) + 1;
      total++;
    }
    expect(total).toBe(150);
    expect(Object.values(sent).every((n) => n === MAILBOX_DAILY_CAP)).toBe(true);
  });

  it("holds the daily target to what the mailboxes allow", () => {
    expect(dailyTarget(5, 1)).toBe(5);
    expect(dailyTarget(150, 1)).toBe(15);
    expect(dailyTarget(150, 10)).toBe(150);
    expect(dailyTarget(500, 10)).toBe(150);
    // Dry runs can write drafts before any mailbox exists.
    expect(dailyTarget(5, 0)).toBe(5);
  });
});

describe("clicks and health", () => {
  it("doesn't count scanners", () => {
    expect(looksLikeScanner(null, 500)).toBe(true);
    expect(looksLikeScanner("Mozilla/5.0 (compatible; Googlebot/2.1)", 500)).toBe(true);
    expect(looksLikeScanner("Mozilla/5.0 Chrome/124", 5)).toBe(true);
    expect(looksLikeScanner("Mozilla/5.0 Chrome/124", 500)).toBe(false);
  });

  it("stops on a complaint or too many bounces", () => {
    expect(healthProblem({ sent: 10, bounced: 0, complained: 0 })).toBeNull();
    expect(healthProblem({ sent: 10, bounced: 5, complained: 0 })).toBeNull();
    expect(healthProblem({ sent: 40, bounced: 2, complained: 0 })).toContain("bounces");
    expect(healthProblem({ sent: 10, bounced: 0, complained: 1 })).toContain("complaint");
  });
});
