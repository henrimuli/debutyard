"use server";

import { z } from "zod";
import type { Prefill } from "@/lib/products/prefill";
import { prefillFromSite } from "@/lib/products/prefill-service";
import { checkIntakeBlock, type InstallCheck } from "@/lib/badge-block/service";
import {
  orderByIntakeToken,
  saveIntakeDraft,
  submitIntake,
  SubmissionError,
  type IntakeInput,
} from "@/lib/submissions/service";

/** Fills the intake form from the client's website. The private order link is the credential. */
export async function intakePrefillAction(
  token: string,
  url: string,
): Promise<{ ok: true; data: Prefill } | { ok: false; error: string }> {
  const order = await orderByIntakeToken(token);
  if (!order || order.status !== "awaiting_intake") return { ok: false, error: "Order not found." };
  return prefillFromSite(url);
}

type FormResult = { ok: true } | { ok: false; error: string; field?: string };

async function formResult(fn: () => Promise<unknown>): Promise<FormResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof SubmissionError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) {
      const i = err.issues[0];
      return { ok: false, error: i?.message ?? "Check the form.", field: i?.path[0]?.toString() };
    }
    throw err;
  }
}

export async function submitIntakeAction(token: string, input: IntakeInput) {
  return formResult(() => submitIntake(token, input));
}

export async function saveIntakeDraftAction(token: string, input: IntakeInput) {
  return formResult(() => saveIntakeDraft(token, input));
}

export async function checkBlockAction(
  token: string,
): Promise<{ ok: true; result: InstallCheck } | { ok: false; error: string }> {
  const order = await orderByIntakeToken(token);
  if (!order) return { ok: false, error: "Order not found." };
  try {
    return { ok: true, result: await checkIntakeBlock(order) };
  } catch (err) {
    if (err instanceof SubmissionError) return { ok: false, error: err.message };
    throw err;
  }
}
