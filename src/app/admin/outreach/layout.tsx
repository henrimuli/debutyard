import type { Metadata } from "next";
import { Suspense } from "react";
import { OutreachTabs } from "@/components/outreach/controls";
import { SearchDownBanner } from "@/components/outreach/search-down-banner";
import { Heading } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { searchDown } from "@/lib/outreach/queries";

export const metadata: Metadata = { title: "Outreach · Admin", robots: { index: false } };

async function SearchDownNotice() {
  await requireStaff("/admin/outreach");
  const streak = await searchDown();
  return streak && <SearchDownBanner streak={streak} />;
}

export default function OutreachLayout({ children }: LayoutProps<"/admin/outreach">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Heading className="text-2xl sm:text-3xl">Outreach</Heading>
      <Suspense>
        <SearchDownNotice />
      </Suspense>
      <Suspense fallback={<div className="mt-4 h-10" />}>
        <OutreachTabs />
      </Suspense>
      <div className="mt-6">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
