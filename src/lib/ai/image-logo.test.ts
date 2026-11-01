import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { withLogo } from "./image-logo";

const canvas = (format: "png" | "jpeg" | "webp", width = 1376, height = 768) =>
  sharp({ create: { width, height, channels: 3, background: "#203040" } })
    .toFormat(format)
    .toBuffer();

const image = (bytes: Buffer, mimeType: string) => ({
  bytes: new Uint8Array(bytes),
  mimeType,
  width: null,
  height: null,
});

async function pixel(bytes: Uint8Array, x: number, y: number) {
  const data = await sharp(bytes).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [...data.subarray(0, 3)];
}

describe("withLogo", () => {
  it.each([
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ] as const)("keeps a %s's size and format", async (format, mimeType) => {
    const out = await withLogo(image(await canvas(format), mimeType));
    const meta = await sharp(out.bytes).metadata();
    expect(meta).toMatchObject({ format, width: 1376, height: 768 });
    expect(out).toMatchObject({ mimeType, width: 1376, height: 768 });
  });

  it("draws in the bottom-left corner and leaves the rest alone", async () => {
    const out = await withLogo(image(await canvas("png"), "image/png"));
    const background = [0x20, 0x30, 0x40];
    // The chip's left edge region, just inside the margin, a little above the bottom.
    expect(await pixel(out.bytes, 60, 720)).not.toEqual(background);
    expect(await pixel(out.bytes, 4, 764)).toEqual(background);
    expect(await pixel(out.bytes, 1300, 720)).toEqual(background);
    expect(await pixel(out.bytes, 60, 40)).toEqual(background);
  });

  it("returns the image as it was if it can't be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = image(Buffer.from("not an image"), "image/png");
    expect(await withLogo(broken)).toBe(broken);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("skips an image too small to hold the logo", async () => {
    const tiny = image(await canvas("png", 60, 30), "image/png");
    expect(await withLogo(tiny)).toBe(tiny);
  });
});
