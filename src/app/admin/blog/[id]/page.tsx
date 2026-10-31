import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { BlogEditor } from "@/components/blog-admin/blog-editor";
import { requireStaff } from "@/lib/auth";
import { getStaffPost, listCategories } from "@/lib/blog/service";
import { siteUrl } from "@/lib/blog/site-url";

export const metadata: Metadata = { title: "Edit post · Admin", robots: { index: false } };

export default function EditPostPage(props: PageProps<"/admin/blog/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Editor params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Editor({ params, searchParams }: Pick<PageProps<"/admin/blog/[id]">, "params" | "searchParams">) {
  await requireStaff();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [post, categories, query] = await Promise.all([getStaffPost(id), listCategories(), searchParams]);
  if (!post) notFound();
  return (
    <BlogEditor
      key={post.id}
      initial={post}
      categories={categories}
      siteHost={new URL(siteUrl()).hostname}
      autoDraft={query.draft === "1"}
    />
  );
}
