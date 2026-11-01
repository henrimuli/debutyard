import type { Env } from "@/env";

export type SetupItem = { label: string; ok: boolean; required: boolean; hint: string };

/**
 * Which services are configured, from env presence only (never values).
 * Pure, so it's unit-tested.
 */
export function setupChecklist(e: Env): SetupItem[] {
  const has = (...keys: Array<keyof Env>) => keys.every((k) => Boolean(e[k]));
  const r2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
  const r2Missing = r2.filter((k) => !e[k]);
  return [
    { label: "Admin email", ok: has("ADMIN_EMAIL"), required: true, hint: "ADMIN_EMAIL" },
    {
      label: "Email (Resend)",
      ok: has("RESEND_API_KEY"),
      required: true,
      hint: "RESEND_API_KEY",
    },
    { label: "Cron secret", ok: has("CRON_SECRET"), required: true, hint: "CRON_SECRET" },
    {
      label: "Payments",
      ok: has("PAYSTACK_SECRET_KEY") || has("PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"),
      required: true,
      hint: "PAYSTACK_SECRET_KEY or PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET",
    },
    {
      label: "File storage (R2)",
      ok: r2Missing.length === 0,
      required: true,
      // Name what's missing: all five are needed, and one gap is easy to miss.
      hint: r2Missing.length ? `missing ${r2Missing.join(", ")}` : r2.join(", "),
    },
    {
      label: "Resend webhook",
      ok: has("RESEND_WEBHOOK_SECRET"),
      required: false,
      hint: "RESEND_WEBHOOK_SECRET (inboxes, newsletter stats)",
    },
    {
      label: "Order inboxes",
      ok: has("INBOUND_EMAIL_DOMAIN", "RESEND_WEBHOOK_SECRET"),
      required: false,
      hint: "INBOUND_EMAIL_DOMAIN",
    },
    { label: "Directory logins", ok: has("CREDENTIALS_KEY"), required: false, hint: "CREDENTIALS_KEY" },
    {
      label: "Authority Score provider",
      ok: has("DR_API_KEY"),
      required: false,
      hint: "DR_API_KEY (DataForSEO login:password); DR_PROVIDER to switch",
    },
    {
      label: "Index check",
      ok: has("SERP_PROVIDER", "SERP_API_KEY"),
      required: false,
      hint: "SERP_PROVIDER, SERP_API_KEY",
    },
    {
      label: "Screenshots",
      ok: has("WORKER_URL", "WORKER_SECRET"),
      required: false,
      hint: "WORKER_URL, WORKER_SECRET",
    },
    { label: "Blocked-site fetches", ok: has("FIRECRAWL_API_KEY"), required: false, hint: "FIRECRAWL_API_KEY" },
    {
      label: "Social sign-in",
      ok: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") || has("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"),
      required: false,
      hint: "GOOGLE_* or GITHUB_*",
    },
  ];
}
