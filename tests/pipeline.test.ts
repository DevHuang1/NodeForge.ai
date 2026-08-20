import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import { createReviewRun, reloadReviewRun } from "../lib/review-pipeline";
import { getSamplePr } from "../lib/sample-pr";
import { evaluateRun } from "../lib/evaluation";
import { resetStore, listReviewRuns } from "../lib/persistence";
import { recordAudit, assertAuditAction } from "../lib/audit";
import { getOfflinePr, getOfflinePrList } from "../lib/github";

beforeEach(async () => {
  process.env.NODEFORGE_DATA_DIR = path.join(os.tmpdir(), `nodeforge-test-${Date.now()}`);
  await resetStore();
});

test("offline review run end-to-end produces deterministic findings and honest tests", async () => {
  const pr = getSamplePr()!;
  const run = await createReviewRun(pr, { offline: true });

  assert.equal(run.offline, true);
  assert.equal(run.status, "done");
  assert.equal(run.currentStage, "done");
  assert.ok(run.deterministicFindings.length >= 3, "deterministic findings over the raw PR");
  assert.ok(run.deterministicFindings.some((f) => f.category === "shell"));
  assert.ok(run.deterministicFindings.some((f) => f.category === "secret"));
  assert.ok(run.deterministicFindings.some((f) => f.category === "deserialize"));
  assert.ok(run.artifacts.node2?.acceptance_criteria.length ?? 0 > 0);
  assert.ok(run.artifacts.node3?.implementation.files.length ?? 0 > 0);
  assert.ok(run.artifacts.node4?.findings.length ?? 0 > 0);
  assert.equal(run.testResult?.status, "offline_sample");
  assert.equal(run.testResult?.tested, 0);
  assert.ok(run.patch && run.patch.diff.length > 0);
  assert.equal(run.patch.approved, false);
  assert.equal(run.errors.length, 0);
});

test("review run persists and reloads from history", async () => {
  const pr = getSamplePr()!;
  const run = await createReviewRun(pr, { offline: true });
  const loaded = await reloadReviewRun(run.id);
  assert.ok(loaded);
  assert.equal(loaded!.id, run.id);
  const list = await listReviewRuns();
  assert.equal(list.length, 1);
  assert.equal(list[0].findingsCount, run.deterministicFindings.length + run.modelFindings.length);
});

test("evaluation metrics stay honest for offline runs", async () => {
  const pr = getSamplePr()!;
  const run = await createReviewRun(pr, { offline: true });
  const m = evaluateRun(run);
  assert.ok(m.requirementCoverage > 0);
  assert.equal(m.testExecutionAccuracy, null);
  assert.equal(m.findingPrecision, null);
  assert.ok(m.hallucinatedClaims >= 0);
});

test("audit validates actions and records events", async () => {
  assert.throws(() => assertAuditAction("bogus.action" as never));
  const ev = await recordAudit({
    actor: "test",
    action: "finding.approve",
    entity: "review_run",
    entityId: "run-1",
    metadata: { findingId: "DET-1" },
  });
  assert.equal(ev.action, "finding.approve");
  assert.ok(ev.at.length > 0);
});

test("github module falls back to offline fixtures without a token", () => {
  const before = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  const pr = getOfflinePr();
  assert.ok(pr);
  assert.equal(pr!.owner, "acme");
  assert.equal(getOfflinePrList().length, 1);
  if (before) process.env.GITHUB_TOKEN = before;
});