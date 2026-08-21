import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunStatus } from "../../src/core/contracts.js";
import {
  InvalidTransitionError,
  isTerminalStageStatus,
  mayContinueAfterStage,
  transitionRun,
} from "../../src/core/state-machine.js";

test("transitionRun allows queued -> running -> completed_with_findings", () => {
  const run = { status: "queued" as RunStatus };
  transitionRun(run, "running");
  assert.equal(run.status, "running");
  transitionRun(run, "completed_with_findings");
  assert.equal(run.status, "completed_with_findings");
});

test("transitionRun rejects running -> queued", () => {
  const run = { status: "running" as RunStatus };
  assert.throws(() => transitionRun(run, "queued"), InvalidTransitionError);
  assert.equal(run.status, "running");
});

test("terminal states reject further transitions", () => {
  const terminals: RunStatus[] = [
    "completed",
    "completed_with_findings",
    "blocked",
    "failed",
    "cancelled",
  ];
  for (const terminal of terminals) {
    const run = { status: terminal };
    assert.throws(() => transitionRun(run, "running"), InvalidTransitionError);
    assert.throws(() => transitionRun(run, "failed"), InvalidTransitionError);
    assert.equal(run.status, terminal);
  }
});

test("mayContinueAfterStage blocks prepare and persistence failures", () => {
  assert.equal(mayContinueAfterStage("prepare", "failed"), false);
  assert.equal(mayContinueAfterStage("deterministic_scan", "failed"), true);
  assert.equal(mayContinueAfterStage("context", "blocked"), true);
  assert.equal(mayContinueAfterStage("persistence", "failed"), false);
});

test("isTerminalStageStatus basics", () => {
  assert.equal(isTerminalStageStatus("passed"), true);
  assert.equal(isTerminalStageStatus("failed"), true);
  assert.equal(isTerminalStageStatus("blocked"), true);
  assert.equal(isTerminalStageStatus("not_executed"), true);
  assert.equal(isTerminalStageStatus("skipped"), true);
});
