import { describe, expect, it } from "vitest";
import { duplicateMessage, findDuplicate, siteKey, siteRoot } from "./duplicates";

describe("siteKey", () => {
  it("treats www, subdomains, paths and case as the same site", () => {
    const key = "acme.com";
    for (const url of [
      "https://acme.com",
      "https://www.acme.com/",
      "http://WWW.ACME.COM/pricing?ref=x",
      "https://app.acme.com/",
      "https://acme.com./",
    ]) {
      expect(siteKey(url)).toBe(key);
    }
    expect(siteKey("https://app.acme.co.uk/")).toBe("acme.co.uk");
  });

  it("keeps products on a shared host apart by their page", () => {
    expect(siteKey("https://github.com/a/one")).not.toBe(siteKey("https://github.com/b/two"));
    expect(siteKey("https://apps.apple.com/app/one/id1")).not.toBe(siteKey("https://apps.apple.com/app/two/id2"));
    expect(siteKey("https://www.npmjs.com/package/one")).not.toBe(siteKey("https://www.npmjs.com/package/two"));
  });

  it("keeps tenants of a shared host apart", () => {
    expect(siteKey("https://one.vercel.app/")).not.toBe(siteKey("https://two.vercel.app/"));
    expect(siteKey("https://one.notion.site/")).not.toBe(siteKey("https://two.notion.site/"));
    expect(siteKey("https://one.medium.com/")).not.toBe(siteKey("https://two.medium.com/"));
  });

  it("uses the query parameter that names a store's product, and no others", () => {
    const play = (id: string, extra = "") => `https://play.google.com/store/apps/details?id=${id}${extra}`;
    expect(siteKey(play("com.one"))).not.toBe(siteKey(play("com.two")));
    expect(siteKey(play("com.one", "&hl=en"))).toBe(siteKey(play("com.one")));
    const vscode = (name: string) => `https://marketplace.visualstudio.com/items?itemName=${name}`;
    expect(siteKey(vscode("a.one"))).not.toBe(siteKey(vscode("a.two")));
  });

  it("matches the same page on a shared host however it's written", () => {
    expect(siteKey("https://GitHub.com/Acme/Tool/")).toBe(siteKey("https://www.github.com/acme/tool"));
    expect(siteKey("https://one.vercel.app/?utm_source=x")).toBe(siteKey("https://one.vercel.app"));
  });

  it("doesn't mistake a domain ending in a platform's name for the platform", () => {
    expect(siteKey("https://netflix.com/watch")).toBe("netflix.com");
  });

  it("copes with hosts that have no registrable domain", () => {
    expect(siteKey("http://203.0.113.9/")).toBe("203.0.113.9");
    expect(siteRoot("http://203.0.113.9/")).toBe("203.0.113.9");
  });
});

describe("siteRoot", () => {
  it("is the domain every listing for the site sits under", () => {
    expect(siteRoot("https://app.acme.co.uk/x")).toBe("acme.co.uk");
    expect(siteRoot("https://github.com/a/one")).toBe("github.com");
  });
});

describe("findDuplicate", () => {
  const me = "maker";
  const them = "someone-else";
  const listing = (websiteUrl: string, createdBy: string, status: string) => ({ websiteUrl, createdBy, status });
  const adding = (websiteUrl: string) => ({ websiteUrl, ownerId: me, isNew: true });
  const editing = (websiteUrl: string) => ({ websiteUrl, ownerId: me, isNew: false });

  it.each(["pending", "approved"])("is stopped by someone else's %s listing", (status) => {
    const other = listing("https://acme.com/", them, status);
    expect(findDuplicate(adding("https://www.acme.com"), [other])).toBe(other);
    expect(findDuplicate(editing("https://app.acme.com"), [other])).toBe(other);
  });

  it.each(["draft", "rejected", "archived"])("isn't stopped by someone else's %s listing", (status) => {
    expect(findDuplicate(adding("https://acme.com"), [listing("https://acme.com/", them, status)])).toBeUndefined();
  });

  it.each(["draft", "pending", "approved", "rejected"])("won't start a second listing beside your own %s", (status) => {
    const own = listing("https://acme.com/", me, status);
    expect(findDuplicate(adding("https://www.acme.com"), [own])).toBe(own);
  });

  it("lets you start again after archiving", () => {
    expect(findDuplicate(adding("https://acme.com"), [listing("https://acme.com/", me, "archived")])).toBeUndefined();
  });

  it("lets a draft you already had carry on beside your other draft, until one is in review", () => {
    const own = listing("https://acme.com/", me, "draft");
    expect(findDuplicate(editing("https://acme.com"), [own])).toBeUndefined();
    const inReview = listing("https://acme.com/", me, "pending");
    expect(findDuplicate(editing("https://acme.com"), [inReview])).toBe(inReview);
  });

  it("lets one maker list separate products on separate subdomains", () => {
    const own = listing("https://one.acme.com/", me, "approved");
    expect(findDuplicate(adding("https://two.acme.com"), [own])).toBeUndefined();
    expect(findDuplicate(adding("https://one.acme.com"), [own])).toBe(own);
  });

  it("stops another maker on a sibling subdomain", () => {
    const other = listing("https://one.acme.com/", them, "approved");
    expect(findDuplicate(adding("https://two.acme.com"), [other])).toBe(other);
  });

  it("doesn't let products on a shared host block each other", () => {
    const other = listing("https://github.com/a/one", them, "approved");
    expect(findDuplicate(adding("https://github.com/b/two"), [other])).toBeUndefined();
    expect(findDuplicate(adding("https://github.com/a/one/"), [other])).toBe(other);
  });
});

describe("duplicateMessage", () => {
  it("sends makers to their own listing, and others to us", () => {
    const listing = { websiteUrl: "https://acme.com/", createdBy: "maker", status: "approved" };
    expect(duplicateMessage("https://www.acme.com", listing, "maker")).toMatch(
      /You already have a listing for acme\.com/,
    );
    expect(duplicateMessage("https://www.acme.com", listing, "other")).toMatch(
      /acme\.com is already listed on DebutYard/,
    );
  });
});
