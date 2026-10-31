import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryNav, Pager, PostGrid, pageParam } from "@/components/blog/post-grid";
import { Container } from "@/components/ui/primitives";
import { getCategory, listCategoriesWithPosts, listPublishedPosts } from "@/lib/blog/public";
import { BLOG_TITLE, blogIndexJsonLd, categoryPath, jsonLdString } from "@/lib/blog/seo-meta";

export async function generateMetadata(props: PageProps<"/blog/category/[slug]">): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const category = await getCategory(slug).catch(() => null);
  if (!category) return { title: "Blog", robots: { index: false } };
  const page = pageParam(sp.page);
  const path = categoryPath(category.slug);
  return {
    title: { absolute: `${category.name}${page > 1 ? `, page ${page}` : ""} | ${BLOG_TITLE}` },
    description: category.description || `${category.name} posts on ${BLOG_TITLE}.`,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
  };
}

export default function CategoryPage(props: PageProps<"/blog/category/[slug]">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Category params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}

async function Category({ params, searchParams }: Pick<PageProps<"/blog/category/[slug]">, "params" | "searchParams">) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = pageParam(sp.page);
  const [category, categories, list] = await Promise.all([
    getCategory(slug),
    listCategoriesWithPosts(),
    listPublishedPosts({ categorySlug: slug, page }),
  ]);
  if (!category || list.total === 0) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(blogIndexJsonLd(list.posts, category)) }}
      />
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Blog</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{category.name}</h1>
        {category.description ? <p className="mt-3 text-muted-foreground">{category.description}</p> : null}
      </header>
      <div className="mt-8">
        <CategoryNav categories={categories} active={category.slug} />
      </div>
      <div className="mt-8">
        <PostGrid posts={list.posts} />
      </div>
      <Pager page={list.page} pageCount={list.pageCount} basePath={categoryPath(category.slug)} />
    </>
  );
}
