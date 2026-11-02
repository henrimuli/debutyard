"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import {
  assign,
  previewSupportEmail,
  sendSupportEmail,
  setStarred,
  setStatus,
  setUnread,
  type ComposeInput,
} from "@/lib/support/service";

type Result = { ok: true; threadId?: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const ids = z.array(uuid).min(1).max(200);
const address = z.string().trim().toLowerCase().email("Check the email addresses.");
const compose = z.object({
  mode: z.enum(["new", "reply", "replyAll", "forward"]),
  threadId: uuid.optional(),
  to: z.array(address).min(1, "Add a recipient.").max(20),
  cc: z.array(address).max(20),
  subject: z.string().trim().min(1, "Add a subject.").max(300),
  body: z.string().trim().min(1, "Write a message.").max(50_000),
});

async function staffOnly() {
  const user = await getCurrentUser();
  return user && (await isStaff(user)) ? user : null;
}

async function run(fn: () => Promise<void | string>): Promise<Result> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  try {
    const threadId = await fn();
    refresh();
    return { ok: true, threadId: threadId || undefined };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the input." };
    throw err;
  }
}

export async function sendAction(input: ComposeInput): Promise<Result> {
  const user = await staffOnly();
  if (!user) return { ok: false, error: "Not allowed." };
  const parsed = compose.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message." };
  try {
    const { threadId } = await sendSupportEmail(parsed.data, { id: user.id, name: user.name });
    refresh();
    return { ok: true, threadId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't send." };
  }
}

/** The branded email exactly as it will be sent. */
export async function previewAction(
  input: ComposeInput,
): Promise<{ ok: true; html: string; subject: string } | { ok: false; error: string }> {
  const user = await staffOnly();
  if (!user) return { ok: false, error: "Not allowed." };
  const { html, subject } = await previewSupportEmail(
    { ...input, body: input.body || " ", subject: input.subject || "(no subject)" },
    { id: user.id, name: user.name },
  );
  return { ok: true, html, subject };
}

export async function statusAction(threadIds: string[], status: "open" | "done" | "spam" | "trash") {
  return run(async () => setStatus(ids.parse(threadIds), z.enum(["open", "done", "spam", "trash"]).parse(status)));
}

export async function unreadAction(threadIds: string[], unread: boolean) {
  return run(async () => setUnread(ids.parse(threadIds), unread));
}

export async function starAction(threadId: string, starred: boolean) {
  return run(async () => setStarred(uuid.parse(threadId), starred));
}

export async function assignAction(threadId: string, userId: string | null) {
  return run(async () => assign(uuid.parse(threadId), userId ? z.string().min(1).parse(userId) : null));
}
