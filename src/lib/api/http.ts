import "server-only";
import { clientIp } from "@/lib/request";
import { ApiError } from "./operations";
import { authenticate, type ApiUser } from "./tokens";

/** Token auth, no cookies, so any origin may call the API. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export type ApiContext = { user: ApiUser | null; clientKey: string };

/**
 * The POST body, or null when there is none. A body that isn't JSON is a 400 that says so,
 * rather than null reaching the input check as "expected object, received null". The usual
 * cause is a shell mangling the quotes (Windows PowerShell 5.1 strips them from curl.exe args).
 */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      "The request body isn't valid JSON. Send it with Content-Type: application/json; if you're using curl in Windows PowerShell, put the JSON in a file and pass -d '@body.json'.",
      400,
    );
  }
}

/** Runs an API handler: auth, JSON body, errors as `{ error }`. */
export async function api(
  request: Request,
  fn: (ctx: ApiContext & { body: unknown }) => Promise<unknown>,
): Promise<Response> {
  try {
    const user = await authenticate(request);
    if (!user && request.headers.get("authorization")) throw new ApiError("Invalid or revoked API token.", 401);
    const body = request.method === "POST" ? await readJson(request) : null;
    const data = await fn({ user, clientKey: clientIp(request.headers) ?? "unknown", body });
    return Response.json({ data }, { headers: CORS });
  } catch (err) {
    if (err instanceof ApiError) return Response.json({ error: err.message }, { status: err.status, headers: CORS });
    if (err instanceof Error && err.name === "ZodError") {
      return Response.json({ error: "Invalid input." }, { status: 400, headers: CORS });
    }
    console.error("api error", err);
    return Response.json({ error: "Something went wrong." }, { status: 500, headers: CORS });
  }
}
