import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { PostSummary, PublicPost } from "@/lib/blog/types";
import { ArticleFaq } from "./article-faq";
import { AuthorBox, Bylines } from "./bylines";
import { postDate, wasUpdated } from "./format";
import { NewsletterCard } from "./newsletter-card";
import { PostGrid } from "./post-grid";
import { TableOfContents } from "./toc";

/** The same UTM tags the renderer adds to a launch post's in-text product links. */
function sponsoredHref(websiteUrl: string): string {
  try {
    const u = new URL(websiteUrl);
    u.searchParams.set("utm_source", "debutyard");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_content", "launch_post");
    return u.toString();
  } catch {
    return websiteUrl;
  }
}

/** A full post: shared by the live page and the staff preview so both render identically. */
export function ArticleView({ post, related = [] }: { post: PublicPost; related?: PostSummary[] }) {
  const launch = post.kind === "launch" && post.product;
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/blog" className="hover:text-foreground">
            Blog
          </Link>
          {post.category ? (
            <>
              <span aria-hidden>/</span>
              <Link href={`/blog/category/${post.category.slug}`} className="hover:text-foreground">
                {post.category.name}
              </Link>
            </>
          ) : null}
        </nav>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
        {post.excerpt ? <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p> : null}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Bylines authors={post.authors} size="md" className="font-medium text-foreground" />
          <span>
            <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>
            {wasUpdated(post.publishedAt, post.updatedAt) ? (
              <>
                {" "}
                · Updated <time dateTime={post.updatedAt}>{postDate(post.updatedAt)}</time>
              </>
            ) : null}{" "}
            · {post.readingMinutes} min read
          </span>
        </div>
      </div>

      {post.cover ? (
        <figure className="mx-auto mt-8 max-w-4xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover.url}
            alt={post.cover.alt}
            width={post.cover.width ?? undefined}
            height={post.cover.height ?? undefined}
            fetchPriority="high"
            className="w-full rounded-lg border border-border"
          />
        </figure>
      ) : null}

      <div className="mx-auto mt-10 grid max-w-6xl gap-10 xl:grid-cols-[14rem_minmax(0,48rem)_14rem] xl:justify-center">
        <aside className="hidden xl:block">{post.toc.length > 2 ? <TableOfContents items={post.toc} /> : null}</aside>
        <div className="min-w-0">
          {post.toc.length > 2 ? (
            <div className="mb-8 xl:hidden">
              <TableOfContents items={post.toc} />
            </div>
          ) : null}
          <div className="prose-dy blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
          {launch ? <ProductCard product={post.product!} /> : null}
          <ArticleFaq items={post.faq} />
          {post.tags.length ? (
            <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((t) => (
                <li key={t} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          <AuthorBox authors={post.authors} />
        </div>
        <div className="hidden xl:block" />
      </div>

      {related.length ? (
        <section className="mx-auto mt-16 max-w-6xl" aria-labelledby="related-heading">
          <h2 id="related-heading" className="font-display text-2xl font-bold tracking-tight">
            Keep reading
          </h2>
          <div className="mt-6">
            <PostGrid posts={related} />
          </div>
        </section>
      ) : null}
      <div className="mx-auto max-w-6xl">
        <NewsletterCard />
      </div>
    </>
  );
}

function ProductCard({ product }: { product: NonNullable<PublicPost["product"]> }) {
  return (
    <aside className="mt-12 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center">
      <Avatar name={product.name} src={product.logoUrl} className="size-14 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">{product.name}</p>
        <p className="text-sm text-muted-foreground">{product.tagline}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          href={`/p/${product.slug}`}
          className="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:border-primary/50"
        >
          See the debut
        </Link>
        <a
          href={sponsoredHref(product.websiteUrl)}
          rel="sponsored noopener"
          target="_blank"
          className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Visit site
        </a>
      </div>
    </aside>
  );
}
