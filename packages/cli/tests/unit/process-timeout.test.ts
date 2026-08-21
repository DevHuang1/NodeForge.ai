import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { DEFAULT_POLICY } from "../../src/core/policy.js";
import { runProcess } from "../../src/executors/process.js";

test("runProcess enforces the timeout on a sleeping process", { skip: process.platform === "win32" }, async () => {
  const result = await runProcess(
    {
      executable: "sleep",
      args: ["5"],
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 250,
    },
    DEFAULT_POLICY
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  assert.ok(result.durationMs < 3000);
});

test("runProcess captures stdout of a fast successful command", { skip: process.platform === "win32" }, async () => {
  const result = await runProcess(
    {
      executable: "echo",
      args: ["hello"],
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 10_000,
    },
    DEFAULT_POLICY
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.ok(result.stdout.includes("hello"));
});
