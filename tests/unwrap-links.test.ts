import { describe, expect, it, vi } from "vitest";
import { unwrapLinks } from "../workers/screenshot/unwrap-links.mjs";

const GOTO = "https://www.google.com/goto?url=CAESfw";
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const fetchReturning = (res: Response) => vi.fn(async () => res) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const urls = (body: unknown) => (body as { results: { url: string }[] }).results.map((r) => r.url);

describe("unwrapLinks", () => {
  it("swaps a wrapped link for the page it redirects to, without following it", async () => {
    const fetchImpl = fetchReturning(redirect("https://a.test/post/"));
    const out = await unwrapLinks({ meta: { version: "2.1" }, results: [{ rank: 1, url: GOTO }] }, fetchImpl);
    expect(out).toEqual({ meta: { version: "2.1" }, results: [{ rank: 1, url: "https://a.test/post/" }] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("leaves other links alone and doesn't ask about them", async () => {
    const fetchImpl = fetchReturning(redirect("https://wrong.test/"));
    const links = [
      "https://a.test/goto?url=x",
      "https://support.google.com/goto-help",
      "https://google.evil.com/goto?url=x",
      "http://www.google.com/goto?url=x",
    ];
    const out = await unwrapLinks({ results: links.map((url) => ({ url })) }, fetchImpl);
    expect(urls(out)).toEqual(links);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["no redirect", new Response("<html>", { status: 200 })],
    ["an error", new Response(null, { status: 429 })],
    ["a block page", redirect("https://www.google.com/sorry/index?continue=x")],
    ["a block page on another host", redirect("https://ipv4.google.com/sorry/index")],
    ["a consent page", redirect("https://consent.google.com/m?continue=x")],
    ["another wrapped link", redirect("https://www.google.com/url?q=x")],
    ["something that isn't a web page", redirect("mailto:a@b.test")],
  ])("keeps the link wrapped on %s", async (_name, res) => {
    expect(urls(await unwrapLinks({ results: [{ url: GOTO }] }, fetchReturning(res)))).toEqual([GOTO]);
  });

  it("keeps the link wrapped when the request fails, and still resolves the rest", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(redirect("https://b.test/")) as unknown as typeof fetch;
    const out = await unwrapLinks({ results: [{ url: GOTO }, { url: `${GOTO}2` }] }, fetchImpl);
    expect(urls(out)).toEqual([GOTO, "https://b.test/"]);
  });

  it("keeps a Google page that really is the result", async () => {
    const out = await unwrapLinks(
      { results: [{ url: GOTO }] },
      fetchReturning(redirect("https://www.google.com/sheets/about/")),
    );
    expect(urls(out)).toEqual(["https://www.google.com/sheets/about/"]);
  });

  it("passes an error body through", async () => {
    const body = { error: "engine_internal", message: "all attempts failed" };
    expect(await unwrapLinks(body, fetchReturning(redirect("https://a.test/")))).toEqual(body);
  });
});
