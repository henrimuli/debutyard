import "server-only";
import { z } from "zod";
import { site as siteConfig } from "@/config/site";
import {
  ApiError,
  categories,
  directoriesInput,
  dofollow,
  dofollowInput,
  domainRating,
  draftInput,
  draftSubmission,
  getInput,
  getProduct,
  launchDirectories,
  inputJsonSchema,
  myLaunches,
  myLinks,
  readiness,
  readinessInput,
  drInput,
  searchInput,
  searchProducts,
} from "./operations";
import { drEnabled } from "@/lib/metrics/service";
import type { ApiContext } from "./http";

/**
 * A stateless MCP server (Streamable HTTP, JSON responses, no SSE). Tools
 * mirror the REST API. Agents can read and draft; they can't publish or pay.
 */

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

type Tool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  readOnly: boolean;
  /** Fetches third-party pages or APIs. */
  openWorld?: boolean;
  /** Hidden from tools/list and refused when false (e.g. no DR provider configured). */
  enabled?: () => boolean;
  run: (args: unknown, ctx: ApiContext) => Promise<unknown>;
};

export const TOOLS: Tool[] = [
  {
    name: "search_products",
    title: "Search products",
    description: "Search products that have debuted on DebutYard by name, tagline or category.",
    input: searchInput,
    readOnly: true,
    run: (args) => searchProducts(args as z.input<typeof searchInput>),
  },
  {
    name: "get_product",
    title: "Get product",
    description: "Full details for one live product: description, maker, categories, applause, rank and awards.",
    input: getInput,
    readOnly: true,
    run: (args) => getProduct(args as z.input<typeof getInput>),
  },
  {
    name: "list_categories",
    title: "List categories",
    description: "Category slugs to use with search_products and submit_product.",
    input: z.object({}),
    readOnly: true,
    run: () => categories(),
  },
  {
    name: "list_launch_directories",
    title: "List launch directories",
    description:
      "Directories and launch boards to submit a product to after launch, with Domain Rating (show the attribution next to it), pricing, link type (marked when verified by our own checks) and whether a badge or the maker personally is needed.",
    input: directoriesInput,
    readOnly: true,
    run: (args) => launchDirectories(args as z.input<typeof directoriesInput>),
  },
  {
    name: "check_launch_readiness",
    title: "Check launch readiness",
    description:
      "Audit a product URL before launch: HTTPS, title, meta description, social image, indexability, duplicates and the DebutYard badge. Returns a 0-100 score, checks with fixes, a suggested listing and the next weeks with room.",
    input: readinessInput,
    readOnly: true,
    openWorld: true,
    run: (args, ctx) =>
      readiness(args as z.input<typeof readinessInput>, { user: ctx.user, clientKey: ctx.clientKey, source: "mcp" }),
  },
  {
    name: "check_dofollow",
    title: "Check a backlink",
    description:
      "Load a page (e.g. a directory listing) and check whether it links to a domain, and whether that link is dofollow or nofollow/ugc/sponsored. Returns the verdict, rel, anchor text and a plain-English explanation.",
    input: dofollowInput,
    readOnly: true,
    openWorld: true,
    run: (args, ctx) =>
      dofollow(args as z.input<typeof dofollowInput>, { user: ctx.user, clientKey: ctx.clientKey, source: "mcp" }),
  },
  {
    name: "check_dr",
    title: "Check Domain Rating",
    description:
      "A domain's Domain Rating by Ahrefs (0-100, returned as dr). Show the returned attribution next to the score. Cached for 7 days. Needs a connected account or API token; limited per account and per day.",
    input: drInput,
    readOnly: true,
    openWorld: true,
    enabled: drEnabled,
    run: (args, ctx) =>
      domainRating(args as z.input<typeof drInput>, { user: ctx.user, clientKey: ctx.clientKey, source: "mcp" }),
  },
  {
    name: "submit_product",
    title: "Draft a product listing",
    description:
      "Create a DRAFT listing for the user's product (needs an API token). It is not submitted: the user opens the returned link to review it, choose a free or paid debut and submit. Run check_launch_readiness and list_categories first.",
    input: draftInput,
    readOnly: false,
    run: (args, ctx) => draftSubmission(args, ctx.user, "mcp"),
  },
  {
    name: "get_my_launches",
    title: "My launches",
    description:
      "The user's listings with status, debut week, badge status, applause, views and clicks (needs an API token).",
    input: z.object({}),
    readOnly: true,
    run: (_args, ctx) => myLaunches(ctx.user),
  },
  {
    name: "get_my_links",
    title: "My monitored links",
    description:
      "The user's backlinks in Link Monitor (from their directory tracker, submission orders and links they added): URL, verdict (dofollow, nofollow, missing, unreachable), rel, anchor and when it was last checked, plus plan usage (needs an API token).",
    input: z.object({}),
    readOnly: true,
    run: (_args, ctx) => myLinks(ctx.user),
  },
];

const available = () => TOOLS.filter((t) => t.enabled?.() ?? true);

const toolList = () =>
  available().map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputJsonSchema(t.input),
    annotations: {
      readOnlyHint: t.readOnly,
      destructiveHint: false,
      openWorldHint: t.openWorld ?? false,
    },
  }));

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const rpcError = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** Handles one JSON-RPC message. Returns null for notifications. */
export async function handleMessage(msg: unknown, ctx: ApiContext): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || (msg as JsonRpcRequest).jsonrpc !== "2.0") {
    return rpcError(null, -32600, "Invalid request");
  }
  const { id, method, params } = msg as JsonRpcRequest;
  if (id === undefined) return null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "debutyard", title: siteConfig.name, version: "1.0.0" },
        instructions:
          "DebutYard is a weekly launch board for software products. Use check_launch_readiness before drafting, list_categories for valid slugs, and submit_product to create a draft the user finishes in their browser. Drafting, get_my_launches and get_my_links need the user's API token.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: toolList() });
    case "tools/call": {
      const tool = available().find((t) => t.name === params?.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params?.name)}`);
      try {
        const data = await tool.run(params?.arguments ?? {}, ctx);
        const structured = Array.isArray(data) ? { items: data } : data;
        return ok({
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: structured,
        });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof z.ZodError
              ? `Invalid arguments: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
              : "Something went wrong.";
        if (!(err instanceof ApiError) && !(err instanceof z.ZodError)) console.error("mcp tool failed", err);
        return ok({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
