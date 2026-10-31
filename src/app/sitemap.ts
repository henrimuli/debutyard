import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { queryRows } from "@/db";
import { env } from "@/env";
import { drEnabled } from "@/lib/metrics/service";
import { weekKeyFor } from "@/lib/weeks";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const staticPages = [
    "",
    "/weeks",
    "/blog",
    "/advertise",
    "/tools/launch-readiness",
    "/tools/dofollow-checker",
    ...(drEnabled() ? ["/tools/dr-checker"] : []),
    "/docs",
    "/directories",
    "/launch-wall",
    "/submission-service",
    "/categories",
    "/how-ranking-works",
    "/terms",
    "/privacy",
    "/refund-policy",
  ];
  const entries: MetadataRoute.Sitemap = staticPages.map((p) => ({ url: `${base}${p}` }));

  try {
    const current = weekKeyFor(new Date());
    const products = (await queryRows(sql`
      select slug, updated_at from products
      where status = 'approved' and launch_week_key <= ${current}
      order by approved_at desc limit 45000
    `)) as unknown as Array<{ slug: string; updated_at: Date | string }>;
    const weeks = (await queryRows(sql`
      select distinct launch_week_key as key from products
      where status = 'approved' and launch_week_key <= ${current}
    `)) as unknown as Array<{ key: string }>;
    const categories = (await queryRows(sql`select slug from categories`)) as unknown as Array<{ slug: string }>;
    const dirs = (await queryRows(sql`select slug from directories where is_active`)) as unknown as Array<{
      slug: string;
    }>;
    // Noindexed posts stay out; "updated" is when the text last changed, not any row write.
    const posts = (await queryRows(sql`
      select slug, coalesce(content_updated_at, published_at) as updated_at from posts
      where status = 'published' and published_at <= now() and not noindex
    `)) as unknown as Array<{ slug: string; updated_at: Date | string }>;
    const blogCategories = (await queryRows(sql`
      select distinct c.slug from blog_categories c
      join posts p on p.category_id = c.id and p.status = 'published' and p.published_at <= now()
    `)) as unknown as Array<{ slug: string }>;

    entries.push(
      ...products.map((p) => ({ url: `${base}/p/${p.slug}`, lastModified: new Date(p.updated_at) })),
      ...weeks.map((w) => ({ url: `${base}/week/${w.key}` })),
      ...categories.map((c) => ({ url: `${base}/category/${c.slug}` })),
      ...dirs.map((d) => ({ url: `${base}/directories/${d.slug}` })),
      ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.updated_at) })),
      ...blogCategories.map((c) => ({ url: `${base}/blog/category/${c.slug}` })),
    );
  } catch (err) {
    console.error("sitemap: database unavailable", err);
  }
  return entries;
}
