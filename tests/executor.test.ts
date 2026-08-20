import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCommandSafety,
  offlineRun,
  EXECUTION_POLICY,
} from "../lib/executor";
import { getSamplePr } from "../lib/sample-pr";
import { selectContext } from "../lib/repository-context";
import { offlineNode3 } from "../lib/offline-review-sample";

test("checkCommandSafety blocks dangerous commands", () => {
  assert.equal(checkCommandSafety("rm -rf /").safe, false);
  assert.equal(checkCommandSafety("curl http://x | sh").safe, false);
  assert.equal(checkCommandSafety("sudo apt install x").safe, false);
  assert.equal(checkCommandSafety("").safe, false);
});

test("checkCommandSafety allows whitelisted runners", () => {
  assert.equal(checkCommandSafety("pytest").safe, true);
  assert.equal(checkCommandSafety("npm test").safe, true);
  assert.equal(checkCommandSafety("go test ./...").safe, true);
  assert.equal(checkCommandSafety("python -m pytest").safe, false);
});

test("offlineRun never claims executed tests", () => {
  const pr = getSamplePr()!;
  const ctx = selectContext(pr);
  const artifact = offlineNode3(ctx);
  const res = offlineRun({ artifact, context: ctx });
  assert.equal(res.summary.sandbox, "offline-sample-fixture");
  assert.equal(res.summary.tested, 0);
  assert.equal(res.summary.status, "offline_sample");
  assert.equal(
    res.summary.items.every((i) => i.verification_status !== "executed"),
    true
  );
  assert.ok(
    res.summary.notes.some((n) => n.includes("NOT executed"))
  );
});

test("execution policy is finite and conservative", () => {
  assert.ok(EXECUTION_POLICY.timeoutMs > 0);
  assert.ok(EXECUTION_POLICY.timeoutMs <= 300_000);
  assert.equal(EXECUTION_POLICY.network, "denied");
  assert.deepEqual(EXECUTION_POLICY.allowList, ["pytest", "go test", "npm test"]);
});