"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { createUploadUrl } from "@/lib/storage";
import { markMessageUnread } from "@/lib/submissions/inbox";
import { screenshotProblem } from "@/lib/submissions/screenshot";
import { findBlock, setBadgeCode } from "@/lib/badge-block/service";
import {
  addOrderDirectory,
  assignOrder,
  bulkUpdate,
  deliverOrder,
  sendBadgeBlock,
  SubmissionError,
  swapOrderDirectory,
  updateOrderSubmission,
  type OpsUpdate,
} from "@/lib/submissions/service";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const uuid = z.string().uuid();

async function staffOnly() {
  const user = await getCurrentUser();
  return user && (await isStaff(user)) ? user : null;
}

async function run(fn: () => Promise<string | void>): Promise<Result> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  try {
    const message = await fn();
    refresh();
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof SubmissionError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the input." };
    throw err;
  }
}

/**
 * Puts an order's email back to unread. No refresh here: that would re-render the
 * open email, which marks it read again. The caller goes back to the list.
 */
export async function markMessageUnreadAction(messageId: string): Promise<Result> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Not found." };
  await markMessageUnread(messageId);
  return { ok: true };
}

export async function updateRowAction(submissionId: string, input: OpsUpdate) {
  if (!uuid.safeParse(submissionId).success) return { ok: false as const, error: "Not found." };
  return run(async () => {
    const { row, replacement } = await updateOrderSubmission(submissionId, input);
    if (replacement) return "Replaced with the next best directory.";
    if (row.status === "live" && row.linkVerdict) return `Link check: ${row.linkVerdict}.`;
  });
}

/** Where the browser sends a listing's screenshot. Saving it on the row is a separate update. */
export async function evidenceUploadAction(
  contentType: string,
  size: number,
): Promise<{ ok: true; uploadUrl: string; publicUrl: string } | { ok: false; error: string }> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  const problem = screenshotProblem({ type: contentType, size });
  if (problem) return { ok: false, error: problem };
  try {
    const { uploadUrl, publicUrl } = await createUploadUrl({ folder: "evidence", contentType, contentLength: size });
    return { ok: true, uploadUrl, publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

export async function bulkAction(orderId: string, ids: string[], status: "submitted" | "pending" | "skipped" | "todo") {
  if (!uuid.safeParse(orderId).success || !z.array(uuid).max(500).safeParse(ids).success) {
    return { ok: false as const, error: "Bad request." };
  }
  return run(async () => `${await bulkUpdate(orderId, ids, status)} updated.`);
}

const placed = (verb: string, directory: { name: string; badgeRequired: boolean }) =>
  `${verb} ${directory.name}.${directory.badgeRequired ? " It needs a badge." : ""}`;

export async function setBadgeCodeAction(submissionId: string, code: string) {
  if (!uuid.safeParse(submissionId).success) return { ok: false as const, error: "Not found." };
  return run(async () => {
    const { showing, removed, hasLink } = await setBadgeCode(submissionId, code);
    if (!showing) return "Badge removed from the client's site.";
    const notes = [
      removed.length ? `We removed what can't go on a client's site: ${removed.join(", ")}.` : "",
      hasLink ? "" : "There's no link in it, and most Verify buttons look for one.",
    ];
    return ["Badge saved. It's on the client's site within about 10 seconds.", ...notes].filter(Boolean).join(" ");
  });
}

export async function recheckBlockAction(orderId: string) {
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "Not found." };
  return run(async () => {
    const order = await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.id, orderId) });
    if (!order) throw new SubmissionError("Not found.");
    const check = await findBlock(order);
    if (check.found) return "The block is on the client's site.";
    throw new SubmissionError(
      check.reason === "missing"
        ? "The block isn't on the client's site anymore. Ask them to put it back."
        : "We couldn't reach the client's site to check.",
    );
  });
}

export async function swapDirectoryAction(submissionId: string, directoryId: string) {
  if (!uuid.safeParse(submissionId).success || !uuid.safeParse(directoryId).success) {
    return { ok: false as const, error: "Not found." };
  }
  return run(async () => placed("Swapped in", (await swapOrderDirectory(submissionId, directoryId)).directory));
}

export async function addDirectoryAction(orderId: string, directoryId: string) {
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(directoryId).success) {
    return { ok: false as const, error: "Not found." };
  }
  return run(async () => placed("Added", (await addOrderDirectory(orderId, directoryId)).directory));
}

export async function assignAction(orderId: string, assigneeId: string | null) {
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "Not found." };
  return run(() => assignOrder(orderId, assigneeId || null));
}

export async function resendBadgeBlockAction(orderId: string) {
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "Not found." };
  return run(async () => {
    const order = await db().query.submissionOrders.findFirst({ where: eq(schema.submissionOrders.id, orderId) });
    if (!order) throw new SubmissionError("Not found.");
    return (await sendBadgeBlock(order))
      ? "Badge block sent."
      : "No badge snippets yet: add them to the badge directories first.";
  });
}

export async function deliverAction(orderId: string) {
  if (!uuid.safeParse(orderId).success) return { ok: false as const, error: "Not found." };
  return run(async () => {
    await deliverOrder(orderId);
    return "Delivered. The client has their report.";
  });
}
