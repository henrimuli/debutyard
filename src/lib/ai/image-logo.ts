import "server-only";
import sharp from "sharp";
import { LOGO } from "@/config/logo";
import type { GeneratedImage } from "./gemini";

/** The logo as in the site header, on a light chip so it reads on any image. Colours are the light theme's. */
const INK = "#10201b";
const BRAND = "#0e9f6a";
const CHIP = "#ffffff";
const ON_BRAND = "#ffffff";

/** The mark's width as a share of the image's, and the smallest it's allowed to get. */
const MARK_SHARE = 0.032;
const MIN_MARK_PX = 24;

/** The header's layout, in its own px: a 24px mark, an 8px gap, then the wordmark. */
const MARK = 24;
const GAP = 8;
const PAD_X = 10;
const PAD_Y = 6;

function logoChip(scale: number) {
  const { disc, mark, strokeWidth, wordmark } = LOGO;
  const w = PAD_X * 2 + MARK + GAP + wordmark.width;
  const h = PAD_Y * 2 + MARK;
  const baseline = PAD_Y + MARK / 2 + wordmark.capHeight / 2;
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" rx="${h / 2}" fill="${CHIP}" fill-opacity="0.94"/>
<g transform="translate(${PAD_X} ${PAD_Y})"><circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}" fill="${BRAND}"/><path d="${mark}" fill="${ON_BRAND}" stroke="${ON_BRAND}" stroke-width="${strokeWidth}" stroke-linejoin="round"/></g>
<g transform="translate(${PAD_X + MARK + GAP} ${baseline})"><path d="${wordmark.debut}" fill="${INK}"/><path d="${wordmark.yard}" fill="${BRAND}"/></g>
</svg>`;
  return { svg: Buffer.from(svg), width, height };
}

/**
 * Puts the DebutYard logo in the bottom-left corner of a generated image, keeping
 * its size and format. If that fails the image is returned as it was: a draw costs
 * money and the editor is waiting on it.
 */
export async function withLogo(image: GeneratedImage): Promise<GeneratedImage> {
  try {
    const source = sharp(image.bytes);
    const { width, height, format } = await source.metadata();
    const scale = Math.max(MIN_MARK_PX, width * MARK_SHARE) / MARK;
    const chip = logoChip(scale);
    const margin = Math.round(Math.max(12, width * 0.02));
    if (chip.width + margin > width || chip.height + margin > height) return image;
    const bytes = await source
      .composite([{ input: chip.svg, left: margin, top: height - chip.height - margin }])
      .toFormat(format)
      .toBuffer();
    return { ...image, bytes: new Uint8Array(bytes), width, height };
  } catch (err) {
    console.error("couldn't add the logo to a generated image", err);
    return image;
  }
}
