import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  Finding,
  RunStatus,
  TestSummary,
  VerificationRun,
} from "../../src/core/contracts.js";
import {
  exitCodeForRun,
  exitCodeForRunStatus,
  exitCodeForTestSummary,
} from "../../src/core/exit-codes.js";

function makeFinding(index: number): Finding {
  return {
    id: `NF-${String(index).padStart(3, "0")}`,
    ruleId: "NF-FS",
    category: "filesystem",
    severity: "high",
    description: "World-writable permissions.",
    message: "chmod 777 used.",
    filePath: "src/run.sh",
    startLine: index,
    endLine: index,
    confidence: "medium",
    recommendedAction: "Restrict permissions.",
    source: "deterministic",
    evidenceIds: [],
    fingerprint: `fp-${index}`,
  };
}

function makeRun(status: RunStatus, findingsCount: number): VerificationRun {
  return {
    id: "run-1",
    schemaVersion: 1,
    status,
    request: {
      mode: "scan",
      target: { kind: "local", path: "/repos/demo" },
      correlationId: "corr-1",
      requestedBy: "tester",
      dryRun: false,
      configFingerprint: "abcdef0123456789",
    },
    repository: {
      root: "/repos/demo",
      ref: null,
      commitSha: null,
      remoteUrl: null,
      pullRequest: null,
      changedFiles: [],
      fileCount: 0,
      truncated: false,
      notes: [],
    },
    capabilities: {
      languages: [],
      packageManagers: [],
      frameworks: [],
      testRunners: [],
      notes: [],
    },
    stages: [],
    findings: Array.from({ length: findingsCount }, (_, i) => makeFinding(i + 1)),
    testSummary: null,
    analysis: null,
    evidence: [],
    artifacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    durationMs: 0,
    nodeforgeVersion: "0.1.0",
  };
}

function makeSummary(status: TestSummary["status"]): TestSummary {
  return {
    status,
    runner: "jest",
    command: ["npm", "test"],
    discovered: 8,
    passed: 5,
    failed: 1,
    skipped: 2,
    blocked: 0,
    durationMs: 100,
    exitCode: 0,
    signal: null,
    timedOut: false,
    reason: "",
    stdoutExcerpt: "",
    stderrExcerpt: "",
    evidenceIds: [],
    networkPolicy: "denied",
    networkEnforcement: "best_effort",
  };
}

test("exitCodeForRunStatus maps every terminal status", () => {
  assert.equal(exitCodeForRunStatus("completed"), 0);
  assert.equal(exitCodeForRunStatus("completed_with_findings"), 1);
  assert.equal(exitCodeForRunStatus("blocked"), 3);
  assert.equal(exitCodeForRunStatus("failed"), 4);
  assert.equal(exitCodeForRunStatus("cancelled"), 130);
});

test("exitCodeForTestSummary maps statuses and null", () => {
  assert.equal(exitCodeForTestSummary(makeSummary("passed")), 0);
  assert.equal(exitCodeForTestSummary(makeSummary("failed")), 1);
  assert.equal(exitCodeForTestSummary(makeSummary("blocked")), 3);
  assert.equal(exitCodeForTestSummary(makeSummary("not_executed")), 3);
  assert.equal(exitCodeForTestSummary(null), 3);
});

test("exitCodeForRun reports findings on a completed run as 1", () => {
  assert.equal(exitCodeForRun(makeRun("completed", 2)), 1);
});

test("exitCodeForRun lets blocked beat findings with 3", () => {
  assert.equal(exitCodeForRun(makeRun("blocked", 2)), 3);
});

test("exitCodeForRun returns 130 for cancelled even with findings", () => {
  assert.equal(exitCodeForRun(makeRun("cancelled", 2)), 130);
});
