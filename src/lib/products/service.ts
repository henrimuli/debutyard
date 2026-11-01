import "server-only";
import { and, count, eq, gt, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { limit } from "@/lib/billing/entitlements";
import { formatLimit, PLANS } from "@/lib/billing/plans";
import { domainOf, slugify, uniqueSlug } from "@/lib/slug";
import { upcomingWeekKeys, weekBounds, weekKeyFor } from "@/lib/weeks";
import { tierRank, type ProductInput, type Tier } from "./input";
import { paidWeek } from "./schedule";

export { BOOKABLE_WEEKS, bookableWeeks } from "./schedule";

const { products, productCategories, launchWeeks, categories, badgeVerifications } = schema;

export type Product = typeof products.$inferSelect;

export class ProductError extends Error {}

/** Free debuts a maker can have waiting or scheduled at once. */
export const MAX_ACTIVE_FREE = 2;
const DEFAULT_FREE_CAPACITY = 30;

export async function ensureWeek(key: string) {
  const { startsAt, endsAt } = weekBounds(key);
  await db()
    .insert(launchWeeks)
    .values({ key, startsAt, endsAt, freeCapacity: DEFAULT_FREE_CAPACITY })
    .onConflictDoNothing();
}

async function getOwned(productId: string, userId: string): Promise<Product> {
  const p = await db().query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.createdBy, userId)),
  });
  if (!p) throw new ProductError("Product not found.");
  return p;
}

async function setCategories(productId: string, slugs: string[]) {
  const valid = await db().select({ slug: categories.slug }).from(categories).where(inArray(categories.slug, slugs));
  if (valid.length !== new Set(slugs).size) throw new ProductError("Unknown category.");
  await db().delete(productCategories).where(eq(productCategories.productId, productId));
  await db()
    .insert(productCategories)
    .values(valid.map((c) => ({ productId, categorySlug: c.slug })));
}

/** Replaces the listing's gallery, keeping the given order. */
async function setScreenshots(productId: string, urls: string[]) {
  await db().delete(schema.productMedia).where(eq(schema.productMedia.productId, productId));
  if (urls.length) {
    await db()
      .insert(schema.productMedia)
      .values(urls.map((url, position) => ({ productId, url, position })));
  }
}

/**
 * A listing going into review needs a screenshot: the homepage's sponsored
 * cards show the first. Listings already approved (from before this was
 * required) can still be upgraded.
 */
export async function assertHasScreenshot(p: Pick<Product, "id" | "status">) {
  if (p.status !== "draft" && p.status !== "rejected") return;
  const shot = await db().query.productMedia.findFirst({
    where: eq(schema.productMedia.productId, p.id),
    columns: { id: true },
  });
  if (!shot) throw new ProductError("Add at least one screenshot to the listing before submitting it.");
}

/** Another live or upcoming listing for the same site blocks a new one (relaunches come later). */
async function assertNotDuplicate(domain: string, exceptId?: string) {
  const existing = await db().query.products.findFirst({
    where: and(
      eq(products.domain, domain),
      notInArray(products.status, ["draft", "rejected", "archived"]),
      exceptId ? ne(products.id, exceptId) : undefined,
    ),
    columns: { slug: true },
  });
  if (existing) throw new ProductError(`${domain} is already listed on DebutYard.`);
}

/** Creates or updates a draft (or a pending listing, before review). */
/**
 * Why the user can't add another listing, or null if they can. Everything but archived
 * listings counts. Anyone over their limit keeps what they have.
 */
export async function listingLimitReached(userId: string, now = new Date()): Promise<string | null> {
  const [max, [row]] = await Promise.all([
    limit(userId, "listings", now),
    db()
      .select({ n: count() })
      .from(schema.products)
      .where(and(eq(schema.products.createdBy, userId), ne(schema.products.status, "archived"))),
  ]);
  if (row.n < max) return null;
  const next = PLANS.find((p) => p.limits.listings > max);
  if (!next) return `You've reached the fair-use limit of ${max} listings. Email us and we'll sort it out.`;
  return `Your plan covers ${max} listings. Archive one, or upgrade to ${next.label} for ${formatLimit(next.limits.listings).toLowerCase()}.`;
}

export async function saveProduct(userId: string, input: ProductInput, productId?: string): Promise<Product> {
  const domain = domainOf(input.websiteUrl);
  await assertNotDuplicate(domain, productId);

  const fields = {
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    websiteUrl: input.websiteUrl,
    domain,
    logoUrl: input.logoUrl ?? null,
    pricingModel: input.pricingModel,
    twitterUrl: input.twitterUrl ?? null,
    githubUrl: input.githubUrl ?? null,
  };

  let product: Product;
  if (productId) {
    const current = await getOwned(productId, userId);
    if (current.status !== "draft" && current.status !== "pending" && current.status !== "rejected") {
      throw new ProductError("Approved listings can't be edited here yet. Email support for changes.");
    }
    [product] = await db().update(products).set(fields).where(eq(products.id, productId)).returning();
  } else {
    const slug = await uniqueSlug(slugify(input.name), async (s) =>
      Boolean(await db().query.products.findFirst({ where: eq(products.slug, s), columns: { id: true } })),
    );
    [product] = await db()
      .insert(products)
      .values({ ...fields, slug, createdBy: userId })
      .returning();
    await db()
      .insert(badgeVerifications)
      .values({ productId: product.id, dnsToken: randomBytes(12).toString("hex") })
      .onConflictDoNothing();
  }
  await setCategories(product.id, input.categories);
  if (input.screenshots) await setScreenshots(product.id, input.screenshots);
  return product;
}

/** Free listings a maker has waiting for review or scheduled for a future week. */
export async function activeFreeCount(userId: string, exceptId?: string): Promise<number> {
  const now = new Date();
  const [row] = await db()
    .select({ n: count() })
    .from(products)
    .leftJoin(launchWeeks, eq(launchWeeks.key, products.launchWeekKey))
    .where(
      and(
        eq(products.createdBy, userId),
        eq(products.tier, "free"),
        exceptId ? ne(products.id, exceptId) : undefined,
        or(eq(products.status, "pending"), and(eq(products.status, "approved"), gt(launchWeeks.endsAt, now))),
      ),
    );
  return row?.n ?? 0;
}

/** The listing's badge record: its status from our last check, and its DNS token. */
export async function badgeRecord(productId: string) {
  return db().query.badgeVerifications.findFirst({
    where: eq(badgeVerifications.productId, productId),
    columns: { status: true, dnsToken: true },
  });
}

/**
 * Moves a draft into the review queue. Free debuts need a verified badge; paid tiers arrive via checkout.
 * `override` (owners and admins, see canOverrideFreeRules) skips the badge and the waiting-debut cap.
 * The badge record is left as it is, so the listing's link stays nofollow until a badge is really found.
 */
export async function submitForReview(
  productId: string,
  userId: string,
  opts: { override?: boolean } = {},
): Promise<Product> {
  const p = await getOwned(productId, userId);
  if (p.status !== "draft" && p.status !== "rejected") return p;
  await assertHasScreenshot(p);
  if (p.tier === "free" && !opts.override && (await activeFreeCount(userId, p.id)) >= MAX_ACTIVE_FREE) {
    throw new ProductError(
      `You can have ${MAX_ACTIVE_FREE} free debuts waiting at a time. Upgrade this one, or wait for one to launch.`,
    );
  }
  if (p.tier === "free" && !opts.override && (await badgeRecord(p.id))?.status !== "verified") {
    throw new ProductError(
      "Free debuts need the DebutYard badge on your site. Add it, run the check, and submit once we've found it.",
    );
  }
  const [updated] = await db()
    .update(products)
    .set({ status: "pending", submittedAt: new Date(), rejectionReason: null })
    .where(eq(products.id, p.id))
    .returning();
  return updated;
}

/** The first week from next week that still has free capacity. */
export async function nextFreeWeek(now = new Date()): Promise<string> {
  const candidates = upcomingWeekKeys(now, 52);
  const used = await db()
    .select({ key: products.launchWeekKey, n: count() })
    .from(products)
    .where(and(eq(products.status, "approved"), eq(products.tier, "free"), inArray(products.launchWeekKey, candidates)))
    .groupBy(products.launchWeekKey);
  const caps = await db()
    .select({ key: launchWeeks.key, cap: launchWeeks.freeCapacity })
    .from(launchWeeks)
    .where(inArray(launchWeeks.key, candidates));
  const usedBy = new Map(used.map((u) => [u.key, u.n]));
  const capBy = new Map(caps.map((c) => [c.key, c.cap]));
  return candidates.find((k) => (usedBy.get(k) ?? 0) < (capBy.get(k) ?? DEFAULT_FREE_CAPACITY)) ?? candidates.at(-1)!;
}

/**
 * Which week a product goes into when approved (or re-scheduled after an upgrade).
 * Free: the next Monday with a free slot. Paid: this week, so it's live on approval (see schedule.ts).
 */
export async function weekForProduct(p: Pick<Product, "tier" | "requestedWeekKey">, now = new Date()): Promise<string> {
  if (p.tier === "free") return nextFreeWeek(now);
  return paidWeek(p.tier, p.requestedWeekKey, now);
}

export function hasStarted(weekKey: string | null, now = new Date()): boolean {
  return Boolean(weekKey) && weekBounds(weekKey!).startsAt.getTime() <= now.getTime();
}

/** Approves a pending listing and schedules it. */
export async function approveProduct(productId: string): Promise<Product> {
  const p = await db().query.products.findFirst({ where: eq(products.id, productId) });
  if (!p) throw new ProductError("Product not found.");
  if (p.status !== "pending") throw new ProductError(`Product is ${p.status}, not pending.`);
  const week = await weekForProduct(p);
  await ensureWeek(week);
  const [updated] = await db()
    .update(products)
    .set({ status: "approved", approvedAt: new Date(), launchWeekKey: week, rejectionReason: null })
    .where(and(eq(products.id, productId), eq(products.status, "pending")))
    .returning();
  if (!updated) throw new ProductError("Product changed while approving; reload and try again.");
  return updated;
}

export async function rejectProduct(productId: string, reason: string): Promise<Product> {
  const [updated] = await db()
    .update(products)
    .set({ status: "rejected", rejectionReason: reason })
    .where(and(eq(products.id, productId), eq(products.status, "pending")))
    .returning();
  if (!updated) throw new ProductError("Only pending listings can be rejected.");
  return updated;
}

/**
 * Applies a paid tier after checkout: never downgrades, records the requested week,
 * sends drafts to review, and moves approved-but-not-started listings to the right week.
 */
export async function applyPaidTier(productId: string, tier: Tier, requestedWeekKey: string | null): Promise<Product> {
  const p = await db().query.products.findFirst({ where: eq(products.id, productId) });
  if (!p) throw new ProductError("Product not found.");

  const newTier = tierRank(tier) > tierRank(p.tier) ? tier : p.tier;
  const patch: Partial<Product> = { tier: newTier, requestedWeekKey: requestedWeekKey ?? p.requestedWeekKey };
  if (p.status === "draft" || p.status === "rejected") {
    Object.assign(patch, { status: "pending", submittedAt: new Date(), rejectionReason: null });
  }
  if (p.status === "approved" && !hasStarted(p.launchWeekKey)) {
    const week = await weekForProduct({ tier: newTier, requestedWeekKey: patch.requestedWeekKey ?? null });
    await ensureWeek(week);
    patch.launchWeekKey = week;
  }
  const [updated] = await db().update(products).set(patch).where(eq(products.id, productId)).returning();
  return updated;
}

/** Products visible on the public site: approved and their week has started. */
export function isLiveCondition(now = new Date()) {
  return and(
    eq(products.status, "approved"),
    sql`${products.launchWeekKey} <= ${weekKeyFor(now)}`,
    sql`${products.launchWeekKey} is not null`,
  );
}

/** For the dashboard: how many approved free listings are scheduled before this one. */
export async function queueAhead(p: Product): Promise<number> {
  if (p.status !== "approved" || p.tier !== "free" || !p.launchWeekKey || !p.approvedAt) return 0;
  const [row] = await db()
    .select({ n: count() })
    .from(products)
    .where(
      and(
        eq(products.status, "approved"),
        eq(products.tier, "free"),
        sql`${products.launchWeekKey} > ${weekKeyFor(new Date())}`,
        sql`(${products.launchWeekKey}, ${products.approvedAt}) < (${p.launchWeekKey}, ${p.approvedAt.toISOString()}::timestamptz)`,
      ),
    );
  return row?.n ?? 0;
}
