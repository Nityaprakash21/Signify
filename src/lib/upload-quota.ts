// Client-side throttle + per-session quota for uploads.
//
// NOTE: This is browser-side only. The app has no auth/backend, so true
// per-user enforcement is impossible. These limits protect the user's
// own tab from runaway processing (e.g. dragging 50 files at once).
//
// If a real backend is added later, mirror this contract server-side
// keyed on the authenticated user ID.

import { SignatureError } from "./signature-errors";

export interface QuotaConfig {
  /** Min ms between two consecutive uploads. */
  minIntervalMs: number;
  /** Max uploads in any rolling `windowMs` window. */
  maxInWindow: number;
  windowMs: number;
  /** Hard cap on total uploads per browser session. */
  sessionMax: number;
}

export const DEFAULT_QUOTA: QuotaConfig = {
  minIntervalMs: 750,
  maxInWindow: 10,
  windowMs: 60_000,
  sessionMax: 200,
};

export class UploadQuota {
  private timestamps: number[] = [];
  private total = 0;
  constructor(
    private cfg: QuotaConfig = DEFAULT_QUOTA,
    private now: () => number = () => Date.now(),
  ) {}

  /** Throws SignatureError if blocked, otherwise records the upload. */
  consume(): void {
    const t = this.now();
    this.timestamps = this.timestamps.filter((ts) => t - ts < this.cfg.windowMs);

    if (this.total >= this.cfg.sessionMax) {
      throw new SignatureError(
        "quota_exceeded",
        `Upload limit reached for this session (${this.cfg.sessionMax}). Reload the page to reset.`,
        { details: { sessionMax: this.cfg.sessionMax } },
      );
    }

    const last = this.timestamps[this.timestamps.length - 1];
    if (last !== undefined && t - last < this.cfg.minIntervalMs) {
      const waitMs = this.cfg.minIntervalMs - (t - last);
      throw new SignatureError(
        "rate_limited",
        "You're uploading too fast — please wait a moment.",
        { hint: `Try again in ${Math.ceil(waitMs / 100) / 10}s.`, details: { waitMs } },
      );
    }

    if (this.timestamps.length >= this.cfg.maxInWindow) {
      const oldest = this.timestamps[0];
      const waitMs = this.cfg.windowMs - (t - oldest);
      throw new SignatureError(
        "rate_limited",
        `Upload rate limit hit (${this.cfg.maxInWindow}/${Math.round(this.cfg.windowMs / 1000)}s).`,
        { hint: `Try again in ${Math.ceil(waitMs / 1000)}s.`, details: { waitMs } },
      );
    }

    this.timestamps.push(t);
    this.total++;
  }

  reset() {
    this.timestamps = [];
    this.total = 0;
  }

  get used() {
    return this.total;
  }
}
