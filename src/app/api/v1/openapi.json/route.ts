import { site } from "@/config/site";
import { env } from "@/env";
import { CORS } from "@/lib/api/http";
import { dofollowInput, draftInput, drInput, inputJsonSchema, readinessInput } from "@/lib/api/operations";
import { drEnabled } from "@/lib/metrics/service";

const schema = inputJsonSchema;

const ok = (description: string) => ({
  200: { description, content: { "application/json": { schema: { type: "object", properties: { data: {} } } } } },
  default: {
    description: "Error",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  },
});

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${site.name} API`,
      version: "1.0.0",
      description:
        "Search debuts, check launch readiness, and draft listings. Drafts are finished (plan, payment, submit) in the browser.",
    },
    servers: [{ url: `${env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/v1` }],
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "Create a token at /dashboard/api" } },
      schemas: { Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] } },
    },
    paths: {
      "/products": {
        get: {
          summary: "Search live products",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          ],
          responses: ok("Matching products"),
        },
      },
      "/products/{slug}": {
        get: {
          summary: "Get a live product",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: ok("The product"),
        },
      },
      "/categories": { get: { summary: "List categories", responses: ok("Categories") } },
      "/directories": {
        get: {
          summary: "List launch directories",
          parameters: [
            {
              name: "niche",
              in: "query",
              schema: { type: "string", enum: ["general", "devtools", "ai", "indie", "b2b"] },
            },
            { name: "pricing", in: "query", schema: { type: "string", enum: ["free", "freemium", "paid"] } },
            { name: "noBadge", in: "query", schema: { type: "boolean" } },
            { name: "dofollow", in: "query", schema: { type: "boolean" } },
          ],
          responses: ok("Directories"),
        },
      },
      "/readiness": {
        post: {
          summary: "Check launch readiness",
          requestBody: { required: true, content: { "application/json": { schema: schema(readinessInput) } } },
          responses: ok("Score, checks, suggested listing and next weeks with room"),
        },
      },
      "/tools/dofollow": {
        post: {
          summary: "Check whether a page links to a domain, and whether the link is followed",
          requestBody: { required: true, content: { "application/json": { schema: schema(dofollowInput) } } },
          responses: ok("Verdict (dofollow, nofollow, missing, unreachable), rel, anchor and an explanation"),
        },
      },
      ...(drEnabled()
        ? {
            "/tools/dr": {
              post: {
                summary: "Domain Rating by Ahrefs for a domain (cached 7 days; token required, rate-limited)",
                security: [{ token: [] }],
                requestBody: { required: true, content: { "application/json": { schema: schema(drInput) } } },
                responses: ok(
                  "Domain Rating 0-100 (as dr), provider, when it was measured, and the attribution to show next to it",
                ),
              },
            },
          }
        : {}),
      "/submissions": {
        post: {
          summary: "Create a draft listing",
          security: [{ token: [] }],
          requestBody: { required: true, content: { "application/json": { schema: schema(draftInput) } } },
          responses: ok("The draft and the link to finish it"),
        },
      },
      "/me/products": {
        get: { summary: "Your listings and their stats", security: [{ token: [] }], responses: ok("Your listings") },
      },
      "/me/links": {
        get: {
          summary: "Your monitored backlinks and plan usage",
          security: [{ token: [] }],
          responses: ok("Your links with their latest check"),
        },
      },
    },
  };
  return Response.json(spec, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}
