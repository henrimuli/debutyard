import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, queryRows, schema } from "@/db";
import { safeFetchText } from "@/lib/net";
import { weekKeyFor } from "@/lib/weeks";
import { formatPostDate } from "../service";

/**
 * What the writer agent knows about products: listings on the board (read
 * from the database, so they're real) and the products' own websites (read
 * live, so prices and features are current). Everything here reaches the
 * model as DATA, never as instructions.
 */

export type ProductFacts = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  domain: string;
  pricingModel: string;
  categories: { slug: string; name: string }[];
  applause: number;
  awards: string[];
  launchWeek: string | null;
  screenshots: string[];
  makerName: string | null;
};

const liveSql = () => sql`p.status = 'approved' and p.launch_week_key <= ${weekKeyFor(new Date())}`;

/** Full facts for listings, in the order asked. Only live products. */
export async function productFacts(slugs: string[]): Promise<ProductFacts[]> {
  const wanted = [...new Set(slugs)].slice(0, 15);
  if (wanted.length === 0) return [];
  const rows = (await queryRows(sql`
    select p.id, p.slug, p.name, p.tagline, p.description, p.website_url, p.domain, p.pricing_model,
      p.launch_week_key, u.name as maker_name,
      (select count(*)::int from applause v where v.product_id = p.id) as applause
    from products p
    left join "user" u on u.id = p.created_by
    where p.slug in ${wanted} and ${liveSql()}
  `)) as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    tagline: string;
    description: string;
    website_url: string;
    domain: string;
    pricing_model: string;
    launch_week_key: string | null;
    maker_name: string | null;
    applause: number;
  }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [cats, media, awards] = await Promise.all([
    db()
      .select({
        productId: schema.productCategories.productId,
        slug: schema.categories.slug,
        name: schema.categories.name,
      })
      .from(schema.productCategories)
      .innerJoin(schema.categories, eq(schema.categories.slug, schema.productCategories.categorySlug))
      .where(inArray(schema.productCategories.productId, ids)),
    db()
      .select({
        productId: schema.productMedia.productId,
        url: schema.productMedia.url,
        position: schema.productMedia.position,
      })
      .from(schema.productMedia)
      .where(inArray(schema.productMedia.productId, ids)),
    db()
      .select({
        productId: schema.awards.productId,
        scope: schema.awards.scope,
        key: schema.awards.periodKey,
        place: schema.awards.place,
      })
      .from(schema.awards)
      .where(inArray(schema.awards.productId, ids)),
  ]);
  const bySlug = new Map(
    rows.map((r): [string, ProductFacts] => [
      r.slug,
      {
        id: r.id,
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        description: r.description.slice(0, 2500),
        websiteUrl: r.website_url,
        domain: r.domain,
        pricingModel: r.pricing_model,
        categories: cats.filter((c) => c.productId === r.id).map(({ slug, name }) => ({ slug, name })),
        applause: r.applause,
        awards: awards
          .filter((a) => a.productId === r.id)
          .map((a) => `#${a.place} of ${a.scope === "week" ? "the week" : `the ${a.scope}`} (${a.key})`),
        launchWeek: r.launch_week_key,
        screenshots: media
          .filter((m) => m.productId === r.id)
          .sort((a, b) => a.position - b.position)
          .map((m) => m.url)
          .slice(0, 3),
        makerName: r.maker_name,
      },
    ]),
  );
  return wanted.map((s) => bySlug.get(s)).filter((p): p is ProductFacts => Boolean(p));
}

export type CatalogHit = {
  slug: string;
  name: string;
  tagline: string;
  pricingModel: string;
  categories: string[];
  applause: number;
};

/** Live listings matching a category and/or words, most applauded first. */
export async function searchCatalog(opts: {
  category?: string;
  query?: string;
  limit?: number;
}): Promise<CatalogHit[]> {
  const words = (opts.query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);
  const match = words.length
    ? sql`and (${sql.join(
        words.map((w) => sql`(p.name || ' ' || p.tagline || ' ' || p.description) ilike ${`%${w}%`}`),
        sql` or `,
      )})`
    : sql``;
  const category = opts.category
    ? sql`and exists (select 1 from product_categories pc where pc.product_id = p.id and pc.category_slug = ${opts.category})`
    : sql``;
  const rows = (await queryRows(sql`
    select p.slug, p.name, p.tagline, p.pricing_model,
      coalesce((select array_agg(pc.category_slug) from product_categories pc where pc.product_id = p.id), '{}') as categories,
      (select count(*)::int from applause v where v.product_id = p.id) as applause
    from products p
    where ${liveSql()} ${category} ${match}
    order by applause desc, p.approved_at desc
    limit ${Math.min(opts.limit ?? 40, 80)}
  `)) as unknown as Array<{
    slug: string;
    name: string;
    tagline: string;
    pricing_model: string;
    categories: string[];
    applause: number;
  }>;
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    pricingModel: r.pricing_model,
    categories: r.categories,
    applause: r.applause,
  }));
}

/** Board categories with how many live products each has: the raw material for roundups. */
export async function catalogCategories() {
  return (await queryRows(sql`
    select c.slug, c.name, count(p.id)::int as live
    from categories c
    join product_categories pc on pc.category_slug = c.slug
    join products p on p.id = pc.product_id and ${liveSql()}
    group by c.slug, c.name
    order by live desc
  `)) as unknown as Array<{ slug: string; name: string; live: number }>;
}

/**
 * Well-known tools makers compare themselves to in their descriptions
 * ("an alternative to Notion", "like Calendly but…"): candidates for
 * "{Tool} alternatives" articles, which our listings can answer.
 */
export async function incumbentMentions(limit = 20): Promise<{ tool: string; products: string[] }[]> {
  const rows = (await queryRows(sql`
    select p.slug, p.tagline || ' ' || p.description as text from products p where ${liveSql()}
  `)) as unknown as Array<{ slug: string; text: string }>;
  const found = new Map<string, Set<string>>();
  const patterns = [
    /\balternative to ([A-Z][\w.]+(?: [A-Z][\w.]+)?)/g,
    /\b([A-Z][\w.]+(?: [A-Z][\w.]+)?) alternative\b/g,
    /\blike ([A-Z][\w.]+(?: [A-Z][\w.]+)?),? but\b/g,
    /\b([A-Z][\w.]+) for (?:startups|founders|makers|indie hackers|small teams)\b/g,
  ];
  const skip = new Set(["The", "A", "An", "It", "Our", "Your", "This", "We", "AI", "Open", "Free", "Best"]);
  for (const r of rows) {
    for (const re of patterns) {
      for (const m of r.text.matchAll(re)) {
        const tool = m[1]!.trim();
        if (skip.has(tool) || tool.length < 3) continue;
        found.set(tool, (found.get(tool) ?? new Set()).add(r.slug));
      }
    }
  }
  return [...found.entries()]
    .map(([tool, slugs]) => ({ tool, products: [...slugs] }))
    .sort((a, b) => b.products.length - a.products.length)
    .slice(0, limit);
}

/** Plain text of an HTML page: scripts, styles and tags removed, whitespace collapsed. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const USEFUL = /\/(pricing|plans|features|product|how-it-works|docs|faq|about|privacy|security)(\/|$|\?|#)/i;

export type ProductPage = { url: string; text: string };

/**
 * A product's own site: the home page plus up to three of its pricing,
 * features, docs, FAQ or privacy pages. SSRF-safe (public hosts only).
 */
export async function readProductSite(websiteUrl: string, maxPages = 4): Promise<ProductPage[]> {
  const pages: ProductPage[] = [];
  let home: Awaited<ReturnType<typeof safeFetchText>>;
  try {
    home = await safeFetchText(websiteUrl, { timeoutMs: 8000 });
  } catch {
    return pages;
  }
  if (home.status >= 400) return pages;
  pages.push({ url: home.url, text: pageText(home.body).slice(0, 6000) });
  const base = new URL(home.url);
  const links = new Set<string>();
  for (const m of home.body.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1]!, base);
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      if (USEFUL.test(u.pathname + "/")) links.add(`${u.origin}${u.pathname}`);
    } catch {}
  }
  const more = await Promise.all(
    [...links].slice(0, maxPages - 1).map(async (url) => {
      try {
        const r = await safeFetchText(url, { timeoutMs: 8000 });
        return r.status < 400 ? { url: r.url, text: pageText(r.body).slice(0, 5000) } : null;
      } catch {
        return null;
      }
    }),
  );
  return [...pages, ...more.filter((p): p is ProductPage => Boolean(p))];
}

/** The product block of the agent's context. */
export function productBlock(products: ProductFacts[], outside: string[] = []): string {
  const lines = products.map((p) =>
    [
      `- ${p.name} [DebutYard listing: /p/${p.slug}]`,
      `  Tagline: ${p.tagline}`,
      `  Website: ${p.websiteUrl}`,
      `  Pricing model: ${p.pricingModel}`,
      `  Categories: ${p.categories.map((c) => `${c.name} (/category/${c.slug})`).join(", ") || "none"}`,
      `  Community applause: ${p.applause}${p.awards.length ? `; awards: ${p.awards.join(", ")}` : ""}`,
      p.makerName ? `  Maker: ${p.makerName}` : "",
      p.screenshots.length
        ? `  Screenshots you may embed: ${p.screenshots.join(" ")}`
        : "  Screenshots: none on the listing",
      `  Description: ${p.description.replace(/\s+/g, " ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  for (const name of outside)
    lines.push(`- ${name} [outside tool: not on DebutYard; website and facts from RESEARCH only]`);
  return lines.join("\n");
}

export function pagesBlock(pages: { product: string; pages: ProductPage[] }[], checkedOn = new Date()): string {
  const date = formatPostDate(checkedOn);
  return pages
    .map(({ product, pages }) =>
      pages.length
        ? pages.map((p) => `### ${product}: ${p.url} (read ${date})\n${p.text}`).join("\n\n")
        : `### ${product}: the website couldn't be read`,
    )
    .join("\n\n");
}

/** Live products by id, for checks that need status (e.g. a launch post's subject). */
export async function liveProductIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await db()
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(
      and(
        inArray(schema.products.id, ids),
        eq(schema.products.status, "approved"),
        sql`${schema.products.launchWeekKey} <= ${weekKeyFor(new Date())}`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}
