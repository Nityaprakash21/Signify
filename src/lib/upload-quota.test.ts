import { describe, it, expect } from "vitest";
import { UploadQuota } from "./upload-quota";
import { SignatureError } from "./signature-errors";

describe("UploadQuota", () => {
  it("allows the first upload", () => {
    const q = new UploadQuota();
    expect(() => q.consume()).not.toThrow();
    expect(q.used).toBe(1);
  });

  it("rate-limits consecutive uploads inside minIntervalMs", () => {
    let t = 1_000;
    const q = new UploadQuota(
      { minIntervalMs: 500, maxInWindow: 100, windowMs: 60_000, sessionMax: 1000 },
      () => t,
    );
    q.consume();
    t += 100;
    try {
      q.consume();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SignatureError);
      expect((err as SignatureError).code).toBe("rate_limited");
      expect((err as SignatureError).hint).toMatch(/Try again/);
    }
  });

  it("allows again after the interval elapses", () => {
    let t = 0;
    const q = new UploadQuota(
      { minIntervalMs: 500, maxInWindow: 100, windowMs: 60_000, sessionMax: 1000 },
      () => t,
    );
    q.consume();
    t += 600;
    expect(() => q.consume()).not.toThrow();
  });

  it("enforces a rolling window cap", () => {
    let t = 0;
    const q = new UploadQuota(
      { minIntervalMs: 0, maxInWindow: 3, windowMs: 1000, sessionMax: 100 },
      () => t,
    );
    for (let i = 0; i < 3; i++) {
      q.consume();
      t += 100;
    }
    try {
      q.consume();
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SignatureError).code).toBe("rate_limited");
    }
    t += 2000; // window expires
    expect(() => q.consume()).not.toThrow();
  });

  it("enforces a hard session cap with quota_exceeded", () => {
    let t = 0;
    const q = new UploadQuota(
      { minIntervalMs: 0, maxInWindow: 1000, windowMs: 60_000, sessionMax: 2 },
      () => t,
    );
    q.consume();
    t += 1;
    q.consume();
    t += 1;
    try {
      q.consume();
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SignatureError).code).toBe("quota_exceeded");
    }
  });
});
