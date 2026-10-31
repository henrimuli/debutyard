import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsletterTokenForm } from "@/components/newsletter-token-form";
import { Card, Container, Heading } from "@/components/ui/primitives";
import { KIT_NAME, KIT_PATH } from "@/lib/kit";
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
  if (kit === "1")
    return (
      <NewsletterTokenForm
        token={token}
        action={confirmAction}
        label={`Confirm and open the ${KIT_NAME}`}
        done="You're in. Your kit is ready, and the digest lands every Monday."
        failed="That link has expired or was already used. Ask for the kit again from any page."
        next={{ href: KIT_PATH, label: `Open the ${KIT_NAME} →` }}
      />
    );
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
