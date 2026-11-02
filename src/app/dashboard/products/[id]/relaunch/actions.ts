"use server";

import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { CheckoutError, startCheckout } from "@/lib/payments/service";
import type { ProviderId } from "@/lib/payments/types";
import { relaunchFor } from "@/lib/products/relaunch";

/** Starts checkout for more featured time. The price comes from the listing's tier, never from the browser. */
export async function relaunchCheckoutAction(
  productId: string,
  provider: ProviderId,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: "Listing not found." };
  if (!enabledProviders().includes(provider)) return { ok: false, error: "That payment method isn't available yet." };
  const view = await relaunchFor(user.id, productId);
  if (!view) return { ok: false, error: "This listing can't be featured again." };
  if (view.featuredUntil) return { ok: false, error: "This listing is already featured." };
  try {
    const { orderId, url } = await startCheckout({
      skuId: view.offer.sku,
      provider,
      email: user.email,
      userId: user.id,
      metadata: { productId },
      returnTo: "dashboard",
    });
    // With the listing's other orders, so rejecting it would refund this too.
    await db().insert(schema.productOrders).values({ orderId, productId });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, error: err.message };
    console.error("relaunch checkout failed", err);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}
