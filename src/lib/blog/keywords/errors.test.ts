import { describe, expect, it } from "vitest";
import { classifyAdsAttempt, explainAdsFailure } from "@/lib/blog/keywords/errors";

describe("classifyAdsAttempt", () => {
  it("classifies the oauth stage as invalid_oauth regardless of status", () => {
    expect(classifyAdsAttempt({ stage: "oauth", status: 400, message: "bad refresh token" })).toBe("invalid_oauth");
  });
  it("reads Google Ads error codes off the api stage", () => {
    expect(
      classifyAdsAttempt({
        stage: "api",
        status: 401,
        message: "x",
        errorCode: "authorizationError.INVALID_ACCESS_TOKEN",
      }),
    ).toBe("permission");
    expect(
      classifyAdsAttempt({
        stage: "api",
        status: 403,
        message: "x",
        errorCode: "PERMISSION_DENIED.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
      }),
    ).toBe("access_level");
    expect(classifyAdsAttempt({ stage: "api", status: 404, message: "x" })).toBe("customer_not_found");
    expect(classifyAdsAttempt({ stage: "api", status: 429, message: "x" })).toBe("quota");
    expect(classifyAdsAttempt({ stage: "api", status: 0, message: "x" })).toBe("network");
  });
});

describe("explainAdsFailure", () => {
  it("explains an unconfigured integration without any attempts", () => {
    const ex = explainAdsFailure([]);
    expect(ex.reason).toBe("not_configured");
    expect(ex.message).toContain("GOOGLE_ADS_CLIENT_ID");
  });

  it("tells the reader about access level for a Cloud project access-level error", () => {
    const ex = explainAdsFailure([
      {
        stage: "api",
        status: 403,
        message: "The Google Cloud project is not approved for production access.",
        errorCode: "PERMISSION_DENIED.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
      },
    ]);
    expect(ex.reason).toBe("access_level");
    expect(ex.message).toMatch(/basic access/i);
  });

  it("points at the refresh token for an oauth failure", () => {
    const ex = explainAdsFailure([{ stage: "oauth", status: 400, message: "invalid_grant" }]);
    expect(ex.reason).toBe("invalid_oauth");
    expect(ex.message).toContain("GOOGLE_ADS_REFRESH_TOKEN");
  });
});
