"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canOverrideFreeRules, getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { CouponError } from "@/lib/payments/pricing";
import { CheckoutError, startCheckout } from "@/lib/payments/service";
import type { ProviderId } from "@/lib/payments/types";
import { notifyProductSubmitted } from "@/lib/notifications";
import { productInput, TIERS, tierRank, type ProductInput, type Tier } from "@/lib/products/input";
import type { Prefill } from "@/lib/products/prefill";
import { planChoices, type PlanChoices } from "@/lib/products/plan-choices";
import { prefillFromSite } from "@/lib/products/prefill-service";
import { listCategories, screenshotsEnabled, uploadsEnabled } from "@/lib/products/queries";
import { captureHomepage, importOgImage, SCREENSHOTS_PER_HOUR } from "@/lib/products/screenshots";
import {
  assertHasScreenshot,
  bookableWeeks,
  listingLimitReached,
  ProductError,
  saveProduct,
  submitForReview,
} from "@/lib/products/service";
import { joinSpotlightWaitlist, spotlightAvailable } from "@/lib/products/spotlight";
import { createUploadUrl, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { spend, ToolError } from "@/lib/tools/service";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** What the debut modal needs before it can show the form. */
export async function debutSetupAction(): Promise<
  Result<{ categories: Array<{ slug: string; name: string }>; uploadsEnabled: boolean; screenshotsEnabled: boolean }>
> {
  if (!(await getCurrentUser())) return { ok: false, error: "Sign in first." };
  return {
    ok: true,
    data: {
      categories: await listCategories(),
      uploadsEnabled: uploadsEnabled(),
      screenshotsEnabled: screenshotsEnabled(),
    },
  };
}

/** Plan options for the modal's plan step. */
export async function planChoicesAction(productId: string): Promise<Result<PlanChoices>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const choices = await planChoices(user.id, productId, { override: await canOverrideFreeRules(user) });
  return choices ? { ok: true, data: choices } : { ok: false, error: "Listing not found." };
}

/** Lets the modal follow a checkout that's happening in another tab. */
export async function orderStatusAction(
  orderId: string,
): Promise<Result<{ status: "pending" | "paid" | "failed" | "refunded"; reason: string | null }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return { ok: false, error: "Order not found." };
  const order = await db().query.orders.findFirst({
    where: and(eq(schema.orders.id, orderId), eq(schema.orders.userId, user.id)),
    columns: { status: true, failureReason: true },
  });
  if (!order) return { ok: false, error: "Order not found." };
  const status = order.status === "partially_refunded" ? "refunded" : order.status;
  return { ok: true, data: { status, reason: order.failureReason } };
}

/** Fetches the maker's site and suggests listing details. */
export async function prefillAction(url: string): Promise<Result<Prefill>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  return prefillFromSite(url);
}

/** Creates or updates a listing; the caller then shows the plan step. */
export async function saveProductAction(input: ProductInput, productId?: string): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  try {
    if (!productId) {
      const full = await listingLimitReached(user.id, { override: await canOverrideFreeRules(user) });
      if (full) return { ok: false, error: full };
    }
    const product = await saveProduct(user.id, parsed.data, productId);
    return { ok: true, data: { id: product.id } };
  } catch (err) {
    if (err instanceof ProductError) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * The listing's first screenshot: the homepage's OG image copied into R2, or,
 * when the site has none we can use, a screenshot from the worker. Runs after
 * the prefill (which finds the OG image), so it never holds the form up.
 */
export async function homepageImageAction(url: string, ogImageUrl?: string): Promise<Result<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!uploadsEnabled()) return { ok: false, error: "Screenshots aren't set up." };
  if (!ogImageUrl && !screenshotsEnabled()) return { ok: false, error: "No homepage image found." };
  try {
    await spend("screenshot", url, { userId: user.id, clientKey: "web", source: "web" }, SCREENSHOTS_PER_HOUR);
  } catch (err) {
    if (err instanceof ToolError) return { ok: false, error: err.message };
    throw err;
  }
  const og = ogImageUrl ? await importOgImage(ogImageUrl) : null;
  if (og) return { ok: true, data: { url: og } };
  const shot = screenshotsEnabled() ? await captureHomepage(url) : null;
  return shot ? { ok: true, data: { url: shot } } : { ok: false, error: "We couldn't get an image of that site." };
}

/** Presigned upload for a listing screenshot (R2). */
export async function screenshotUploadAction(
  contentType: string,
  size: number,
): Promise<Result<{ uploadUrl: string; publicUrl: string }>> {
  if (!(await getCurrentUser())) return { ok: false, error: "Sign in first." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: "Screenshots must be under 5 MB." };
  try {
    const { uploadUrl, publicUrl } = await createUploadUrl({ folder: "screenshots", contentType, contentLength: size });
    return { ok: true, data: { uploadUrl, publicUrl } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

/** Presigned upload for a listing logo (R2). */
export async function logoUploadAction(
  contentType: string,
  size: number,
): Promise<Result<{ uploadUrl: string; publicUrl: string }>> {
  if (!(await getCurrentUser())) return { ok: false, error: "Sign in first." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: "Logos must be under 5 MB." };
  try {
    const { uploadUrl, publicUrl } = await createUploadUrl({ folder: "logos", contentType, contentLength: size });
    return { ok: true, data: { uploadUrl, publicUrl } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

/** Free debut: straight into the review queue. */
export async function submitFreeAction(productId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  try {
    const p = await submitForReview(productId, user.id, { override: await canOverrideFreeRules(user) });
    if (p.status === "pending") await notifyProductSubmitted(p);
  } catch (err) {
    if (err instanceof ProductError) return { ok: false, error: err.message };
    throw err;
  }
  return { ok: true, data: undefined };
}

/** Maker Pro: Fast Track with this quarter's free credit, no checkout. */
export async function redeemFastTrackAction(productId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!/^[0-9a-f-]{36}$/.test(productId)) return { ok: false, error: "Listing not found." };
  const { BillingError, redeemFastTrack } = await import("@/lib/billing/service");
  try {
    await redeemFastTrack(user.id, productId);
  } catch (err) {
    if (err instanceof BillingError || err instanceof ProductError) return { ok: false, error: err.message };
    throw err;
  }
  return { ok: true, data: undefined };
}

/** Paid debut: creates the order and returns the provider's checkout URL. */
export async function startTierCheckoutAction(args: {
  productId: string;
  tier: Exclude<Tier, "free">;
  provider: ProviderId;
  weekKey?: string;
  coupon?: string;
}): Promise<Result<{ url: string; orderId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const tier = TIERS[args.tier];
  if (!tier?.sku) return { ok: false, error: "Unknown plan." };
  if (!enabledProviders().includes(args.provider)) return { ok: false, error: "That payment method isn't available." };

  const product = await db().query.products.findFirst({
    where: and(eq(schema.products.id, args.productId), eq(schema.products.createdBy, user.id)),
  });
  if (!product) return { ok: false, error: "Listing not found." };
  if (product.status === "archived") return { ok: false, error: "This listing is archived." };
  if (tierRank(args.tier) <= tierRank(product.tier))
    return { ok: false, error: `This listing already has ${TIERS[product.tier].label}.` };
  try {
    await assertHasScreenshot(product);
  } catch (err) {
    if (err instanceof ProductError) return { ok: false, error: err.message };
    throw err;
  }

  let weekKey: string | undefined;
  if (tier.picksWeek) {
    if (!args.weekKey || !bookableWeeks().includes(args.weekKey)) return { ok: false, error: "Pick a debut week." };
    weekKey = args.weekKey;
  }
  if (args.tier === "spotlight" && !(await spotlightAvailable(product.id))) {
    return {
      ok: false,
      error: "All 3 Spotlight spots are taken. Join the waitlist and we'll email you when one opens.",
    };
  }

  try {
    const { orderId, url } = await startCheckout({
      skuId: tier.sku,
      provider: args.provider,
      email: user.email,
      userId: user.id,
      couponCode: args.coupon || null,
      // Affiliates are paused (see src/lib/affiliates/PAUSED.md); this also sent `via: await referralCode()`.
      metadata: { productId: product.id, weekKey: weekKey ?? null },
    });
    await db().insert(schema.productOrders).values({ orderId, productId: product.id });
    return { ok: true, data: { url, orderId } };
  } catch (err) {
    if (err instanceof CouponError || err instanceof CheckoutError) return { ok: false, error: err.message };
    console.error("tier checkout failed", err);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}

/** Spotlight is full: email the maker when one of the 3 spots opens. */
export async function joinSpotlightWaitlistAction(productId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const owned = /^[0-9a-f-]{36}$/.test(productId)
    ? await db().query.products.findFirst({
        where: and(eq(schema.products.id, productId), eq(schema.products.createdBy, user.id)),
        columns: { id: true },
      })
    : null;
  await joinSpotlightWaitlist(user.id, owned?.id ?? null);
  return { ok: true, data: undefined };
}
