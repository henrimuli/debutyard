import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { NewsletterCard } from "@/components/blog/newsletter-card";
import { PostCard } from "@/components/blog/post-card";
import { CategoryNav, Pager, PostGrid, pageParam } from "@/components/blog/post-grid";
import { Container } from "@/components/ui/primitives";
import { listCategoriesWithPosts, listFeaturedPosts, listPublishedPosts } from "@/lib/blog/public";
import { BLOG_DESCRIPTION, BLOG_TITLE, blogIndexJsonLd, jsonLdString } from "@/lib/blog/seo-meta";

export async function generateMetadata(props: PageProps<"/blog">): Promise<Metadata> {
  const page = pageParam((await props.searchParams).page);
  return {
    title: { absolute: page > 1 ? `${BLOG_TITLE}, page ${page}` : BLOG_TITLE },
    description: BLOG_DESCRIPTION,
    alternates: {
      canonical: page > 1 ? `/blog?page=${page}` : "/blog",
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
    openGraph: { type: "website", title: BLOG_TITLE, description: BLOG_DESCRIPTION, url: "/blog" },
  };
}

export default function BlogIndex(props: PageProps<"/blog">) {
  return (
    <Container className="py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Blog</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{BLOG_TITLE}</h1>
        <p className="mt-3 text-muted-foreground">
          {BLOG_DESCRIPTION}{" "}
          <a href="/blog/rss.xml" className="text-primary hover:underline">
            RSS
          </a>
        </p>
      </header>
      <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Posts searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

async function Posts({ searchParams }: Pick<PageProps<"/blog">, "searchParams">) {
  await connection();
  const page = pageParam((await searchParams).page);
  // The hero only shows on page 1, so it is only left out of the grid there.
  const [featured, categories] = await Promise.all([page === 1 ? listFeaturedPosts(1) : [], listCategoriesWithPosts()]);
  const hero = featured[0];
  const list = await listPublishedPosts({ page, excludeIds: hero ? [hero.id] : [] });

  if (!hero && list.posts.length === 0)
    return <p className="mt-10 text-muted-foreground">The first post lands after week one closes.</p>;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(blogIndexJsonLd(list.posts)) }}
      />
      <div className="mt-8">
        <CategoryNav categories={categories} />
      </div>
      {hero ? (
        <div className="mt-8">
          <PostCard post={hero} hero />
        </div>
      ) : null}
      <div className="mt-8">
        <PostGrid posts={list.posts} />
      </div>
      <Pager page={list.page} pageCount={list.pageCount} basePath="/blog" />
      <NewsletterCard />
    </>
  );
}
