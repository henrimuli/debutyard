import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewsletterTokenForm } from "@/components/newsletter-token-form";
import { Card, Container, Heading } from "@/components/ui/primitives";
import { confirmAction } from "../actions";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/newsletter/confirm">) {
  return (
    <Container className="max-w-lg py-16">
      <Card className="space-y-4 p-8">
        <Heading className="text-2xl">Confirm your subscription</Heading>
        <p className="text-muted-foreground">One email a week: last week&apos;s winners and this week&apos;s debuts.</p>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </Card>
    </Container>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/newsletter/confirm">, "searchParams">) {
  const { token, kit } = await searchParams;
  if (typeof token !== "string" || !token) return <p className="text-danger">This link is missing its token.</p>;
  // Kit emails sent before one-click confirm pointed here; send them through the new link.
  if (kit === "1") redirect(`/newsletter/confirm/kit?token=${encodeURIComponent(token)}` as Route);
  return (
    <NewsletterTokenForm
      token={token}
      action={confirmAction}
      label="Yes, send me the weekly digest"
      done="You're in. The digest lands every Monday."
      failed="That link has expired or was already used. Subscribe again from the footer."
    />
  );
}
