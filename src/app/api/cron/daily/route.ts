import { recheckBadges } from "@/lib/badges/service";
import { syncSubscriptions } from "@/lib/billing/service";
import { closeEndedPeriods, closeEndedWeeks } from "@/lib/board/rollover";
import { settleBookings } from "@/lib/ads/service";
import { auditDirectories } from "@/lib/directories/audit";
import { refreshDirectoryStats } from "@/lib/directories/service";
import { checkIndexed } from "@/lib/links/indexed";
import { monitorLinks } from "@/lib/links/service";
import { snapshotDomains } from "@/lib/metrics/service";
import { checkBadgeBlocks, sendOrderDigests } from "@/lib/submissions/service";
import { draftWeeklyRecap, notifyScheduledLaunchPosts } from "@/lib/blog/service";
import { sendWeeklyDigest } from "@/lib/newsletter/service";
import { reconcilePendingOrders } from "@/lib/payments/service";
import { notifySpotlightWaitlist } from "@/lib/products/spotlight";
import { runCron } from "@/lib/cron";
import { pruneCronRuns } from "@/lib/admin/overview";

/**
 * One daily job (Vercel Hobby allows few crons), scheduled just after Monday
 * 00:00 UTC rolls the week. Each task is independent and idempotent.
 * Payments and ads also run from /api/cron/hourly when that's scheduled.
 */
export function GET(request: Request) {
  return runCron(request, "daily", [
    ["weeks", () => closeEndedWeeks()],
    ["periods", () => closeEndedPeriods()],
    ["newsletter", () => sendWeeklyDigest()],
    ["recap", () => draftWeeklyRecap()],
    ["launch post emails", () => notifyScheduledLaunchPosts()],
    ["payments", () => reconcilePendingOrders()],
    ["subscriptions", () => syncSubscriptions()],
    ["ads", () => settleBookings()],
    ["spotlight waitlist", () => notifySpotlightWaitlist()],
    ["submission digests", () => sendOrderDigests()],
    ["badge blocks", () => checkBadgeBlocks()],
    ["directory stats", () => refreshDirectoryStats()],
    ["badges", () => recheckBadges()],
    ["links", () => monitorLinks()],
    ["indexed", () => checkIndexed()],
    ["directory audit", () => auditDirectories()],
    ["dr", () => snapshotDomains()],
    // Affiliates are paused (see src/lib/affiliates/PAUSED.md).
    // ["affiliates", () => approveReferrals()],
    ["cron history", () => pruneCronRuns()],
  ]);
}
