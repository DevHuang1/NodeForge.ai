/**
 * Centralized exit-code mapping so every CLI command behaves identically in CI.
 *
 * 0   verified success
 * 1   findings reported or executed tests failed
 * 2   invalid input or configuration
 * 3   required verification blocked or unavailable
 * 4   internal engine / persistence failure
 * 130 user cancellation (SIGINT)
 */

import type { RunStatus, TestSummary, VerificationRun } from "./contracts.js";

export const EXIT_CODES = {
  ok: 0,
  findingsOrTestFailures: 1,
  invalidInput: 2,
  blocked: 3,
  internal: 4,
  cancelled: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export function exitCodeForTestSummary(summary: TestSummary | null): ExitCode {
  if (!summary) return EXIT_CODES.blocked;
  switch (summary.status) {
    case "passed":
      return EXIT_CODES.ok;
    case "failed":
      return EXIT_CODES.findingsOrTestFailures;
    case "blocked":
    case "not_executed":
      return EXIT_CODES.blocked;
    case "skipped":
      return EXIT_CODES.blocked;
  }
}

export function exitCodeForRunStatus(status: RunStatus): ExitCode {
  switch (status) {
    case "completed":
      return EXIT_CODES.ok;
    case "completed_with_findings":
      return EXIT_CODES.findingsOrTestFailures;
    case "blocked":
      return EXIT_CODES.blocked;
    case "failed":
      return EXIT_CODES.internal;
    case "cancelled":
      return EXIT_CODES.cancelled;
    case "queued":
    case "running":
      return EXIT_CODES.internal;
  }
}

/**
 * Exit code for a full verification run. Findings and executed test failures
 * dominate; blocked required verification yields 3.
 */
export function exitCodeForRun(run: VerificationRun): ExitCode {
  if (run.status === "cancelled") return EXIT_CODES.cancelled;
  if (run.status === "failed") return EXIT_CODES.internal;
  if (run.status === "blocked") return EXIT_CODES.blocked;
  if (run.findings.length > 0) return EXIT_CODES.findingsOrTestFailures;
  if (run.testSummary && run.testSummary.status === "failed") {
    return EXIT_CODES.findingsOrTestFailures;
  }
  return exitCodeForRunStatus(run.status);
}
