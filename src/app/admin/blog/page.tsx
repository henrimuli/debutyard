import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LaunchPostControls } from "@/components/admin/perk-controls";
import { NewPostButton } from "@/components/blog-admin/new-post-button";
import { ScoreChip, StatusBadge } from "@/components/blog-admin/ui";
import { ProductLogo } from "@/components/board/product-logo";
import { Badge, Card, Heading } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { listStaffPosts } from "@/lib/blog/service";
import type { PostKind } from "@/lib/blog/types";
import { openLaunchPosts } from "@/lib/perks/service";
import { TIERS } from "@/lib/products/input";
import { weekBounds, weekKeyFor } from "@/lib/weeks";

export const metadata: Metadata = { title: "Blog · Admin", robots: { index: false } };

const KIND: Record<PostKind, string> = {
  post: "Article",
  recap: "Recap",
  launch: "Launch",
  roundup: "Roundup",
  comparison: "Comparison",
  alternatives: "Alternatives",
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";

export default function BlogAdminPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Heading className="text-2xl sm:text-3xl">Blog</Heading>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A recap is drafted automatically after each week closes. Open any post and use the Writer panel to find
            keyword ideas, plan roundups and comparisons from the live board, and draft them.
          </p>
        </div>
        <NewPostButton />
      </div>
      <Suspense fallback={<p className="mt-8 text-muted-foreground">Loading…</p>}>
        <Suggested />
        <List />
      </Suspense>
    </div>
  );
}

/** Launch posts that Premium and Spotlight debuts paid for, soonest due first. */
async function Suggested() {
  await requireStaff();
  const tasks = await openLaunchPosts();
  if (tasks.length === 0) return null;
  const endOfWeek = weekBounds(weekKeyFor(new Date())).endsAt;
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl font-semibold">Launch posts to write</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Paid debuts include a launch post, co-authored with the maker. “Draft with AI” reads their listing and site,
        researches the problem it solves, and writes it. Publishing emails the maker and marks it done.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tasks.map((t) => {
          const dueSoon = t.task.status === "suggested" && t.task.dueAt !== null && t.task.dueAt < endOfWeek;
          return (
            <Card key={t.task.id} className="flex flex-col gap-3 p-4">
              <div className="flex gap-3">
                <ProductLogo name={t.name} src={t.logoUrl} className="size-10" />
                <div className="min-w-0">
                  <a href={`/p/${t.slug}`} className="font-medium hover:text-primary">
                    {t.name}
                  </a>
                  <p className="truncate text-sm text-muted-foreground">{t.tagline}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="primary">{TIERS[t.tier].label}</Badge>
                {t.task.status === "drafting" && <Badge tone="success">Drafting</Badge>}
                {t.task.dueAt && (
                  <Badge className={dueSoon ? "bg-danger/10 text-danger" : undefined}>
                    {dueSoon ? "Due this week: " : "Due "}
                    {day(t.task.dueAt.toISOString())}
                  </Badge>
                )}
              </div>
              <LaunchPostControls taskId={t.task.id} postId={t.task.postId} />
            </Card>
          );
        })}
      </div>
    </section>
  );
}

async function List() {
  await requireStaff();
  const posts = await listStaffPosts();
  if (posts.length === 0) return <p className="mt-8 text-muted-foreground">No posts yet.</p>;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">All posts</h2>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <div className="min-w-0 flex-1 basis-60">
              <Link href={`/admin/blog/${p.id}`} className="block truncate font-medium hover:text-primary">
                {p.title || "Untitled"}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {[KIND[p.kind], p.categoryName, p.authorName, `${p.wordCount.toLocaleString()} words`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {p.featured && <Badge tone="accent">Featured</Badge>}
            {p.hasUnpublishedChanges && <Badge>Unpublished changes</Badge>}
            <StatusBadge status={p.displayStatus} />
            <ScoreChip score={p.seoScore} />
            <span className="w-24 text-right text-xs text-muted-foreground">
              {p.displayStatus === "draft" ? `edited ${day(p.updatedAt)}` : day(p.publishedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
