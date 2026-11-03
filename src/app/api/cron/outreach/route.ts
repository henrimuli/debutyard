import { runCron } from "@/lib/cron";
import { runOutreach } from "@/lib/outreach/pipeline";

// Crawling, researching and writing all wait on other services.
export const maxDuration = 300;

/**
 * The cold outreach worker: reads replies, moves prospects along and sends
 * what's due. Supabase Cron calls it hourly (see the outreach migration). It
 * does nothing but read the mailbox until staff turn it on in /admin/outreach.
 */
export function GET(request: Request) {
  return runCron(request, "outreach", [["outreach", () => runOutreach()]]);
}
