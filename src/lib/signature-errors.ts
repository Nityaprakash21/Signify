// Typed error contract for the signature processing pipeline.
// Every failure path produces a SignatureError so the UI can render
// a consistent message + actionable hint.

export type SignatureErrorCode =
  | "empty_file"
  | "not_image"
  | "unsupported_mime"
  | "needs_conversion" // HEIC/TIFF/AVIF — browser can't decode reliably
  | "too_large"
  | "dimensions_too_large"
  | "decode_failed"
  | "blank_signature"
  | "canvas_unavailable"
  | "encode_failed"
  | "rate_limited"
  | "quota_exceeded";

export interface SignatureErrorJSON {
  code: SignatureErrorCode;
  message: string;
  hint?: string;
  details?: Record<string, string | number>;
}

export class SignatureError extends Error {
  readonly code: SignatureErrorCode;
  readonly userMessage: string;
  readonly hint?: string;
  readonly details?: Record<string, string | number>;

  constructor(
    code: SignatureErrorCode,
    userMessage: string,
    opts?: { hint?: string; details?: Record<string, string | number>; cause?: unknown },
  ) {
    super(userMessage, opts?.cause ? { cause: opts.cause } : undefined);
    this.name = "SignatureError";
    this.code = code;
    this.userMessage = userMessage;
    this.hint = opts?.hint;
    this.details = opts?.details;
  }

  toJSON(): SignatureErrorJSON {
    return {
      code: this.code,
      message: this.userMessage,
      hint: this.hint,
      details: this.details,
    };
  }
}

/** Normalize any thrown value into a SignatureError. */
export function toSignatureError(err: unknown): SignatureError {
  if (err instanceof SignatureError) return err;
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Could not process this image. Try another file.";
  return new SignatureError("decode_failed", message, { cause: err });
}
