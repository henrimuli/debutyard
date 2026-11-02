/** Which files can be a listing's evidence screenshot. Pure. */

/** Not SVG: it can carry scripts, and these are served from a public bucket. */
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/** What's wrong with this file as a screenshot, if anything. */
export function screenshotProblem(file: { type: string; size: number }): string | null {
  if (!SCREENSHOT_TYPES.includes(file.type)) return "Screenshots must be PNG, JPEG or WebP.";
  if (file.size > MAX_SCREENSHOT_BYTES) return "Screenshots must be under 5 MB. Crop it or save it as a JPEG.";
  return null;
}

/** The image on the clipboard, if there is one. Pasted text returns null and pastes as usual. */
export function pastedImage(clipboard: {
  items: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>;
}): File | null {
  for (const item of Array.from(clipboard.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
