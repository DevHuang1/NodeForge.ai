/**
 * Run synthesis: merge stage outcomes, findings, and test results into one
 * honest aggregate status. Rules (in priority order):
 *
 * 1. Internal/persistence failures make the run `failed` (exit 4).
 * 2. Cancellation stays `cancelled` (exit 130).
 * 3. Required verification that could not occur makes the run `blocked`
 *    (exit 3): `test` mode with blocked/not-executed tests, or `review` with
 *    blocked tests while tests.onBlocked === "blocked".
 * 4. Any finding or an executed test failure yields `completed_with_findings`.
 * 5. Otherwise `completed`.
 */

import type { RunStatus, VerificationRun } from "./contracts.js";
import type { NodeForgeConfig } from "../config/config.js";

const FATAL_ERROR_CODES = new Set(["INTERNAL", "PERSISTENCE_FAILED"]);

export function synthesizeStatus(run: VerificationRun, config: NodeForgeConfig): RunStatus {
  const fatal = run.stages.some((stage) => stage.errors.some((e) => FATAL_ERROR_CODES.has(e.code)));
  if (fatal) return "failed";
  if (run.status === "cancelled") return "cancelled";

  const tests = run.testSummary;
  const requiredVerificationBlocked =
    (run.request.mode === "test" &&
      (tests === null || tests.status === "blocked" || tests.status === "not_executed")) ||
    (run.request.mode === "review" &&
      config.tests.enabled &&
      tests !== null &&
      tests.status === "blocked" &&
      config.tests.onBlocked === "blocked");
  if (requiredVerificationBlocked) return "blocked";

  if (run.findings.length > 0 || tests?.status === "failed") return "completed_with_findings";
  return "completed";
}
