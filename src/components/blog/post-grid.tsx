import Link from "next/link";
import type { CategoryWithCount } from "@/lib/blog/public";
import type { PostSummary } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { PostCard } from "./post-card";

export function PostGrid({ posts }: { posts: PostSummary[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

/** "All" plus every category that has a live post. */
export function CategoryNav({ categories, active }: { categories: CategoryWithCount[]; active?: string }) {
  if (categories.length === 0) return null;
  const pill = (on: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border hover:border-primary/50 hover:text-primary",
    );
  return (
    <nav
      aria-label="Blog categories"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      <Link href="/blog" className={pill(!active)}>
        All
      </Link>
      {categories.map((c) => (
        <Link key={c.id} href={`/blog/category/${c.slug}`} className={pill(active === c.slug)}>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, pageCount, basePath }: { page: number; pageCount: number; basePath: string }) {
  if (pageCount <= 1) return null;
  const href = (n: number) => (n === 1 ? basePath : `${basePath}?page=${n}`);
  const btn = "rounded-md border border-border px-3.5 py-1.5 text-sm hover:border-primary/50 hover:text-primary";
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={btn}>
          ← Newer
        </Link>
      ) : null}
      <span className="text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next" className={btn}>
          Older →
        </Link>
      ) : null}
    </nav>
  );
}

/** `?page=` as a positive integer, or 1. */
export function pageParam(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}
