// Performance budget for the signature pipeline. Runs in CI to catch
// regressions where a refactor accidentally makes processing 5x slower
// or balloons memory usage on large images.
//
// We test the pure `processPixels` pipeline on a synthetic 2000x2000
// image (~16M pixels — matches the MAX downscaled working size of the
// real DOM pipeline).

import { describe, it, expect } from "vitest";
import { processPixels } from "./signature-processor";

const W = 2000;
const H = 2000;

// Budget: a top-end laptop processes ~25-150ms; CI runners are slower
// and noisier so we set a generous ceiling that still catches order-of-
// magnitude regressions.
const TIME_BUDGET_MS = 2500;
// Memory budget: working buffers (one RGBA + two Uint8Array masks) plus
// transient JS overhead. RGBA alone is 16MB; allow 80MB of headroom.
const HEAP_BUDGET_BYTES = 80 * 1024 * 1024;

function buildSyntheticPixels(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  // White background
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
  }
  // Draw a diagonal black "signature" stroke covering ~the middle
  for (let k = 0; k < w; k++) {
    const x = k;
    const y = Math.floor(h / 2 + Math.sin(k / 40) * 60);
    for (let dy = -3; dy <= 3; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const i = (yy * w + x) * 4;
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0;
    }
  }
  return buf;
}

function heapBytes(): number | null {
  // Node exposes process.memoryUsage; browsers don't expose this reliably.
  const mu = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } })
    .process?.memoryUsage;
  return mu ? mu().heapUsed : null;
}

describe("performance budget", () => {
  it(`processes ${W}x${H} within ${TIME_BUDGET_MS}ms`, () => {
    const pixels = buildSyntheticPixels(W, H);

    if (typeof globalThis.gc === "function") globalThis.gc();
    const heapBefore = heapBytes();

    const start = performance.now();
    const { bbox } = processPixels(pixels, W, H, {
      threshold: 160, boldness: 2, trim: true, padding: 24,
    });
    const elapsed = performance.now() - start;

    const heapAfter = heapBytes();
    const heapDelta = heapBefore !== null && heapAfter !== null
      ? heapAfter - heapBefore
      : null;

    // Make the numbers visible in CI logs
    console.log(
      `[perf] ${W}x${H}: ${elapsed.toFixed(1)}ms` +
        (heapDelta !== null ? ` | heap Δ ${(heapDelta / 1024 / 1024).toFixed(1)} MB` : ""),
    );

    expect(bbox.maxX).toBeGreaterThan(bbox.minX);
    expect(elapsed).toBeLessThan(TIME_BUDGET_MS);

    if (heapDelta !== null) {
      // Allow negative deltas (GC ran); only fail on excessive growth.
      expect(heapDelta).toBeLessThan(HEAP_BUDGET_BYTES);
    }
  }, 10_000);
});
