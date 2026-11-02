import type { Metadata } from "next";
import { Suspense } from "react";
import { DirectoryTable } from "@/components/directories/directory-table";
import { ButtonLink } from "@/components/ui/button";
import { Heading } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { allDirectoriesForAdmin, effectiveLinkType } from "@/lib/directories/service";

export const metadata: Metadata = { title: "Directories · Admin", robots: { index: false } };

export default function DirectoriesAdminPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <Heading className="text-2xl sm:text-3xl">Directories</Heading>
        <ButtonLink href="/admin/directories/new">Add directory</ButtonLink>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted-foreground">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await requireStaff();
  const rows = await allDirectoriesForAdmin();
  return (
    <DirectoryTable
      rows={rows.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        url: d.url,
        dr: d.dr,
        niche: d.niche,
        linkType: effectiveLinkType(d),
        badgeRequired: d.badgeRequired,
        guided: d.guided,
        hasInstructions: Boolean(d.instructions),
        isActive: d.isActive,
        auditFailures: d.auditFailures,
        auditError: d.auditError,
        acceptanceRate: d.acceptanceRate,
        liveCount: d.liveCount,
      }))}
    />
  );
}
