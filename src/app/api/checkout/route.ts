import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { CouponError } from "@/lib/payments/pricing";
import { CheckoutError, startCheckout, startSubscription } from "@/lib/payments/service";
import { getSku, isPurchasable } from "@/lib/payments/skus";

const body = z.object({
  sku: z.string().min(1),
  provider: z.enum(["paystack", "paypal"]),
  email: z.string().email().optional(),
  coupon: z.string().max(64).optional(),
  /** Submission packages only: boost one of the buyer's own listings. */
  productId: z.string().uuid().optional(),
  /** Bought from the dashboard: come back to it after checkout. */
  returnTo: z.literal("dashboard").optional(),
});

/** Starts a checkout and returns the provider URL to redirect to. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;

  if (!enabledProviders().includes(input.provider)) {
    return Response.json({ error: "That payment method isn't available yet." }, { status: 400 });
  }

  const sku = getSku(input.sku);
  if (!sku) return Response.json({ error: "Unknown product" }, { status: 404 });
  if (!isPurchasable(sku)) return Response.json({ error: "This isn't available to buy yet." }, { status: 400 });

  const user = await getCurrentUser();
  const email = user?.email ?? input.email;

  try {
    if (sku.type === "recurring") {
      if (!user) return Response.json({ error: "Sign in to subscribe." }, { status: 401 });
      const { url } = await startSubscription({
        skuId: sku.id,
        provider: input.provider,
        userId: user.id,
        email: user.email,
        returnTo: input.returnTo,
      });
      return Response.json({ url });
    }
    // One-time purchases (e.g. the submission service) don't need an account.
    if (!email) return Response.json({ error: "Email is required." }, { status: 400 });
    let metadata: Record<string, unknown> | undefined;
    if (input.productId && sku.kind === "submission" && user) {
      const owned = await db().query.products.findFirst({
        where: and(eq(schema.products.id, input.productId), eq(schema.products.createdBy, user.id)),
        columns: { id: true },
      });
      if (owned) metadata = { productId: owned.id };
    }
    // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
    // const via = await referralCode();
    // if (via) metadata = { ...metadata, via };
    const { url } = await startCheckout({
      skuId: sku.id,
      provider: input.provider,
      email,
      userId: user?.id,
      couponCode: input.coupon || null,
      metadata,
      returnTo: input.returnTo,
    });
    return Response.json({ url });
  } catch (err) {
    if (err instanceof CouponError || err instanceof CheckoutError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("checkout failed", err);
    return Response.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
