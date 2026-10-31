import { z } from "zod";
import { GeminiError } from "@/lib/ai/gemini";
import { loadSite, runStructured, streamAction } from "@/lib/blog/ai/actions";
import { enforceAiLimit } from "@/lib/blog/ai/limits";
import { aiRequestSchema, isStreamed, type AiRequest, type StreamedAction } from "@/lib/blog/ai/request";
import { STREAM_ERROR_MARKER } from "@/lib/blog/ai/types";
import { getPost, PostError } from "@/lib/blog/service";
import { getCurrentUser, isStaff } from "@/lib/auth";

// Drafts research product sites and the web before writing, which takes a while.
export const maxDuration = 300;

const fail = (status: number, error: string, data?: Record<string, unknown>) =>
  Response.json({ error, ...data }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The writer agent. Structured actions return JSON; drafting, rewriting and
 * chat stream plain text so the article appears as it's written. Staff only.
 */
export async function POST(req: Request) {
  const viewer = await getCurrentUser();
  if (!viewer || !(await isStaff(viewer))) return fail(403, "Not allowed.");

  let input: AiRequest;
  try {
    input = aiRequestSchema.parse(await req.json());
  } catch (err) {
    return fail(400, err instanceof z.ZodError ? (err.issues[0]?.message ?? "Bad request.") : "Bad request.");
  }

  try {
    enforceAiLimit(viewer.id);
    const post = await getPost(input.postId);
    if (!post) return fail(404, "Post not found.");
    const site = await loadSite();

    if (isStreamed(input.action)) {
      const gen = streamAction(input as Extract<AiRequest, { action: StreamedAction }>, { post, site });
      // Pull the first chunk before responding so config and quota errors return a real status.
      const first = await gen.next();
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            if (!first.done) controller.enqueue(enc.encode(first.value));
            for await (const chunk of gen) controller.enqueue(enc.encode(chunk));
          } catch (e) {
            console.error("[blog ai stream]", e);
            const msg = e instanceof GeminiError ? e.message : "The writer stopped unexpectedly. Try again.";
            controller.enqueue(enc.encode(`${STREAM_ERROR_MARKER}${msg}`));
          }
          controller.close();
        },
        cancel() {
          void gen.return(undefined);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await runStructured(input as Exclude<AiRequest, { action: StreamedAction }>, { post, site });
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PostError) return fail(err.status, err.message, err.data);
    if (err instanceof GeminiError) return fail(err.status, err.message);
    console.error("[blog ai]", err);
    return fail(500, err instanceof Error ? err.message : "The writer failed.");
  }
}
