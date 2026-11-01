"use server";

import { z } from "zod";
import { availability, BookingError, bookSlot, extraWeeksFor } from "@/lib/ads/service";
import { PLACEMENT_IDS, type Placement } from "@/lib/ads/placements";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { CouponError } from "@/lib/payments/pricing";
import { CheckoutError } from "@/lib/payments/service";

const placement = z.enum(PLACEMENT_IDS as [Placement, ...Placement[]]);
const slug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export async function availabilityAction(p: string, categorySlug: string | null) {
  const parsed = placement.safeParse(p);
  if (!parsed.success) return [];
  const cat = categorySlug && slug.safeParse(categorySlug).success ? categorySlug : null;
  if (parsed.data === "category" && !cat) return [];
  const user = await getCurrentUser();
  return availability(parsed.data, cat, new Date(), user ? await extraWeeksFor(user.id) : 0);
}

const input = z.object({
  placement,
  duration: z.enum(["week", "month"]),
  productId: z.string().uuid(),
  categorySlug: slug.nullable(),
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
  provider: z.enum(["paystack", "paypal"]),
  coupon: z.string().max(64).optional(),
  returnTo: z.literal("dashboard").optional(),
  recurring: z.boolean().optional(),
});

export async function bookAction(
  raw: z.input<typeof input>,
): Promise<{ ok: true; url: string } | { ok: false; error: string; needsAuth?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to book a slot.", needsAuth: true };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the booking details." };
  const data = parsed.data;
  if (!enabledProviders().includes(data.provider))
    return { ok: false, error: "That payment method isn't available yet." };
  try {
    const { url } = await bookSlot({
      userId: user.id,
      email: user.email,
      placement: data.placement,
      duration: data.duration,
      productId: data.productId,
      categorySlug: data.categorySlug,
      weekKey: data.weekKey,
      provider: data.provider,
      couponCode: data.coupon || null,
      returnTo: data.returnTo,
      recurring: data.recurring,
    });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof BookingError || err instanceof CouponError || err instanceof CheckoutError) {
      return { ok: false, error: err.message };
    }
    console.error("booking failed", err);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}
