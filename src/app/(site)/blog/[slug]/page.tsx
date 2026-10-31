import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ArticleView } from "@/components/blog/article";
import { Container } from "@/components/ui/primitives";
import { findRedirectSlug, getPublishedPost, getRelatedPosts } from "@/lib/blog/public";
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, jsonLdString, postMetadata, postPath } from "@/lib/blog/seo-meta";

export async function generateMetadata(props: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPublishedPost(slug).catch(() => null);
  if (!post) return { title: "Blog", robots: { index: false } };
  return postMetadata(post);
}

export default function BlogPost(props: PageProps<"/blog/[slug]">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-lg bg-muted/50" />}>
        <Post params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Post({ params }: Pick<PageProps<"/blog/[slug]">, "params">) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) {
    const moved = await findRedirectSlug(slug);
    if (moved) permanentRedirect(postPath(moved));
    notFound();
  }
  const related = await getRelatedPosts(post);
  const crumbs = [
    { name: "Blog", path: "/blog" },
    ...(post.category ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }] : []),
    { name: post.title, path: postPath(post.slug) },
  ];
  const faq = faqJsonLd(post.faq);
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd(post)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs)) }} />
      {faq ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faq) }} /> : null}
      <ArticleView post={post} related={related} />
    </article>
  );
}
