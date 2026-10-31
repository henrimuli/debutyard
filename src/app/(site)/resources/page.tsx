import type { Metadata } from "next";
import Link from "next/link";
import { KitSignupForm } from "@/components/kit/kit-signup-form";
import { freeTools } from "@/components/tools/tool-list";
import { Card, Container } from "@/components/ui/primitives";
import { KIT_COUPON_PERCENT, KIT_ITEMS, KIT_NAME } from "@/lib/kit";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Free launch resources",
  description: `The DebutYard ${KIT_NAME}: a directory atlas, an agentic dev starter pack, a ship checklist, an AI search playbook and a 30-day launch plan. Free.`,
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <Container className="py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Resources</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">The {KIT_NAME}</h1>
        <p className="mt-3 text-muted-foreground">
          Five practical guides for getting a product from &ldquo;it works&rdquo; to &ldquo;people use it&rdquo;. Free
          with the weekly digest, plus {KIT_COUPON_PERCENT}% off your first paid debut.
        </p>
      </header>

      <Card className="mt-8 p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="space-y-4">
            {KIT_ITEMS.map((item, i) => (
              <li key={item.slug} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-sm text-muted-foreground">{item.blurb}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="md:border-l md:border-border md:pl-6">
            <h2 className="font-display text-xl font-semibold">Get the kit</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Confirm your email and the kit opens. You&apos;ll also get the weekly digest, one email each Monday.
            </p>
            <KitSignupForm source="resources" turnstileSiteKey={turnstileSiteKey()} />
          </div>
        </div>
      </Card>

      <section className="mt-14" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="font-display text-2xl font-bold tracking-tight">
          Free tools
        </h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {freeTools().map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex h-full gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <span className="text-primary">{t.icon}</span>
                <span>
                  <span className="block font-semibold">{t.label}</span>
                  <span className="text-sm text-muted-foreground">{t.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
