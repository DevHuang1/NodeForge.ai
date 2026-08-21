/**
 * Run and stage state machines.
 *
 * Transitions are validated so a cancelled or failed run can never be
 * re-marked as completed by a late adapter callback.
 */

import type { RunStatus, StageName, VerificationStatus } from "./contracts.js";

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["completed", "completed_with_findings", "blocked", "failed", "cancelled"],
  completed: [],
  completed_with_findings: [],
  blocked: [],
  failed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string
  ) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export function transitionRun(run: { status: RunStatus }, to: RunStatus): void {
  if (!canTransitionRun(run.status, to)) {
    throw new InvalidTransitionError("run", run.status, to);
  }
  run.status = to;
}

const TERMINAL_STAGE_STATUSES: readonly VerificationStatus[] = [
  "passed",
  "failed",
  "blocked",
  "not_executed",
  "skipped",
];

export function isTerminalStageStatus(status: VerificationStatus): boolean {
  return TERMINAL_STAGE_STATUSES.includes(status);
}

/** Stages whose failure should halt downstream stages entirely. */
export const BLOCKING_STAGE_FAILURES: readonly StageName[] = ["prepare", "context", "persistence"];

/**
 * Decide whether the engine may continue after `stage` finished with `status`.
 * Context failures degrade (PR metadata missing) rather than abort unless no
 * files could be collected at all — enforced by the caller via snapshot checks.
 */
export function mayContinueAfterStage(stage: StageName, status: VerificationStatus): boolean {
  if (status === "passed" || status === "skipped") return true;
  if (status === "not_executed") return true;
  if (status === "blocked") return stage !== "prepare" && stage !== "persistence";
  // failed
  return !BLOCKING_STAGE_FAILURES.includes(stage);
}
