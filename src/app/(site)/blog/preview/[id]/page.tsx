import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleView } from "@/components/blog/article";
import { Container } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { getPreviewPost } from "@/lib/blog/public";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function PreviewPage(props: PageProps<"/blog/preview/[id]">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-lg bg-muted/50" />}>
        <Preview params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Preview({ params }: Pick<PageProps<"/blog/preview/[id]">, "params">) {
  const { id } = await params;
  await requireStaff(`/blog/preview/${id}`);
  const post = await getPreviewPost(id);
  if (!post) notFound();
  return (
    <article>
      <p className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-sm">
        <span>Draft preview: this is the working copy, not what readers see yet.</span>
        <Link href={`/admin/blog/${id}`} className="font-medium text-primary hover:underline">
          Back to the editor
        </Link>
      </p>
      <ArticleView post={post} />
    </article>
  );
}
