"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { KIT_SOURCES } from "@/lib/kit";
import { confirmSubscription, subscribe, subscribeVerified, unsubscribe } from "@/lib/newsletter/service";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

export type SubscribeState = { ok: boolean; message: string } | null;

const input = z.object({
  email: z.string().trim().email().max(254),
  source: z.string().max(40).optional(),
  // Honeypot: real people never see or fill it.
  website: z.string().max(0).optional(),
});

export async function subscribeAction(_prev: SubscribeState, form: FormData): Promise<SubscribeState> {
  const parsed = input.safeParse({
    email: form.get("email"),
    source: form.get("source") || undefined,
    website: form.get("website") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };

  const result = await subscribe(parsed.data.email, parsed.data.source ?? null);
  if (result === "already_subscribed") return { ok: true, message: "You're already subscribed. See you Monday!" };
  return { ok: true, message: "Check your inbox and click the link to confirm." };
}

const kitInput = z.object({
  email: z.string().trim().email().max(254),
  source: z.enum(KIT_SOURCES),
  website: z.string().max(0).optional(),
  token: z.string().max(2048).nullable(),
});

/** Founder Kit sign-up (exit-intent popup and /resources). Bot-checked, since it sends email to any address. */
export async function subscribeKitAction(_prev: SubscribeState, form: FormData): Promise<SubscribeState> {
  const parsed = kitInput.safeParse({
    email: form.get("email"),
    source: form.get("source"),
    website: form.get("website") || undefined,
    token: form.get("cf-turnstile-response"),
  });
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  if (!(await verifyTurnstile(parsed.data.token, clientIp(await headers())))) {
    return { ok: false, message: "We couldn't confirm you're not a bot. Refresh the page and try again." };
  }
  const result = await subscribe(parsed.data.email, parsed.data.source);
  if (result === "already_subscribed")
    return { ok: true, message: "You're already on the list, so we've emailed you the kit." };
  if (result === "recently_sent") return { ok: true, message: "We just sent you a link. Check your inbox (and spam)." };
  return { ok: true, message: "Check your inbox: confirm your email and the kit opens." };
}

/** The "send me the weekly digest" switch on the sign-in form: runs once sign-in has finished. */
export async function subscribeSignedInAction(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user?.email) return false;
  await subscribeVerified(user.email, "sign-in");
  return true;
}

export async function unsubscribeAction(_prev: boolean | null, form: FormData): Promise<boolean> {
  const token = form.get("token");
  if (typeof token !== "string" || token.length > 64) return false;
  return unsubscribe(token);
}

export async function confirmAction(_prev: boolean | null, form: FormData): Promise<boolean> {
  const token = form.get("token");
  if (typeof token !== "string" || token.length > 64) return false;
  return confirmSubscription(token);
}
