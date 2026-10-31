import Link from "next/link";
import type { PostSummary } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { Bylines } from "./bylines";
import { postDate } from "./format";

const KIND: Partial<Record<PostSummary["kind"], string>> = {
  launch: "Launch story",
  recap: "Weekly recap",
  roundup: "Roundup",
  comparison: "Comparison",
  alternatives: "Alternatives",
};

/** A post in a grid. `hero` is the wide featured card at the top of the blog. */
export function PostCard({ post, hero = false }: { post: PostSummary; hero?: boolean }) {
  const label = KIND[post.kind] ?? post.category?.name;
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50",
        hero && "md:flex-row",
      )}
    >
      <div className={cn("aspect-video shrink-0 overflow-hidden bg-muted", hero && "md:aspect-auto md:w-3/5")}>
        {post.cover ? (
          // Covers live on R2, which next/image would need allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover.url}
            alt={post.cover.alt}
            loading={hero ? "eager" : "lazy"}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="blog-cover-fallback flex size-full items-center justify-center p-6">
            <span className="line-clamp-3 text-center font-display text-lg font-semibold text-foreground/70">
              {post.title}
            </span>
          </div>
        )}
      </div>
      <div className={cn("flex flex-1 flex-col p-5", hero && "md:justify-center md:p-8")}>
        {label ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p> : null}
        <h3 className={cn("mt-1.5 font-display font-semibold leading-snug", hero ? "text-2xl sm:text-3xl" : "text-lg")}>
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 group-hover:text-primary">
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? (
          <p className={cn("mt-2 text-sm text-muted-foreground", hero ? "line-clamp-4" : "line-clamp-2")}>
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-muted-foreground">
          <Bylines authors={post.authors} />
          <span className="shrink-0">
            {postDate(post.publishedAt)} · {post.readingMinutes} min
          </span>
        </div>
      </div>
    </article>
  );
}
