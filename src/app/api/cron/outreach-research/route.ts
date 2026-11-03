import { runCron } from "@/lib/cron";
import { runResearch } from "@/lib/outreach/pipeline";

// Crawling and researching wait on other services.
export const maxDuration = 300;

/**
 * Finds and researches businesses until there's enough ready to send. Supabase
 * Cron calls it every three hours (see the outreach_separate_crons migration).
 * It does nothing until staff turn outreach on in /admin/outreach.
 */
export function GET(request: Request) {
  return runCron(request, "outreach-research", [["research", () => runResearch()]]);
}
