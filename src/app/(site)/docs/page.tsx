import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { Card, Container, Heading } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { TOOLS } from "@/lib/api/mcp";
import { drEnabled } from "@/lib/metrics/service";

export const metadata: Metadata = {
  title: "API & MCP",
  description:
    "Connect an AI agent to DebutYard over MCP, or use the REST API: search debuts, check launch readiness, and draft listings.",
  alternates: { canonical: "/docs" },
};

function Code({ children }: { children: string }) {
  return <CodeBlock code={children} className="mt-3" />;
}

export default function DocsPage() {
  const base = site.url.replace(/\/$/, "");
  return (
    <Container className="max-w-3xl py-12">
      <Heading>API &amp; MCP</Heading>
      <p className="mt-3 text-muted-foreground">
        Launch from your agent. Search what&apos;s debuting, audit a site before launch, and draft a listing without
        leaving your editor. Agents can only create <strong>drafts</strong>: you review, pick a plan and submit in the
        browser, and every listing is reviewed before it goes live.
      </p>

      <h2 className="mt-12 font-display text-2xl font-bold">1. Create a token</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Reading and readiness checks work without one. Drafting and your stats need a token: connect over OAuth (below), or create one from{" "}
        <Link href="/dashboard/api" className="text-primary hover:underline">
          Dashboard → API &amp; agents
        </Link>
        .
      </p>

      <h2 className="mt-12 font-display text-2xl font-bold">2. Connect over MCP</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Easiest: add <code className="break-all">{base}/mcp</code> as a custom connector (Claude, ChatGPT, Cursor and other clients that
        support OAuth). Your browser opens, you approve the app, and it gets its own token: no copying needed. Remove it
        any time from the tokens page.
      </p>
      <Code>{`claude mcp add --transport http debutyard ${base}/mcp`}</Code>
      <p className="mt-6 text-sm text-muted-foreground">
        Or paste a token. Streamable HTTP at <code className="break-all">{base}/api/mcp</code> (works without a token for the public tools).
      </p>
      <p className="mt-4 text-sm font-medium">Claude Code</p>
      <Code>{`claude mcp add --transport http debutyard ${base}/api/mcp \\
  --header "Authorization: Bearer dy_your_token"`}</Code>
      <p className="mt-4 text-sm font-medium">Any client with a JSON config (Cursor, Windsurf, Claude Desktop via mcp-remote)</p>
      <Code>{`{
  "mcpServers": {
    "debutyard": {
      "url": "${base}/api/mcp",
      "headers": { "Authorization": "Bearer dy_your_token" }
    }
  }
}`}</Code>
      <p className="mt-4 text-sm text-muted-foreground">Then ask: &ldquo;Check if my site is ready to launch on DebutYard and draft the listing.&rdquo;</p>

      <h3 className="mt-8 font-display text-lg font-semibold">Tools</h3>
      <div className="mt-3 space-y-3">
        {TOOLS.filter((t) => t.enabled?.() ?? true).map((t) => (
          <Card key={t.name} className="p-4">
            <p className="font-mono text-sm font-semibold [overflow-wrap:anywhere]">{t.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">3. Or use the REST API</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Base URL <code className="break-all">{base}/api/v1</code>. Responses are <code>{"{ data }"}</code> or <code>{"{ error }"}</code>. Full spec:{" "}
        <a href="/api/v1/openapi.json" className="text-primary hover:underline">
          openapi.json
        </a>
        .
      </p>
      <table className="mt-4 w-full table-fixed text-sm">
        <colgroup>
          <col className="w-14" />
          <col className="w-[42%]" />
          <col />
        </colgroup>
        <tbody className="divide-y divide-border">
          {[
            ["GET", "/products?q=&category=", "Search live products"],
            ["GET", "/products/{slug}", "One product"],
            ["GET", "/categories", "Category slugs"],
            ["GET", "/directories?niche=&noBadge=", "Launch directories to submit to"],
            ["POST", "/readiness", "Launch-readiness check for { url }"],
            ["POST", "/tools/dofollow", "Is there a dofollow link to { target } on { pageUrl }?"],
            ...(drEnabled() ? [["POST", "/tools/dr", "Authority Score for { domain } (token)"]] : []),
            ["POST", "/submissions", "Create a draft listing (token)"],
            ["GET", "/me/products", "Your listings and stats (token)"],
            ["GET", "/me/links", "Your monitored backlinks and plan usage (token)"],
          ].map(([m, p, d]) => (
            <tr key={p}>
              <td className="py-2 pr-3 font-mono text-xs font-semibold">{m}</td>
              <td className="py-2 pr-3 font-mono text-xs [overflow-wrap:anywhere]">{p}</td>
              <td className="py-2 text-muted-foreground">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Code>{`curl -X POST ${base}/api/v1/submissions \\
  -H "Authorization: Bearer dy_your_token" -H "Content-Type: application/json" \\
  -d '{"websiteUrl":"https://acme.io","name":"Acme","tagline":"Invoices that chase themselves",
       "description":"Acme sends polite, automatic reminders so clients pay on time.",
       "categories":["productivity"],"pricingModel":"freemium"}'`}</Code>
      <p className="mt-4 text-sm text-muted-foreground">
        On Windows PowerShell, <code>curl.exe</code> loses the quotes inside the JSON. Use{" "}
        <code>Invoke-RestMethod</code> instead:
      </p>
      <Code>{`$body = @{ websiteUrl = "https://acme.io"; name = "Acme"; tagline = "Invoices that chase themselves"
  description = "Acme sends polite, automatic reminders so clients pay on time."
  categories = @("productivity"); pricingModel = "freemium" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri ${base}/api/v1/submissions \`
  -Headers @{ Authorization = "Bearer dy_your_token" } -ContentType "application/json" -Body $body`}</Code>
      <p className="mt-6 text-sm text-muted-foreground">
        Readiness checks and each free tool are limited to 15 an hour per caller. Questions: <a href={`mailto:${site.supportEmail}`} className="text-primary hover:underline">{site.supportEmail}</a>.
      </p>
    </Container>
  );
}
