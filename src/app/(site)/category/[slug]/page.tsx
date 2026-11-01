import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SponsorBanner } from "@/components/ads/sponsored";
import { SimpleList } from "@/components/board/simple-list";
import { BoardSkeleton } from "@/components/board/week-board";
import { Container, Heading } from "@/components/ui/primitives";
import { liveAds } from "@/lib/ads/service";
import { categoryProducts, getCategory } from "@/lib/board/queries";

export async function generateMetadata(props: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await getCategory(slug).catch(() => null);
  if (!c) return {};
  return {
    title: `Best new ${c.name} products`,
    description: `${c.name} products that debuted on DebutYard, ranked by community applause.`,
    alternates: { canonical: `/category/${c.slug}` },
  };
}

export default function CategoryPage(props: PageProps<"/category/[slug]">) {
  return (
    <Container className="max-w-4xl py-12">
      <Suspense fallback={<BoardSkeleton />}>
        <Category params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Category({ params }: { params: PageProps<"/category/[slug]">["params"] }) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  const [items, [sponsor]] = await Promise.all([categoryProducts(slug), liveAds("category", { categorySlug: slug })]);
  return (
    <>
      <Heading>{category.name}</Heading>
      {category.description && <p className="mt-2 text-muted-foreground">{category.description}</p>}
      <div className="mt-8">
        {sponsor && <SponsorBanner ad={sponsor} label={`${category.name} sponsor`} />}
        {items.length ? (
          <SimpleList items={items} />
        ) : (
          <p className="text-muted-foreground">No {category.name} products have debuted yet.</p>
        )}
      </div>
    </>
  );
}
