import { publicBlock } from "@/lib/badge-block/service";

/** A short CDN cache, so a badge staff just entered shows up by the time they click Verify. */
const CACHE = "public, max-age=0, s-maxage=10";

const TYPES = { js: "text/javascript; charset=utf-8", html: "text/html; charset=utf-8" };

/** A maker's live badge block: /badges/<key>.js for their page to load, /badges/<key>.html for their server to fetch. */
export async function GET(_request: Request, ctx: RouteContext<"/badges/[file]">) {
  const { file } = await ctx.params;
  const [, key, ext] = /^([a-f0-9]{32})\.(js|html)$/.exec(file) ?? [];
  const block = key ? await publicBlock(key) : null;
  if (!block) return new Response("Not found", { status: 404, headers: { "Cache-Control": CACHE } });
  return new Response(ext === "js" ? block.script : block.html, {
    headers: {
      "Content-Type": TYPES[ext as keyof typeof TYPES],
      "Cache-Control": CACHE,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
