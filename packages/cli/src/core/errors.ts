/**
 * Typed, serializable engine errors.
 *
 * Error codes are stable identifiers suitable for CI logs and audit events.
 * Messages must never include credentials or unredacted command output.
 */

import type { StageName } from "./contracts.js";

export const ErrorCode = {
  InvalidTarget: "INVALID_TARGET",
  InvalidConfig: "INVALID_CONFIG",
  MissingRuntime: "MISSING_RUNTIME",
  PolicyDenied: "POLICY_DENIED",
  Timeout: "TIMEOUT",
  ProviderUnavailable: "PROVIDER_UNAVAILABLE",
  PersistenceFailed: "PERSISTENCE_FAILED",
  RunNotFound: "RUN_NOT_FOUND",
  Cancelled: "CANCELLED",
  Internal: "INTERNAL",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class EngineError extends Error {
  readonly code: ErrorCodeValue;
  readonly stage: StageName | null;
  readonly retryable: boolean;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options: { stage?: StageName; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.stage = options.stage ?? null;
    this.retryable = options.retryable ?? false;
  }

  toJSON(): { code: string; message: string; stage: string | null; retryable: boolean } {
    return { code: this.code, message: this.message, stage: this.stage, retryable: this.retryable };
  }
}

export function isEngineError(error: unknown): error is EngineError {
  return error instanceof EngineError;
}

/** Map any thrown value to an exit code without leaking internals. */
export function exitCodeForThrown(error: unknown): number {
  if (isEngineError(error)) {
    switch (error.code) {
      case ErrorCode.InvalidTarget:
      case ErrorCode.InvalidConfig:
        return 2;
      case ErrorCode.RunNotFound:
        return 2;
      case ErrorCode.Cancelled:
        return 130;
      default:
        return 4;
    }
  }
  return 4;
}
