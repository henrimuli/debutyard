import { describe, expect, it } from "vitest";
import { awaitsScreenshot, rowIsDone } from "./progress";

const shot = "https://cdn.test/shot.png";

describe("rowIsDone", () => {
  it("counts submitted and in-review rows once they have a screenshot", () => {
    expect(rowIsDone({ status: "submitted", evidenceUrl: shot })).toBe(true);
    expect(rowIsDone({ status: "pending", evidenceUrl: shot })).toBe(true);
    expect(rowIsDone({ status: "submitted", evidenceUrl: null })).toBe(false);
    expect(rowIsDone({ status: "pending", evidenceUrl: null })).toBe(false);
  });

  it("counts finished rows with or without one", () => {
    for (const status of ["live", "rejected", "dead", "skipped"]) {
      expect(rowIsDone({ status, evidenceUrl: null })).toBe(true);
    }
  });

  it("doesn't count work still to do, even with a screenshot", () => {
    expect(rowIsDone({ status: "todo", evidenceUrl: shot })).toBe(false);
    expect(rowIsDone({ status: "needs_action", evidenceUrl: shot })).toBe(false);
  });
});

describe("awaitsScreenshot", () => {
  it("only flags rows with the directory that have no screenshot", () => {
    expect(awaitsScreenshot({ status: "submitted", evidenceUrl: null })).toBe(true);
    expect(awaitsScreenshot({ status: "pending", evidenceUrl: null })).toBe(true);
    expect(awaitsScreenshot({ status: "submitted", evidenceUrl: shot })).toBe(false);
    expect(awaitsScreenshot({ status: "todo", evidenceUrl: null })).toBe(false);
    expect(awaitsScreenshot({ status: "live", evidenceUrl: null })).toBe(false);
  });
});
