// Client-side signature processing:
// 1) Load image to canvas
// 2) Threshold (any ink color on any bg -> binary mask)
// 3) Dilate to thicken strokes ("bold")
// 4) Output: black strokes on transparent background
//
// All failure paths throw a typed `SignatureError` (see signature-errors.ts).

import { SignatureError, toSignatureError } from "./signature-errors";

export { SignatureError, toSignatureError } from "./signature-errors";
export type { SignatureErrorCode, SignatureErrorJSON } from "./signature-errors";

export interface ProcessOptions {
  threshold: number; // 0-255, luminance cutoff. Lower = stricter (only dark ink)
  boldness: number; // 0-10, dilation radius in px
  trim: boolean; // crop to content
  padding: number; // px of padding around trimmed content
}

export const OUTPUT_IMAGE_WIDTH = 493;
export const OUTPUT_IMAGE_HEIGHT = 274;

export const DEFAULT_OPTIONS: ProcessOptions = {
  threshold: 160,
  boldness: 2,
  trim: true,
  padding: 24,
};

export const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const;

/** Formats the browser can't reliably decode — surface a conversion hint. */
export const CONVERSION_REQUIRED_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/tif",
  "image/avif",
] as const;

const CONVERSION_REQUIRED_EXTENSIONS = [".heic", ".heif", ".tif", ".tiff", ".avif"];

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_IMAGE_DIMENSION = 8000; // px on either side

function needsConversionByName(name: string): boolean {
  const lower = name.toLowerCase();
  return CONVERSION_REQUIRED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Validate an uploaded file. Returns null on success, otherwise a
 * SignatureError describing the failure (never throws).
 */
export function validateImageFile(file: File): SignatureError | null {
  if (file.size === 0) {
    return new SignatureError("empty_file", "This file is empty.");
  }

  const mime = (file.type || "").toLowerCase();

  if (
    CONVERSION_REQUIRED_MIME_TYPES.includes(
      mime as (typeof CONVERSION_REQUIRED_MIME_TYPES)[number],
    ) ||
    needsConversionByName(file.name || "")
  ) {
    return new SignatureError(
      "needs_conversion",
      "This format (HEIC, TIFF, or AVIF) isn't supported by browsers directly.",
      {
        hint: "Convert to PNG or JPG first, then re-upload.",
        details: { mime, name: file.name },
      },
    );
  }

  if (!mime.startsWith("image/")) {
    return new SignatureError(
      "not_image",
      "Please choose an image file (PNG, JPG, WEBP, GIF, or BMP).",
      { details: { mime } },
    );
  }

  if (!SUPPORTED_MIME_TYPES.includes(mime as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return new SignatureError(
      "unsupported_mime",
      `Unsupported image type "${file.type}".`,
      { hint: "Use PNG, JPG, WEBP, GIF, or BMP.", details: { mime } },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return new SignatureError(
      "too_large",
      `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 20MB.`,
      { details: { size: file.size, max: MAX_FILE_BYTES } },
    );
  }

  return null;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(
          new SignatureError(
            "decode_failed",
            "Image has zero dimensions and can't be processed.",
          ),
        );
        return;
      }
      if (
        img.naturalWidth > MAX_IMAGE_DIMENSION ||
        img.naturalHeight > MAX_IMAGE_DIMENSION
      ) {
        reject(
          new SignatureError(
            "dimensions_too_large",
            `Image is too large (${img.naturalWidth}×${img.naturalHeight}px).`,
            {
              hint: `Resize below ${MAX_IMAGE_DIMENSION}px on the longest side and try again.`,
              details: { width: img.naturalWidth, height: img.naturalHeight },
            },
          ),
        );
        return;
      }
      resolve(img);
    };
    img.onerror = () =>
      reject(
        new SignatureError(
          "decode_failed",
          "Could not decode this image. The file may be corrupted or use an unsupported format.",
          { hint: "Try re-saving it as PNG or JPG." },
        ),
      );
    img.src = src;
  });
}

/**
 * Build a binary ink mask from raw RGBA pixel data.
 * mask[i] = 1 if pixel i is considered ink, else 0.
 */
export function buildInkMask(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 16) {
      mask[j] = 0;
      continue;
    }
    const minc = Math.min(r, g, b);
    const maxc = Math.max(r, g, b);
    const isDark = minc < threshold;
    const isSaturated = maxc - minc > 50 && minc < 220;
    mask[j] = isDark || isSaturated ? 1 : 0;
  }
  return mask;
}

/** Two-pass separable dilation using a sliding max. */
export function dilateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let k = x0; k <= x1; k++) {
        if (mask[row + k]) {
          m = 1;
          break;
        }
      }
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let k = y0; k <= y1; k++) {
        if (tmp[k * w + x]) {
          m = 1;
          break;
        }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitIntoBounds(
  contentWidth: number,
  contentHeight: number,
  targetWidth: number,
  targetHeight: number,
): FitRect {
  const scale = Math.min(targetWidth / contentWidth, targetHeight / contentHeight);
  const width = Math.max(1, Math.round(contentWidth * scale));
  const height = Math.max(1, Math.round(contentHeight * scale));

  return {
    x: Math.floor((targetWidth - width) / 2),
    y: Math.floor((targetHeight - height) / 2),
    width,
    height,
  };
}

export function computeBBox(
  mask: Uint8Array,
  w: number,
  h: number,
): BBox | null {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

export function isBlankMask(mask: Uint8Array, minInkPixels = 20): boolean {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      count++;
      if (count >= minInkPixels) return false;
    }
  }
  return true;
}

/**
 * Pure pipeline that operates on raw RGBA buffers. Exposed so it can be
 * exercised in non-DOM environments (Node tests, performance benchmarks).
 * Returns the dilated mask + bbox; throws SignatureError on blank input.
 */
export function processPixels(
  pixels: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: ProcessOptions,
): { mask: Uint8Array; bbox: BBox } {
  const mask = buildInkMask(pixels, w, h, opts.threshold);
  const r = Math.max(0, Math.round(opts.boldness));
  const dilated = dilateMask(mask, w, h, r);
  if (isBlankMask(dilated)) {
    throw new SignatureError(
      "blank_signature",
      "No signature detected in the image.",
      { hint: "Try a clearer photo, or raise the ink sensitivity slider." },
    );
  }
  const bbox =
    (opts.trim ? computeBBox(dilated, w, h) : null) ?? {
      minX: 0,
      minY: 0,
      maxX: w - 1,
      maxY: h - 1,
    };
  return { mask: dilated, bbox };
}

export function processSignature(
  img: HTMLImageElement,
  opts: ProcessOptions,
): HTMLCanvasElement {
  const MAX = 2000;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  if (!sctx) {
    throw new SignatureError("canvas_unavailable", "Your browser blocked canvas access.");
  }
  try {
    sctx.drawImage(img, 0, 0, w, h);
  } catch (err) {
    throw toSignatureError(err);
  }
  let data: ImageData;
  try {
    data = sctx.getImageData(0, 0, w, h);
  } catch (err) {
    throw new SignatureError(
      "canvas_unavailable",
      "Couldn't read pixel data — the image may be CORS-protected.",
      { cause: err },
    );
  }

  const { mask: dilated, bbox } = processPixels(data.data, w, h, opts);

  const pad = Math.max(0, opts.padding);
  const cropX = Math.max(0, bbox.minX - pad);
  const cropY = Math.max(0, bbox.minY - pad);
  const cropW = Math.min(w, bbox.maxX + pad + 1) - cropX;
  const cropH = Math.min(h, bbox.maxY + pad + 1) - cropY;

  const out = document.createElement("canvas");
  out.width = OUTPUT_IMAGE_WIDTH;
  out.height = OUTPUT_IMAGE_HEIGHT;
  const octx = out.getContext("2d");
  if (!octx) {
    throw new SignatureError("canvas_unavailable", "Your browser blocked canvas access.");
  }
  octx.clearRect(0, 0, OUTPUT_IMAGE_WIDTH, OUTPUT_IMAGE_HEIGHT);
  const fit = fitIntoBounds(cropW, cropH, OUTPUT_IMAGE_WIDTH, OUTPUT_IMAGE_HEIGHT);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) {
    throw new SignatureError("canvas_unavailable", "Your browser blocked canvas access.");
  }
  const outData = cropCtx.createImageData(cropW, cropH);
  const op = outData.data;
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const sj = (y + cropY) * w + (x + cropX);
      const oj = (y * cropW + x) * 4;
      if (dilated[sj]) {
        op[oj] = 0;
        op[oj + 1] = 0;
        op[oj + 2] = 0;
        op[oj + 3] = 255;
      } else {
        op[oj + 3] = 0;
      }
    }
  }
  cropCtx.putImageData(outData, 0, 0);
  octx.imageSmoothingEnabled = true;
  octx.drawImage(cropCanvas, fit.x, fit.y, fit.width, fit.height);
  return out;
}
