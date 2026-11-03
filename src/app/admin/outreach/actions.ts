"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { env } from "@/env";
import { markThreadUnread, sendReply, setThreadStatus } from "@/lib/outreach/inbox";
import { canGoLive, sendTest } from "@/lib/outreach/pipeline";
import { blockDomain, discardDraft } from "@/lib/outreach/queries";
import { registrableDomain } from "@/lib/outreach/rules";
import { getSettings, updateSettings } from "@/lib/outreach/settings";
import { ensureSeeds, proposeVariant, setVariantStatus } from "@/lib/outreach/variants";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const uuid = z.string().uuid();

async function staffOnly() {
  const user = await getCurrentUser();
  return user && (await isStaff(user)) ? user : null;
}

async function run(fn: () => Promise<string | void>): Promise<ActionResult> {
  if (!(await staffOnly())) return { ok: false, error: "Not allowed." };
  try {
    const message = await fn();
    refresh();
    return { ok: true, message: message || undefined };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the input." };
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

const settings = z.object({
  mode: z.enum(["off", "dry_run", "live"]),
  dailyLimit: z.coerce.number().int().min(0, "The daily limit can't be negative.").max(5000, "5000 a day at most."),
  maxAuthority: z.coerce.number().int().min(1).max(100),
});

export async function saveSettingsAction(input: { mode: string; dailyLimit: string; maxAuthority: string }) {
  return run(async () => {
    const s = settings.parse(input);
    if (s.mode === "live" && !canGoLive()) {
      throw new Error("Live needs the production site and a working OUTREACH_MAILBOXES list.");
    }
    await ensureSeeds();
    const { pausedReason } = await getSettings();
    // Choosing a mode again is what clears a pause, and the sends behind it stop counting.
    await updateSettings({ ...s, pausedReason: null, ...(pausedReason ? { healthFrom: new Date() } : {}) });
  });
}

export async function sendTestAction() {
  return run(async () => {
    const to = env().ADMIN_EMAIL;
    if (!to) throw new Error("Set ADMIN_EMAIL first.");
    const { sent, failed } = await sendTest(to);
    if (sent === 0) throw new Error(`No mailbox could send: ${failed.join(", ")}.`);
    return `Sent ${sent} to ${to}.${failed.length ? ` Failed: ${failed.join(", ")}.` : ""}`;
  });
}

export async function discardDraftAction(id: string) {
  return run(() => discardDraft(uuid.parse(id)));
}

export async function blockDomainAction(raw: string) {
  return run(async () => {
    const domain = registrableDomain(z.string().trim().min(3).max(253).parse(raw).toLowerCase());
    if (!domain) throw new Error("That doesn't look like a domain.");
    await blockDomain(domain);
    return `${domain} is blocked.`;
  });
}

export async function proposeVariantAction() {
  return run(async () => {
    await ensureSeeds();
    const v = await proposeVariant();
    return `"${v.name}" is waiting for your approval.`;
  });
}

export async function setVariantStatusAction(id: string, status: "testing" | "retired") {
  return run(() => setVariantStatus(uuid.parse(id), z.enum(["testing", "retired"]).parse(status)));
}

export async function replyAction(threadId: string, body: string): Promise<ActionResult> {
  const user = await staffOnly();
  if (!user) return { ok: false, error: "Not allowed." };
  return run(async () => {
    const text = z.string().trim().min(1, "Write a message.").max(20_000).parse(body);
    await sendReply(uuid.parse(threadId), text, user.id);
  });
}

export async function threadUnreadAction(id: string) {
  return run(() => markThreadUnread(uuid.parse(id)));
}

export async function threadStatusAction(id: string, status: "open" | "done") {
  return run(() => setThreadStatus(uuid.parse(id), z.enum(["open", "done"]).parse(status)));
}
