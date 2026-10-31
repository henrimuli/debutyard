import { NewsletterForm } from "@/components/newsletter-form";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function NewsletterCard({ className }: { className?: string }) {
  return (
    <Card
      className={cn("mt-14 flex flex-col gap-4 p-6 sm:p-8 md:flex-row md:items-center md:justify-between", className)}
    >
      <div className="max-w-md">
        <h2 className="font-display text-xl font-semibold">Get new posts by email</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One email each Monday: the week&apos;s winners, new debuts and whatever we published.
        </p>
      </div>
      <NewsletterForm source="blog" className="w-full md:max-w-sm" />
    </Card>
  );
}
