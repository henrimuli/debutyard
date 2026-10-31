import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewForm } from "@/components/blog/review-form";
import { Avatar } from "@/components/ui/avatar";
import { Card, Container } from "@/components/ui/primitives";
import { makerReviewByToken } from "@/lib/blog/service";

export const metadata: Metadata = {
  title: "Review your launch post",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The maker's private preview of their launch post draft, from the link in their email. */
export default function ReviewPage(props: PageProps<"/blog/review/[token]">) {
  return (
    <Container className="max-w-3xl py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted/50" />}>
        <Review params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Review({ params }: Pick<PageProps<"/blog/review/[token]">, "params">) {
  const { token } = await params;
  const r = await makerReviewByToken(token);
  if (!r) {
    return (
      <Card className="text-center">
        <h1 className="font-display text-2xl font-bold">This review link has expired</h1>
        <p className="mt-2 text-muted-foreground">
          Links last 48 hours. If something in your launch post needs fixing, reply to the email we sent and we&apos;ll
          sort it.
        </p>
      </Card>
    );
  }
  const expires = r.expiresAt.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return (
    <>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">This is a private draft of your launch post.</p>
        <p className="mt-1 text-muted-foreground">
          Read it through and tell us if anything is wrong. You can approve it or send notes until {expires}. If we
          don&apos;t hear back, we&apos;ll publish it as written.
        </p>
      </div>

      <article className="mt-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{r.title}</h1>
        {r.authors.length > 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex -space-x-2">
              {r.authors.map((a) => (
                <Avatar key={a.userId} name={a.name} src={a.avatarUrl} className="size-7 ring-2 ring-background" />
              ))}
            </span>
            By {r.authors.map((a) => a.name).join(" & ")}
          </p>
        )}
        {r.coverUrl && (
          // Covers live on R2, which next/image would need allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.coverUrl}
            alt={r.coverAlt}
            className="mt-6 aspect-video w-full rounded-lg border border-border object-cover"
          />
        )}
        {/* Rendered on the server from the editor's schema, so only its own tags can appear. */}
        <div className="prose-dy mt-8" dangerouslySetInnerHTML={{ __html: r.html }} />
      </article>

      <Card className="mt-10">
        <h2 className="font-display text-xl font-semibold">Your answer</h2>
        <div className="mt-4">
          <ReviewForm token={token} answered={r.status === "pending" ? null : r.status} />
        </div>
      </Card>
    </>
  );
}
