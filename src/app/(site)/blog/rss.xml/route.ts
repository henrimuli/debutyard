import { connection } from "next/server";
import { site } from "@/config/site";
import { env } from "@/env";
import { listPublishedSlugs } from "@/lib/blog/public";
import { BLOG_DESCRIPTION, BLOG_TITLE } from "@/lib/blog/seo-meta";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export async function GET() {
  await connection();
  const base = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const posts = (await listPublishedSlugs()).filter((p) => !p.noindex).slice(0, 30);
  const items = posts
    .map(
      (p) =>
        `<item><title>${esc(p.title)}</title><link>${base}/blog/${p.slug}</link><guid>${base}/blog/${p.slug}</guid>${
          p.publishedAt ? `<pubDate>${p.publishedAt.toUTCString()}</pubDate>` : ""
        }<description>${esc(p.excerpt)}</description></item>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(BLOG_TITLE)}</title><link>${base}/blog</link><description>${esc(BLOG_DESCRIPTION)}</description><language>en</language><copyright>${esc(site.name)}</copyright>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
