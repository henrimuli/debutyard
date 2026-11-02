import { badgeCheckEnabled, checkBlockHtml, noStore } from "@/lib/badge-block/check";

export async function GET() {
  if (!badgeCheckEnabled()) return new Response("Not found", { status: 404 });
  return new Response(await checkBlockHtml(), {
    headers: { "Content-Type": "text/html; charset=utf-8", ...noStore },
  });
}
