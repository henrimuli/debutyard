import "server-only";
import { and, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { blockHtml } from "./render";

/**
 * A temporary test: can directories' Verify buttons see a badge added by a script,
 * or only one in the raw HTML? Off in production. See /badge-check/script and /badge-check/server.
 */
export const badgeCheckEnabled = () => process.env.VERCEL_ENV !== "production";

/** Always in the block, so we can tell which method reached the raw HTML without pasting a real badge. */
export const CONTROL_HREF = "https://example.com/debutyard-badge-control";

/** The control link plus every badge pasted into a directory in the admin. */
export async function checkBlockHtml(): Promise<string> {
  const { directories } = schema;
  const rows = await db()
    .select({ snippet: directories.badgeSnippet })
    .from(directories)
    .where(and(isNotNull(directories.badgeSnippet), ne(directories.badgeSnippet, "")));
  return blockHtml([`<a href="${CONTROL_HREF}">Badge check</a>`, ...rows.map((r) => r.snippet!)]);
}

export const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
