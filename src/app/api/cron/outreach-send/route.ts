import { runCron } from "@/lib/cron";
import { runSending } from "@/lib/outreach/pipeline";

// Writing waits on the model, and each email waits on its mailbox.
export const maxDuration = 300;

/**
 * Writes emails for researched businesses and sends what's due, spread over the
 * sending hours. Supabase Cron calls it hourly (see the outreach_separate_crons
 * migration). It does nothing until staff turn outreach on in /admin/outreach.
 */
export function GET(request: Request) {
  return runCron(request, "outreach-send", [["send", () => runSending()]]);
}
