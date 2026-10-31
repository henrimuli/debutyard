import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { saveDraftSchema } from "@/lib/blog/schema";
import { PostError, saveDraft } from "@/lib/blog/service";

const fail = (status: number, error: string, data?: Record<string, unknown>) =>
  Response.json({ error, ...data }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Autosave. A route rather than a server action so the editor can send its
 * last edits with `keepalive` while the tab closes. 409 means someone else saved.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/blog/posts/[id]">) {
  const user = await getCurrentUser();
  if (!user || !(await isStaff(user))) return fail(403, "Not allowed.");
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail(404, "Post not found.");
  try {
    const input = saveDraftSchema.parse(await req.json());
    return Response.json(await saveDraft(id, user.id, input), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, err.issues[0]?.message ?? "Bad request.");
    if (err instanceof PostError) return fail(err.status, err.message, err.data);
    if (err instanceof SyntaxError) return fail(400, "Bad request.");
    throw err;
  }
}
