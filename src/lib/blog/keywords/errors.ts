/**
 * Turns raw Google Ads API failures into a diagnosis a person can act on. Pure functions, unit
 * tested. Nothing here ever includes credentials.
 *
 * Unverified against a live account: this is written from the documented Google Ads API shape,
 * but keyword research has not been exercised against a real account from this environment. If a
 * request fails, `explainAdsFailure` surfaces Google's own message so the exact cause (often an
 * access level, not a bug) is visible immediately — see docs/blog.md.
 *
 * Google sunset developer tokens on 2026-09-09: access level (Test/Explorer/Basic/Standard) now
 * belongs to the Google Cloud project that owns the OAuth client, not to a token string. See
 * https://developers.google.com/google-ads/api/docs/api-policy/developer-token
 */

export type AdsStage = "oauth" | "api";
export type AdsAttempt = { stage: AdsStage; status: number; message: string; errorCode?: string };

export type AdsFailureReason =
  | "not_configured"
  | "invalid_oauth"
  | "access_level"
  | "permission"
  | "customer_not_found"
  | "quota"
  | "network"
  | "unknown";

const clip = (s: string, n = 280) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Access-level rejections (project on Test or Explorer access trying something it can't) are the
 * expected failure mode for a fresh setup, since Explorer explicitly excludes Keyword Planner. The
 * exact error shape for this is not confirmed live, so this matches broadly on both the structured
 * error code and the raw message text rather than one exact path.
 */
const ACCESS_LEVEL_PATTERN =
  /CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|ACTION_NOT_PERMITTED|DEVELOPER_TOKEN|access level|not approved for production|explorer access/i;

export function classifyAdsAttempt(a: AdsAttempt): AdsFailureReason {
  if (a.status === 0) return "network";
  if (a.stage === "oauth") return "invalid_oauth";
  const haystack = `${a.errorCode ?? ""} ${a.message}`;
  if (ACCESS_LEVEL_PATTERN.test(haystack)) return "access_level";
  if (/AUTHORIZATION_ERROR|AUTHENTICATION|USER_PERMISSION/i.test(haystack) || a.status === 401 || a.status === 403) {
    return "permission";
  }
  if (/CUSTOMER_NOT_FOUND|NOT_FOUND/i.test(haystack) || a.status === 404) return "customer_not_found";
  if (/QUOTA|RESOURCE_EXHAUSTED/i.test(haystack) || a.status === 429) return "quota";
  return "unknown";
}

export type AdsExplained = { reason: AdsFailureReason; message: string };

export function explainAdsFailure(attempts: AdsAttempt[]): AdsExplained {
  if (attempts.length === 0) {
    return {
      reason: "not_configured",
      message:
        "Keyword research is not configured. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_ID, then redeploy. A developer token is no longer required or used (Google sunset it Sep 2026).",
    };
  }
  const last = attempts[attempts.length - 1]!;
  const reason = classifyAdsAttempt(last);
  const detail = clip(last.message);

  switch (reason) {
    case "invalid_oauth":
      return {
        reason,
        message: `Google rejected the OAuth refresh token: "${detail}" Generate a new refresh token for the Google Ads API scope (https://www.googleapis.com/auth/adwords) and update GOOGLE_ADS_REFRESH_TOKEN.`,
      };
    case "access_level":
      return {
        reason,
        message: `Google Ads rejected the request: "${detail}" Your Google Cloud project's Google Ads API access level does not allow this. New projects start on Test access (test accounts only); Explorer access (the next, usually auto-approved level) explicitly excludes Keyword Planner. Apply for Basic access — it needs brand verification but is otherwise reviewed within minutes — from the "Google Ads API Overview" page in Google Cloud Console, for the project that owns GOOGLE_ADS_CLIENT_ID. See docs/blog.md.`,
      };
    case "permission":
      return {
        reason,
        message: `Google Ads denied access: "${detail}" Check GOOGLE_ADS_CUSTOMER_ID is an account your OAuth user has access to, and set GOOGLE_ADS_LOGIN_CUSTOMER_ID if that account is managed under a manager (MCC) account.`,
      };
    case "customer_not_found":
      return {
        reason,
        message: `Google Ads could not find the customer account: "${detail}" Check GOOGLE_ADS_CUSTOMER_ID (10 digits, no dashes).`,
      };
    case "quota":
      return { reason, message: `Google Ads rate-limited the request: "${detail}" Wait and try again.` };
    case "network":
      return { reason, message: `Could not reach Google's API (${detail || "network error"}).` };
    default:
      return { reason, message: `Google Ads returned an error: "${detail}"` };
  }
}
