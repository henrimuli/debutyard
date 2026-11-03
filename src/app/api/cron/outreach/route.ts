import { runCron } from "@/lib/cron";
import { readReplies } from "@/lib/outreach/pipeline";

export const maxDuration = 300;

/**
 * Reads replies from every outreach mailbox and ties new orders back to emails.
 * Supabase Cron calls it hourly (see the outreach migration), whatever mode
 * outreach is in.
 */
export function GET(request: Request) {
  return runCron(request, "outreach", [["outreach", () => readReplies()]]);
}
