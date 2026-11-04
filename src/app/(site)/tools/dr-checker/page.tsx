import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrChecker } from "@/components/tools/free-tools";
import { Card, Container, Heading } from "@/components/ui/primitives";
import { drEnabled } from "@/lib/metrics/service";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Domain Rating checker",
  description: "Free Domain Rating checker: see any site's Domain Rating from 0 to 100.",
  alternates: { canonical: "/tools/dr-checker" },
};

export default function DrCheckerPage() {
  // Without a score provider configured, the tool doesn't exist.
  if (!drEnabled()) notFound();
  return (
    <Container className="max-w-3xl py-12">
      <Heading>What&apos;s my Domain Rating?</Heading>
      <p className="mt-3 text-muted-foreground">
        Enter a domain to see its Domain Rating from 0 to 100. Higher means more, and stronger, sites link to it. Free,
        no account needed.
      </p>
      <div className="mt-8">
        <DrChecker turnstileSiteKey={turnstileSiteKey()} />
      </div>
      <Card className="mt-12 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Using an AI agent?</p>
        <p className="mt-1">
          The same check is <code>check_dr</code> on our MCP server and <code>POST /api/v1/tools/dr</code>, with an API
          token from your dashboard.
        </p>
      </Card>
    </Container>
  );
}
