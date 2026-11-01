import { and, eq } from "drizzle-orm";
import { BookingForm } from "@/components/ads/booking-form";
import { DebutLink } from "@/components/debut/debut-link";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/primitives";
import { db, schema } from "@/db";
import { availability, extraWeeksFor } from "@/lib/ads/service";
import { getCurrentUser } from "@/lib/auth";
import { categoriesWithCounts } from "@/lib/board/queries";
import { enabledProviders } from "@/lib/payments";

/**
 * The "pick a slot" calendar and checkout. On /advertise for visitors, and in
 * the dashboard's booking modal (`area` "dashboard"), where every link and the
 * checkout return stay inside the dashboard.
 */
export async function BookingSection({ area = "site" }: { area?: "site" | "dashboard" }) {
  const user = await getCurrentUser();
  const inDashboard = area === "dashboard";
  if (!user) {
    return (
      <Card className={cn("text-center", !inDashboard && "mt-6")}>
        <p className="font-medium">Sign in to see the calendar and book.</p>
        <ButtonLink
          href={`/sign-in?next=${encodeURIComponent(inDashboard ? "/dashboard/sponsorships#book" : "/advertise#book")}`}
          className="mt-4"
        >
          Sign in
        </ButtonLink>
      </Card>
    );
  }
  const [products, categories, initialWeeks] = await Promise.all([
    db()
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(and(eq(schema.products.createdBy, user.id), eq(schema.products.status, "approved")))
      .orderBy(schema.products.name),
    categoriesWithCounts(),
    extraWeeksFor(user.id).then((extra) => availability("leaderboard", null, new Date(), extra)),
  ]);
  if (products.length === 0) {
    return (
      <Card className={cn("text-center", !inDashboard && "mt-6")}>
        <p className="font-medium">Sponsors promote an approved DebutYard listing.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit your product first; you can book as soon as it&apos;s approved.
        </p>
        {inDashboard ? (
          <ButtonLink href="/dashboard/products/new" className="mt-4">
            Submit your product
          </ButtonLink>
        ) : (
          <DebutLink className="mt-4">Submit your product</DebutLink>
        )}
      </Card>
    );
  }
  const form = (
    <BookingForm
      products={products}
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      providers={enabledProviders()}
      initialWeeks={initialWeeks}
      returnTo={inDashboard ? "dashboard" : undefined}
    />
  );
  // The modal is its own panel.
  return inDashboard ? form : <Card className="mt-6 p-6">{form}</Card>;
}
