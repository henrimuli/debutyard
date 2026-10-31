import "server-only";
import { effectiveLinkType, listDirectories } from "@/lib/directories/service";
import type { AtlasDirectory } from "@/lib/kit-atlas";

/** Every active directory, in the shape the Atlas page and CSV use. */
export async function atlasDirectories(): Promise<AtlasDirectory[]> {
  const rows = await listDirectories();
  return rows.map((d) => ({
    slug: d.slug,
    name: d.name,
    url: d.url,
    submitUrl: d.submitUrl,
    description: d.description,
    niche: d.niche,
    pricing: d.pricing,
    dr: d.dr,
    linkType: effectiveLinkType(d),
    badgeRequired: d.badgeRequired,
    needsAccount: d.needsAccount,
    guided: d.guided,
    queueEstimateDays: d.queueEstimateDays,
    submissionNotes: d.submissionNotes,
  }));
}
