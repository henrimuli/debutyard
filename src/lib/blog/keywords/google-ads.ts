import { explainAdsFailure, type AdsAttempt } from "@/lib/blog/keywords/errors";

/**
 * Google Keyword Planner data via the Google Ads API's `GenerateKeywordIdeas` method — the only
 * way to get real search-volume and competition figures without a paid third-party SEO API.
 *
 * UNVERIFIED against a live account (see docs/blog.md): written from Google's documented request
 * and response shape, but this environment has no Google Ads credentials to test against. If
 * requests fail, `diagnoseGoogleAds()` (and the /keywords/health route) reports Google's exact
 * error so a mismatch can be fixed quickly without guessing.
 *
 * Every keyword-fetching function here degrades to "no data" rather than throwing: a missing or
 * misconfigured Keyword Planner integration must never break the AI writer, only make it fall
 * back to intent-based estimates.
 *
 * Google sunset developer tokens on 2026-09-09 (see
 * https://developers.google.com/google-ads/api/docs/api-policy/developer-token): there is no
 * `developer-token` header anymore, and access level (Test/Explorer/Basic/Standard) is a property
 * of the Google Cloud project that owns GOOGLE_ADS_CLIENT_ID, managed from that project's "Google
 * Ads API Overview" page in Cloud Console rather than a token issued in the Google Ads UI.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Google Ads API versions retire roughly twice a year; override with GOOGLE_ADS_API_VERSION if calls start 404ing. */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const ENGLISH_LANGUAGE_CONSTANT = "languageConstants/1000";

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function adsConfigured(): boolean {
  return Boolean(
    env("GOOGLE_ADS_CLIENT_ID") &&
    env("GOOGLE_ADS_CLIENT_SECRET") &&
    env("GOOGLE_ADS_REFRESH_TOKEN") &&
    env("GOOGLE_ADS_CUSTOMER_ID"),
  );
}

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

type OAuthErrorBody = { error?: string; error_description?: string };

async function getAccessToken(): Promise<{ token: string } | { error: AdsAttempt }> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) return { token: tokenCache.accessToken };

  const clientId = env("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = env("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    return { error: { stage: "oauth", status: 0, message: "OAuth credentials are not fully configured." } };
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (e) {
    return { error: { stage: "oauth", status: 0, message: e instanceof Error ? e.message : "network error" } };
  }
  const json = (await res.json().catch(() => ({}))) as OAuthErrorBody & { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) {
    return {
      error: {
        stage: "oauth",
        status: res.status,
        message: json.error_description || json.error || `HTTP ${res.status}`,
      },
    };
  }
  tokenCache = { accessToken: json.access_token, expiresAt: now + (json.expires_in ?? 3600) * 1000 };
  return { token: tokenCache.accessToken };
}

type AdsApiErrorBody = {
  error?: {
    status?: string;
    message?: string;
    details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[];
  };
};

async function adsApiErrorAttempt(res: Response): Promise<AdsAttempt> {
  const json = (await res.json().catch(() => ({}))) as AdsApiErrorBody;
  const first = json.error?.details?.[0]?.errors?.[0];
  const codeEntry = first?.errorCode ? Object.entries(first.errorCode)[0] : undefined;
  return {
    stage: "api",
    status: res.status,
    message: first?.message || json.error?.message || `HTTP ${res.status}`,
    // Falls back to the top-level RPC status (e.g. "PERMISSION_DENIED") when Google doesn't
    // return a structured Ads errorCode, which is the shape access-level rejections often take.
    errorCode: codeEntry ? `${codeEntry[0]}.${codeEntry[1]}` : json.error?.status,
  };
}

export type KeywordCompetition = "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED" | "UNKNOWN";
export type KeywordIdea = {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: KeywordCompetition;
  competitionIndex: number | null;
};

type AdsIdeaResult = {
  text?: string;
  keywordIdeaMetrics?: {
    avgMonthlySearches?: string | number;
    competition?: string;
    competitionIndex?: string | number;
  };
};

async function callGenerateKeywordIdeas(seeds: string[]): Promise<{ ideas: KeywordIdea[] } | { error: AdsAttempt }> {
  const tokenResult = await getAccessToken();
  if ("error" in tokenResult) return tokenResult;

  const customerId = env("GOOGLE_ADS_CUSTOMER_ID")!.replace(/-/g, "");
  const loginCustomerId = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.replace(/-/g, "");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/customers/${customerId}:generateKeywordIdeas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResult.token}`,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({
        keywordSeed: { keywords: seeds.slice(0, 20) },
        language: ENGLISH_LANGUAGE_CONSTANT,
        includeAdultKeywords: false,
        keywordPlanNetwork: "GOOGLE_SEARCH",
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { error: { stage: "api", status: 0, message: e instanceof Error ? e.message : "network error" } };
  }
  if (!res.ok) return { error: await adsApiErrorAttempt(res) };

  const json = (await res.json().catch(() => ({}))) as { results?: AdsIdeaResult[] };
  const results = Array.isArray(json.results) ? json.results : [];
  return {
    ideas: results.map((r): KeywordIdea => ({
      keyword: String(r.text ?? "").toLowerCase(),
      avgMonthlySearches:
        r.keywordIdeaMetrics?.avgMonthlySearches != null ? Number(r.keywordIdeaMetrics.avgMonthlySearches) : null,
      competition: (r.keywordIdeaMetrics?.competition as KeywordCompetition | undefined) ?? "UNKNOWN",
      competitionIndex:
        r.keywordIdeaMetrics?.competitionIndex != null ? Number(r.keywordIdeaMetrics.competitionIndex) : null,
    })),
  };
}

/**
 * Search volume and competition for up to 20 candidate keywords. Never throws: on any failure
 * (not configured, auth, quota, network) it logs one line and returns `[]` so callers degrade to
 * intent-based estimates instead of breaking.
 */
export async function generateKeywordIdeas(seeds: string[]): Promise<KeywordIdea[]> {
  const cleaned = seeds.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0 || !adsConfigured()) return [];
  const result = await callGenerateKeywordIdeas(cleaned);
  if ("error" in result) {
    console.error("[blog keywords] generateKeywordIdeas failed", JSON.stringify(result.error));
    return [];
  }
  return result.ideas;
}

/** Simple "worth writing about" bucket from real (or absent) volume/competition data. */
export function opportunityOf(volume: number | null, competitionIndex: number | null): "high" | "medium" | "low" {
  if (volume === null) return "medium";
  const comp = competitionIndex ?? 50;
  if (volume >= 500 && comp <= 33) return "high";
  if (volume >= 100) return "medium";
  return "low";
}

export type AdsHealth = {
  configured: boolean;
  oauth: { ok: boolean; message: string };
  api: { ok: boolean; message: string; sample?: KeywordIdea[] };
};

/** Live, staged diagnosis (token exchange, then one API call) for the "Run diagnostics" UI. */
export async function diagnoseGoogleAds(): Promise<AdsHealth> {
  if (!adsConfigured()) {
    return {
      configured: false,
      oauth: { ok: false, message: "Not configured." },
      api: { ok: false, message: "Not configured." },
    };
  }
  const tokenResult = await getAccessToken();
  if ("error" in tokenResult) {
    return {
      configured: true,
      oauth: { ok: false, message: explainAdsFailure([tokenResult.error]).message },
      api: { ok: false, message: "Skipped: OAuth failed first." },
    };
  }
  const apiResult = await callGenerateKeywordIdeas(["short-form video"]);
  if ("error" in apiResult) {
    return {
      configured: true,
      oauth: { ok: true, message: "Token exchange succeeded." },
      api: { ok: false, message: explainAdsFailure([apiResult.error]).message },
    };
  }
  return {
    configured: true,
    oauth: { ok: true, message: "Token exchange succeeded." },
    api: {
      ok: true,
      message: `Received ${apiResult.ideas.length} keyword idea(s).`,
      sample: apiResult.ideas.slice(0, 5),
    },
  };
}
