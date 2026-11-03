import { site } from "@/config/site";
import { esc } from "@/lib/email-template";
import { unsubscribeByToken } from "@/lib/outreach/queries";

const page = (body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;line-height:1.5;color:#222">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } },
  );

/**
 * Asks first: mail scanners follow links, and a scanner mustn't unsubscribe
 * anyone. The button posts back here.
 */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return page(
    `<p>Stop emails from ${esc(site.name)} to this address?</p><form method="post" action="/u/${encodeURIComponent(token)}"><button type="submit" style="font-size:15px;padding:8px 16px">Unsubscribe</button></form>`,
  );
}

/** The button above, and RFC 8058 one-click unsubscribe from mail clients. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length <= 64) await unsubscribeByToken(token);
  return page(`<p>You're unsubscribed. ${esc(site.name)} won't email this address again.</p>`);
}
