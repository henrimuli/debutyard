import { describe, expect, it } from "vitest";
import { MAX_SCREENSHOT_BYTES, pastedImage, screenshotProblem } from "./screenshot";

describe("screenshotProblem", () => {
  it("takes the usual screenshot formats within the limit", () => {
    expect(screenshotProblem({ type: "image/png", size: MAX_SCREENSHOT_BYTES })).toBeNull();
    expect(screenshotProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("turns away SVGs, other files and anything too big", () => {
    expect(screenshotProblem({ type: "image/svg+xml", size: 1000 })).toContain("PNG");
    expect(screenshotProblem({ type: "application/pdf", size: 1000 })).toContain("PNG");
    expect(screenshotProblem({ type: "image/png", size: MAX_SCREENSHOT_BYTES + 1 })).toContain("5 MB");
  });
});

describe("pastedImage", () => {
  const file = new File(["x"], "image.png", { type: "image/png" });
  const text = { kind: "string", type: "text/plain", getAsFile: () => null };
  const image = { kind: "file", type: "image/png", getAsFile: () => file };

  it("finds an image among whatever else was copied", () => {
    expect(pastedImage({ items: [text, image] })).toBe(file);
  });

  it("leaves plain text alone", () => {
    expect(pastedImage({ items: [text] })).toBeNull();
  });
});
