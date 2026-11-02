import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, queryRows, schema } from "@/db";
import { slugify } from "@/lib/slug";

const { directories } = schema;
export type Directory = typeof directories.$inferSelect;

export const NICHES = ["general", "devtools", "ai", "indie", "b2b"] as const;
export const NICHE_LABELS: Record<(typeof NICHES)[number], string> = {
  general: "General",
  devtools: "Developer tools",
  ai: "AI tools",
  indie: "Indie & startups",
  b2b: "B2B software",
};
export const PRICINGS = ["free", "freemium", "paid"] as const;

export const directoryFilters = z.object({
  niche: z.enum(NICHES).optional(),
  pricing: z.enum(PRICINGS).optional(),
  /** Hide directories that require a badge. */
  noBadge: z.boolean().optional(),
  dofollow: z.boolean().optional(),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(["dr", "name", "acceptance"]).default("dr"),
});
export type DirectoryFilters = z.input<typeof directoryFilters>;

/** Active directories, filtered; DR high to low by default (unmeasured last). */
export async function listDirectories(raw: DirectoryFilters = {}) {
  const f = directoryFilters.parse(raw);
  const where: SQL[] = [eq(directories.isActive, true)];
  if (f.niche) where.push(eq(directories.niche, f.niche));
  if (f.pricing) where.push(eq(directories.pricing, f.pricing));
  if (f.noBadge) where.push(eq(directories.badgeRequired, false));
  if (f.dofollow)
    where.push(
      sql`coalesce(nullif(${directories.linkTypeObserved}, 'unknown'), ${directories.linkTypeClaimed}) = 'dofollow'`,
    );
  if (f.q) where.push(sql`${directories.name} ilike ${`%${f.q.replace(/[%_\\]/g, "\\$&")}%`}`);
  const order =
    f.sort === "name"
      ? [asc(directories.name)]
      : f.sort === "acceptance"
        ? [sql`${directories.acceptanceRate} desc nulls last`, asc(directories.name)]
        : [sql`${directories.dr} desc nulls last`, asc(directories.name)];
  return db()
    .select()
    .from(directories)
    .where(and(...where))
    .orderBy(...order);
}

export async function getDirectory(slug: string) {
  return db().query.directories.findFirst({ where: and(eq(directories.slug, slug), eq(directories.isActive, true)) });
}

export async function allDirectoriesForAdmin() {
  return db()
    .select()
    .from(directories)
    .orderBy(
      desc(directories.isActive),
      desc(directories.isStarred),
      sql`${directories.dr} desc nulls last`,
      asc(directories.name),
    );
}

/** Stars a directory, so it's picked first for submission orders, or takes the star off. */
export async function setDirectoryStarred(id: string, starred: boolean) {
  await db().update(directories).set({ isStarred: starred }).where(eq(directories.id, id));
}

/** The link type we trust: what our checks observed, else what the directory claims. */
export function effectiveLinkType(d: Pick<Directory, "linkTypeObserved" | "linkTypeClaimed">) {
  return d.linkTypeObserved !== "unknown" ? d.linkTypeObserved : d.linkTypeClaimed;
}

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(min).max(max).nullable(),
  );
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "Use an http(s) URL.");

export const directoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/)
    .default(""),
  url: httpUrl,
  submitUrl: z.preprocess((v) => (v === "" ? null : v), httpUrl.nullable()).default(null),
  description: z.string().trim().max(500).default(""),
  niche: z.enum(NICHES).default("general"),
  pricing: z.enum(PRICINGS).default("free"),
  dr: optionalInt(0, 100).default(null),
  linkTypeClaimed: z.enum(["dofollow", "nofollow", "unknown"]).default("unknown"),
  badgeRequired: z.boolean().default(false),
  needsAccount: z.boolean().default(true),
  guided: z.boolean().default(false),
  queueEstimateDays: optionalInt(0, 365).default(null),
  submissionNotes: z.string().trim().max(1000).default(""),
  instructions: z.string().trim().max(5000).default(""),
  badgeSnippet: z
    .preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(5000).nullable())
    .default(null),
  isActive: z.boolean().default(true),
});
export type DirectoryInput = z.input<typeof directoryInput>;

export async function saveDirectory(raw: DirectoryInput, id?: string): Promise<Directory> {
  const input = directoryInput.parse(raw);
  const values = { ...input, slug: input.slug || slugify(input.name, 60) };
  if (id) {
    const [row] = await db().update(directories).set(values).where(eq(directories.id, id)).returning();
    return row;
  }
  const [row] = await db().insert(directories).values(values).returning();
  return row;
}

/**
 * Daily: acceptance rate, days to live and the observed link type per
 * directory, from every finished submission (DIY and done-for-you).
 */
export async function refreshDirectoryStats() {
  await db().execute(sql`
    update directories d set
      acceptance_rate = s.rate,
      avg_days_to_live = s.days,
      live_count = s.live
    from (
      select directory_id,
        count(*) filter (where status in ('live', 'dead'))::float8
          / nullif(count(*) filter (where status in ('live', 'dead', 'rejected', 'replaced')), 0) as rate,
        avg(extract(epoch from (live_at - submitted_at)) / 86400)
          filter (where live_at is not null and submitted_at is not null) as days,
        count(*) filter (where status = 'live')::int as live
      from submissions group by directory_id
    ) s
    where s.directory_id = d.id
  `);
  // Observed link type: whichever of dofollow/nofollow our checks saw more of in the last 90 days (ties: dofollow).
  await db().execute(sql`
    update directories d set link_type_observed = s.observed
    from (
      select sub.directory_id,
        case when count(*) filter (where c.verdict = 'dofollow') >= count(*) filter (where c.verdict = 'nofollow')
          then 'dofollow'::link_type else 'nofollow'::link_type end as observed
      from link_checks c
      join submissions sub on sub.id = c.submission_id
      where c.checked_at > now() - interval '90 days' and c.verdict in ('dofollow', 'nofollow')
      group by sub.directory_id
    ) s
    where s.directory_id = d.id and d.link_type_observed is distinct from s.observed
  `);
}

export type CatalogStats = { active: number; medianDr: number | null; dr50: number; dofollow: number };

/** Headline numbers for the submission-service page, from active directories we can submit to for you. */
export async function catalogStats(): Promise<CatalogStats> {
  const [row] = await queryRows<{ active: number; median_dr: number | null; dr50: number; dofollow: number }>(sql`
    select count(*)::int as active,
      round(percentile_cont(0.5) within group (order by dr))::int as median_dr,
      count(*) filter (where dr >= 50)::int as dr50,
      count(*) filter (where coalesce(nullif(link_type_observed, 'unknown'), link_type_claimed) = 'dofollow')::int as dofollow
    from directories
    where is_active and not guided
  `);
  return {
    active: Number(row?.active ?? 0),
    medianDr: row?.median_dr == null ? null : Number(row.median_dr),
    dr50: Number(row?.dr50 ?? 0),
    dofollow: Number(row?.dofollow ?? 0),
  };
}
