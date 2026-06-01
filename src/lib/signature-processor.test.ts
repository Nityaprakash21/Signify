import { describe, it, expect } from "vitest";
import {
  buildInkMask,
  computeBBox,
  dilateMask,
  isBlankMask,
  validateImageFile,
  processPixels,
  MAX_FILE_BYTES,
  SignatureError,
} from "./signature-processor";

function makePixels(
  w: number,
  h: number,
  inkAt: (x: number, y: number) => boolean,
  inkColor: [number, number, number] = [0, 0, 0],
  bgColor: [number, number, number] = [255, 255, 255],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = inkAt(x, y) ? inkColor : bgColor;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

describe("buildInkMask", () => {
  it("detects black ink on white background", () => {
    const px = makePixels(4, 1, (x) => x === 1 || x === 2);
    expect(Array.from(buildInkMask(px, 4, 1, 160))).toEqual([0, 1, 1, 0]);
  });

  it("detects saturated colored ink (any color)", () => {
    const px = makePixels(3, 1, (x) => x === 1, [220, 20, 20]);
    expect(buildInkMask(px, 3, 1, 160)[1]).toBe(1);
  });

  it("ignores fully transparent pixels", () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]);
    expect(Array.from(buildInkMask(px, 2, 1, 160))).toEqual([1, 0]);
  });

  it("threshold controls sensitivity", () => {
    const px = makePixels(1, 1, () => true, [180, 180, 180]);
    expect(buildInkMask(px, 1, 1, 160)[0]).toBe(0);
    expect(buildInkMask(px, 1, 1, 200)[0]).toBe(1);
  });
});

describe("dilateMask (stroke thickening)", () => {
  it("returns same mask when radius is 0", () => {
    const m = new Uint8Array([0, 1, 0]);
    expect(dilateMask(m, 3, 1, 0)).toBe(m);
  });

  it("thickens a single pixel into a 3x3 square at r=1", () => {
    const m = new Uint8Array(9);
    m[4] = 1;
    expect(Array.from(dilateMask(m, 3, 3, 1))).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("grows monotonically with radius", () => {
    const w = 11, h = 11;
    const m = new Uint8Array(w * h);
    m[5 * w + 5] = 1;
    const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
    expect(count(dilateMask(m, w, h, 1))).toBeLessThan(count(dilateMask(m, w, h, 2)));
    expect(count(dilateMask(m, w, h, 2))).toBeLessThan(count(dilateMask(m, w, h, 3)));
  });
});

describe("computeBBox", () => {
  it("returns null for an empty mask", () => {
    expect(computeBBox(new Uint8Array(16), 4, 4)).toBeNull();
  });

  it("computes a tight bbox", () => {
    const m = new Uint8Array(16);
    m[1 * 4 + 1] = 1;
    m[3 * 4 + 2] = 1;
    expect(computeBBox(m, 4, 4)).toEqual({ minX: 1, minY: 1, maxX: 2, maxY: 3 });
  });
});

describe("isBlankMask", () => {
  it("flags empty and near-empty masks", () => {
    expect(isBlankMask(new Uint8Array(100))).toBe(true);
    const m = new Uint8Array(100);
    m[0] = 1; m[1] = 1;
    expect(isBlankMask(m, 20)).toBe(true);
  });

  it("does not flag populated masks", () => {
    expect(isBlankMask(new Uint8Array(100).fill(1))).toBe(false);
  });
});

describe("processPixels (pure pipeline)", () => {
  it("normalizes a diagonal stroke into a thicker cropped region", () => {
    const w = 20, h = 20;
    const px = makePixels(w, h, (x, y) => x === y && x >= 5 && x <= 14);
    const { mask, bbox } = processPixels(px, w, h, {
      threshold: 160, boldness: 2, trim: true, padding: 0,
    });
    expect(isBlankMask(mask)).toBe(false);
    expect(bbox.minX).toBeLessThanOrEqual(3);
    expect(bbox.maxX).toBeGreaterThanOrEqual(14);
  });

  it("treats colors identically (format-agnostic)", () => {
    const w = 10, h = 10;
    const inkAt = (x: number, y: number) => x >= 2 && x <= 7 && y === 5;
    const black = buildInkMask(makePixels(w, h, inkAt, [0, 0, 0]), w, h, 160);
    const blue = buildInkMask(makePixels(w, h, inkAt, [20, 40, 200]), w, h, 160);
    const red = buildInkMask(makePixels(w, h, inkAt, [200, 20, 20]), w, h, 160);
    expect(Array.from(blue)).toEqual(Array.from(black));
    expect(Array.from(red)).toEqual(Array.from(black));
  });

  it("throws typed blank_signature error for empty images", () => {
    const w = 10, h = 10;
    const px = makePixels(w, h, () => false);
    try {
      processPixels(px, w, h, { threshold: 160, boldness: 0, trim: true, padding: 0 });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SignatureError);
      expect((err as SignatureError).code).toBe("blank_signature");
      expect((err as SignatureError).hint).toBeDefined();
    }
  });
});

describe("validateImageFile (typed error contract)", () => {
  const mkFile = (size: number, type: string, name = "x") => {
    const blob = new Blob([new Uint8Array(size)], { type });
    return new File([blob], name, { type });
  };

  it("accepts a normal PNG", () => {
    expect(validateImageFile(mkFile(1024, "image/png"))).toBeNull();
  });

  it("returns SignatureError with code=empty_file", () => {
    const err = validateImageFile(mkFile(0, "image/png"));
    expect(err?.code).toBe("empty_file");
  });

  it("returns SignatureError with code=not_image", () => {
    expect(validateImageFile(mkFile(100, "application/pdf"))?.code).toBe("not_image");
    expect(validateImageFile(mkFile(100, "", "x.txt"))?.code).toBe("not_image");
  });

  it("returns SignatureError with code=unsupported_mime for unrecognized image types", () => {
    expect(validateImageFile(mkFile(100, "image/x-icon"))?.code).toBe("unsupported_mime");
  });

  it("returns code=needs_conversion for HEIC/TIFF/AVIF (by MIME or extension)", () => {
    expect(validateImageFile(mkFile(100, "image/heic"))?.code).toBe("needs_conversion");
    expect(validateImageFile(mkFile(100, "image/tiff"))?.code).toBe("needs_conversion");
    expect(validateImageFile(mkFile(100, "image/avif"))?.code).toBe("needs_conversion");
    // Extension fallback when browser reports no MIME
    expect(validateImageFile(mkFile(100, "", "photo.HEIC"))?.code).toBe("needs_conversion");
    expect(validateImageFile(mkFile(100, "", "scan.tif"))?.code).toBe("needs_conversion");
    // Hint must explain the fix
    expect(validateImageFile(mkFile(100, "image/heic"))?.hint).toMatch(/PNG|JPG/i);
  });

  it("returns code=too_large past the size cap", () => {
    expect(validateImageFile(mkFile(MAX_FILE_BYTES + 1, "image/png"))?.code).toBe(
      "too_large",
    );
  });

  it("errors are JSON-serializable for transport", () => {
    const err = validateImageFile(mkFile(0, "image/png"))!;
    const json = err.toJSON();
    expect(json.code).toBe("empty_file");
    expect(typeof json.message).toBe("string");
  });
});
