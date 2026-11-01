import { and, eq } from "drizzle-orm";
import { BuyButton } from "@/components/buy-button";
import { Card } from "@/components/ui/primitives";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/payments";
import { formatUsd, getSku } from "@/lib/payments/skus";
import { PACKAGES } from "@/lib/submissions/packages";
import { cn } from "@/lib/utils";

/*
 * The submission service's how-it-works and packages. Shared by the
 * public page (/submission-service) and the dashboard (/dashboard/orders/new).
 */

const STEPS = [
  ["Pay, no account needed", "Checkout takes a minute. You get a private link by email."],
  [
    "Tell us about your product",
    "Logo, three description lengths, categories and whether badges are OK. About five minutes.",
  ],
  ["We submit by hand", "Starts within 48 hours. Rejected directories are replaced, so the count holds."],
  ["We verify every link", "Each live listing is fetched and checked: does it load, link to you, and is it dofollow."],
];

export function ServiceSteps() {
  return (
    <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map(([t, d], i) => (
        <li key={t}>
          <Card className="h-full p-5">
            <p className="font-display text-2xl font-bold text-primary">{i + 1}</p>
            <p className="mt-1 font-medium">{t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

const NEXT_STEPS = [
  ["Pay", "The order goes on your account right away."],
  ["Confirm your details", "One form, about five minutes. Logo, descriptions, categories and whether badges are OK."],
  ["We submit by hand", "Starts within 48 hours. Rejected directories are replaced, so the count holds."],
  ["Follow every link", "Each live listing is checked and shows up in your submission orders."],
];

/** What happens after buying from the dashboard, where there's no account or email link to explain. */
export function NextSteps() {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold">What happens next</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NEXT_STEPS.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What a package includes, from its config. */
function packagePerks(id: keyof typeof PACKAGES) {
  const p = PACKAGES[id];
  return [
    `${p.count}${id === "scale" ? "+" : ""} niche-matched directories`,
    `Done in ${p.days} days`,
    "Every link verified, with live tracking",
    ...(id === "scale" ? ["Copy tailored to each directory"] : []),
    `${p.monitorMonths} months of Link Monitor`,
  ];
}

/**
 * The three packages with their buy buttons. `product` (a listing id from the
 * query string) starts the order from one of the buyer's listings; `returnTo`
 * "dashboard" brings the buyer back into the dashboard after checkout.
 */
export async function PackageCards({
  product,
  returnTo,
  showBoostNote = true,
  className,
}: {
  product?: string;
  returnTo?: "dashboard";
  /** Off where a picker already says which listing this is for. */
  showBoostNote?: boolean;
  className?: string;
}) {
  const user = await getCurrentUser().catch(() => null);
  const boost =
    user && typeof product === "string" && /^[0-9a-f-]{36}$/.test(product)
      ? await db().query.products.findFirst({
          where: and(eq(schema.products.id, product), eq(schema.products.createdBy, user.id)),
          columns: { id: true, name: true },
        })
      : null;
  const providers = enabledProviders();
  return (
    <section id="packages" className={cn("mt-12 scroll-mt-24", className)}>
      {boost && showBoostNote && (
        <p className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-primary">
          Boosting <strong>{boost.name}</strong>: we&apos;ll start your order with its details filled in.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.entries(PACKAGES) as Array<[keyof typeof PACKAGES, (typeof PACKAGES)[keyof typeof PACKAGES]]>).map(
          ([id, p]) => {
            const sku = getSku(p.sku)!;
            return (
              <Card key={id} className={`flex flex-col p-6 ${id === "growth" ? "border-primary" : ""}`}>
                <p className="font-medium">
                  {p.label} {id === "growth" && <span className="text-xs text-primary">· most popular</span>}
                </p>
                <p className="mt-1 font-display text-4xl font-bold">{formatUsd(sku.amountCents)}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {packagePerks(id).map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path d="m3.5 8.5 3 3 6-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {perk}
                    </li>
                  ))}
                </ul>
                <BuyButton
                  sku={sku.id}
                  recurring={false}
                  providers={providers}
                  productId={boost?.id}
                  returnTo={returnTo}
                  accountEmail={user?.email}
                  className="mt-6"
                />
              </Card>
            );
          },
        )}
      </div>
    </section>
  );
}
