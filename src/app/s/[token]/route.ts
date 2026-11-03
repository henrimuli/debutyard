import { site } from "@/config/site";
import { recordClick } from "@/lib/outreach/queries";

const destination = () => new URL("/submission-service", site.url);

/** The link in a cold email: counts the click, then goes to the service page. A failed count never blocks the visit. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length <= 64) {
    await recordClick(token, request.headers.get("user-agent")).catch((err) =>
      console.error("outreach click failed", err),
    );
  }
  return Response.redirect(destination(), 302);
}

/** Link checkers ask with HEAD: answer, but it isn't a click. */
export function HEAD() {
  return Response.redirect(destination(), 302);
}
