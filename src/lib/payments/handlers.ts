import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { type BundledOrder, notifyPaidTierApplied, notifyStaffPaidDebut } from "@/lib/notifications";
import { PACKAGES } from "@/lib/submissions/packages";
import { createPerkTasks } from "@/lib/perks/service";
import { TIERS, tierForSku } from "@/lib/products/input";
import { applyPaidTier } from "@/lib/products/service";
import { registerFulfillment } from "./fulfillment";

const siteUrl = (path: string) => new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();

/** Paid debut tiers: upgrade the listing named in the order and (re)schedule it. */
registerFulfillment("launch", async (order) => {
  const productId = typeof order.metadata.productId === "string" ? order.metadata.productId : null;
  const weekKey = typeof order.metadata.weekKey === "string" ? order.metadata.weekKey : null;
  const tier = tierForSku(order.sku);
  if (!productId || !tier) throw new Error(`Launch order ${order.id} is missing its product or tier`);

  const before = await db().query.products.findFirst({
    where: eq(schema.products.id, productId),
    columns: { status: true },
  });
  const product = await applyPaidTier(productId, tier, weekKey);
  // Stored before the emails, so a failed send that retries fulfilment doesn't lose them.
  const perks = await createPerkTasks(order, product, tier);
  // Spotlight bundles a Starter submission package, started from this listing. It opens
  // quietly: the two emails below tell the maker and the team about it.
  let bundle: BundledOrder | undefined;
  if (tier === "spotlight") {
    const { openOrderFromPayment } = await import("@/lib/submissions/service");
    const sub = await openOrderFromPayment(order, "starter");
    bundle = {
      label: PACKAGES.starter.label,
      count: PACKAGES.starter.count,
      intakeUrl: siteUrl(`/orders/${sub.intakeToken}`),
      opsUrl: siteUrl(`/admin/submissions/${sub.id}`),
    };
  }
  // One email to the maker, one to the team.
  await notifyPaidTierApplied(product, TIERS[tier].label, bundle);
  await notifyStaffPaidDebut(product, tier, {
    review: before?.status !== "pending" && product.status === "pending",
    tasks: perks,
    bundle,
  });
});

/** Submission packages: open the order and send the buyer their private intake link. */
registerFulfillment("submission", async (order) => {
  const { openOrderFromPayment } = await import("@/lib/submissions/service");
  await openOrderFromPayment(order);
});

/** Featured slots: the held booking named in the order becomes active. */
registerFulfillment("featured", async (order) => {
  const bookingId = typeof order.metadata.bookingId === "string" ? order.metadata.bookingId : null;
  if (!bookingId) throw new Error(`Featured order ${order.id} is missing its booking`);
  const { activateBooking } = await import("@/lib/ads/service");
  await activateBooking(bookingId);
});
