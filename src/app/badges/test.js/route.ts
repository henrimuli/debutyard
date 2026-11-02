import { badgeCheckEnabled, checkBlockHtml, noStore } from "@/lib/badge-block/check";
import { blockScript } from "@/lib/badge-block/render";

export async function GET() {
  if (!badgeCheckEnabled()) return new Response("Not found", { status: 404 });
  return new Response(blockScript(await checkBlockHtml()), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", ...noStore },
  });
}
