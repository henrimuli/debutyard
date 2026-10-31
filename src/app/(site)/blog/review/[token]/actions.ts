"use server";

import { z } from "zod";
import { answerMakerReview, PostError } from "@/lib/blog/service";

/** The maker's answer from their private preview link. The token is the only credential. */
export async function answerReviewAction(
  token: string,
  approved: boolean,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = z
    .object({ token: z.string().min(20).max(64), approved: z.boolean(), notes: z.string().max(4000) })
    .safeParse({ token, approved, notes });
  if (!input.success) return { ok: false, error: "Check your notes and try again." };
  try {
    await answerMakerReview(input.data.token, input.data.approved, input.data.notes);
    return { ok: true };
  } catch (err) {
    if (err instanceof PostError) return { ok: false, error: err.message };
    throw err;
  }
}
