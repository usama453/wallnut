import sharp from "sharp";

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  base64: string;
}

const MAX_DIMENSION = 1600;

/**
 * Normalize an uploaded image: strip EXIF rotation, downscale large images
 * (cheaper + faster for both OCR and the vision model), and re-encode as JPEG.
 */
export async function normalizeImage(buffer: Buffer): Promise<NormalizedImage> {
  const image = sharp(buffer, { failOn: "none" }).rotate().jpeg({ quality: 85 });

  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  let resized = image;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  if (scale < 1) {
    resized = resized.resize({ width: Math.round(width * scale) });
  }

  const out = await resized.toBuffer();
  const outMeta = await sharp(out).metadata();

  return {
    buffer: out,
    mimeType: "image/jpeg",
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
    base64: out.toString("base64"),
  };
}

export function toDataUrl(base64: string, mimeType = "image/jpeg") {
  return `data:${mimeType};base64,${base64}`;
}
