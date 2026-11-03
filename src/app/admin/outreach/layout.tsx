import type { Metadata } from "next";
import { Suspense } from "react";
import { OutreachTabs } from "@/components/outreach/controls";
import { Heading } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Outreach · Admin", robots: { index: false } };

export default function OutreachLayout({ children }: LayoutProps<"/admin/outreach">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Heading className="text-2xl sm:text-3xl">Outreach</Heading>
      <Suspense fallback={<div className="mt-4 h-10" />}>
        <OutreachTabs />
      </Suspense>
      <div className="mt-6">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
