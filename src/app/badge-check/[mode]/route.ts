import { badgeCheckEnabled, checkBlockHtml, noStore } from "@/lib/badge-block/check";

/** A plain page, like a maker's site: the block in the raw HTML (`server`), or added by a script (`script`). */
export async function GET(_request: Request, ctx: RouteContext<"/badge-check/[mode]">) {
  const { mode } = await ctx.params;
  if (!badgeCheckEnabled() || (mode !== "server" && mode !== "script")) {
    return new Response("Not found", { status: 404 });
  }

  const block = mode === "server" ? await checkBlockHtml() : `<script src="/badges/test.js"></script>`;
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Badge check (${mode})</title>
</head>
<body style="font-family:system-ui,sans-serif;margin:0 auto;max-width:720px;padding:32px 16px">
<main>
<h1>Badge check: ${mode}</h1>
<p>A DebutYard test page for directory badge verification.</p>
</main>
${block}
<footer style="border-top:1px solid #ddd;padding-top:16px">Footer</footer>
</body>
</html>
`;
  return new Response(page, {
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", ...noStore },
  });
}
