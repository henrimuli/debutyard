import { type NextRequest, NextResponse } from "next/server";
import { KIT_PATH } from "@/lib/kit";
import { confirmSubscription } from "@/lib/newsletter/service";

/**
 * The button in the Founder Kit email: one click confirms and opens the kit, with no second
 * confirm page in between. A link scanner that opens it first confirms too, and the real click
 * still lands as a success because an already-active token counts as confirmed.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const ok = Boolean(token && token.length <= 64 && (await confirmSubscription(token)));
  const to = new URL(KIT_PATH, req.nextUrl);
  // An expired link still opens the kit (it's not gated), just without the "you're in" message.
  if (ok) to.searchParams.set("welcome", "1");
  return NextResponse.redirect(to, { headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
