import type { Metadata } from "next";
import { siteUrl as getSiteUrl } from "@/lib/blog/site-url";
import type { BlogAuthor, BlogCategory, PostSummary, PublicPost } from "@/lib/blog/types";

export const BLOG_TITLE = "The DebutYard Blog";
export const BLOG_DESCRIPTION =
  "Launch stories from the board, roundups and comparisons of new tools, and practical guides on launching, SEO and building with AI.";

export function absUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${getSiteUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export const postPath = (slug: string) => `/blog/${slug}`;
export const categoryPath = (slug: string) => `/blog/category/${slug}`;

/** The image search and social previews show: explicit OG image, else the cover, else the site default. */
export function socialImage(post: Pick<PublicPost, "ogImageUrl" | "cover">): string | null {
  if (post.ogImageUrl) return absUrl(post.ogImageUrl);
  if (post.cover?.url && !post.cover.url.endsWith(".svg")) return absUrl(post.cover.url);
  return null;
}

export function postMetadata(post: PublicPost): Metadata {
  const title = post.seoTitle.trim() || post.title;
  const description = post.seoDescription.trim() || post.excerpt;
  const canonical = post.canonicalUrl?.trim() || absUrl(postPath(post.slug));
  const image = socialImage(post);
  const names = post.authors.map((a) => a.name);

  return {
    title: { absolute: `${title} | DebutYard` },
    description,
    alternates: { canonical },
    robots: post.noindex ? { index: false, follow: true } : undefined,
    authors: names.map((name) => ({ name })),
    keywords: [post.focusKeyword, ...post.secondaryKeywords, ...post.tags].filter(Boolean),
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "DebutYard",
      title,
      description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: names,
      section: post.category?.name,
      tags: post.tags,
      images: image ? [{ url: image, alt: post.cover?.alt || post.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

type JsonLd = Record<string, unknown>;

const publisher = (): JsonLd => ({
  "@type": "Organization",
  name: "DebutYard",
  url: getSiteUrl(),
  logo: { "@type": "ImageObject", url: absUrl("/icons/icon-512.png") },
});

const person = (a: BlogAuthor): JsonLd =>
  a.name === "DebutYard team"
    ? { "@type": "Organization", name: "DebutYard", url: getSiteUrl() }
    : {
        "@type": "Person",
        name: a.name,
        ...(a.url ? { url: absUrl(a.url) } : {}),
        ...(a.role ? { jobTitle: a.role } : {}),
      };

export function articleJsonLd(post: PublicPost): JsonLd {
  const url = absUrl(postPath(post.slug));
  const image = socialImage(post);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: post.title.slice(0, 110),
    description: post.seoDescription || post.excerpt,
    ...(image ? { image: [image] } : {}),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    wordCount: post.wordCount,
    articleSection: post.category?.name,
    keywords: [post.focusKeyword, ...post.tags].filter(Boolean).join(", "),
    author: post.authors.map(person),
    publisher: publisher(),
    ...(post.product
      ? {
          about: {
            "@type": "SoftwareApplication",
            name: post.product.name,
            description: post.product.tagline,
            url: post.product.websiteUrl,
          },
        }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  };
}

export function faqJsonLd(faq: PublicPost["faq"]): JsonLd | null {
  const items = faq.filter((f) => f.q.trim() && f.a.trim());
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function blogIndexJsonLd(posts: PostSummary[], category?: BlogCategory): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: category ? `${category.name} · ${BLOG_TITLE}` : BLOG_TITLE,
    description: category?.description || BLOG_DESCRIPTION,
    url: absUrl(category ? categoryPath(category.slug) : "/blog"),
    publisher: publisher(),
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: absUrl(postPath(p.slug)),
      datePublished: p.publishedAt,
      author: p.authors.map(person),
    })),
  };
}

/** Serializes JSON-LD for a <script>; `<` is escaped so content can never close the tag. */
export function jsonLdString(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
