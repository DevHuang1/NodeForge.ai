/**
 * Integration: guarded test execution against fake runners on PATH.
 * Proves the honest-status contract end to end: passed, failed, blocked
 * (timeout), and not_executed (missing runtime) — with matching exit codes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EXIT_CODES, exitCodeForRun } from "../../src/core/exit-codes.js";
import {
  freshSignal,
  initGitRepo,
  makeEngine,
  makeTempDir,
  writeShim,
  type EngineHarness,
} from "./helpers.js";

async function makeNpmProject(repo: string): Promise<void> {
  await fs.writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({
      name: "shimmed",
      version: "1.0.0",
      scripts: { test: "npm run real-test" },
    }),
    "utf8",
  );
}

test("passing suite via npm shim → tests passed, run completed, exit 0", async () => {
  const repo = await makeTempDir("tests-pass");
  const shimDir = await makeTempDir("shims-pass");
  await makeNpmProject(repo);
  await initGitRepo(repo);
  await writeShim(
    shimDir,
    "npm",
    'echo "Tests:       3 passed, 3 total"\nexit 0',
  );

  const harness = makeEngine({ repoDir: repo, shimDir });
  try {
    const run = await harness.engine.run({
      mode: "test",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    assert.equal(run.testSummary?.status, "passed");
    assert.equal(run.testSummary?.runner, "npm-test");
    assert.equal(run.testSummary?.discovered, 3);
    assert.equal(run.testSummary?.exitCode, 0);
    assert.equal(run.status, "completed");
    assert.equal(exitCodeForRun(run), EXIT_CODES.ok);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(shimDir, { recursive: true, force: true });
  }
});

test("failing suite via npm shim → tests failed, exit 1", async () => {
  const repo = await makeTempDir("tests-fail");
  const shimDir = await makeTempDir("shims-fail");
  await makeNpmProject(repo);
  await initGitRepo(repo);
  await writeShim(
    shimDir,
    "npm",
    'echo "Tests:       1 failed, 2 passed, 3 total"\nexit 1',
  );

  const harness = makeEngine({ repoDir: repo, shimDir });
  try {
    const run = await harness.engine.run({
      mode: "test",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    assert.equal(run.testSummary?.status, "failed");
    assert.equal(run.testSummary?.failed, 1);
    assert.equal(run.testSummary?.passed, 2);
    assert.equal(run.status, "completed_with_findings");
    assert.equal(exitCodeForRun(run), EXIT_CODES.findingsOrTestFailures);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(shimDir, { recursive: true, force: true });
  }
});

test("hanging runner killed at timeoutMs → tests blocked (not failed), exit 3", async () => {
  const repo = await makeTempDir("tests-hang");
  const shimDir = await makeTempDir("shims-hang");
  await makeNpmProject(repo);
  await initGitRepo(repo);
  await writeShim(
    shimDir,
    "npm",
    'sleep 30\necho "Tests: 1 passed, 1 total"\nexit 0',
  );

  const harness = makeEngine({
    repoDir: repo,
    shimDir,
    mutateConfig: (config) => {
      config.tests.timeoutMs = 400;
    },
  });
  try {
    const started = Date.now();
    const run = await harness.engine.run({
      mode: "test",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 10_000, `timeout kill took too long: ${elapsed}ms`);
    assert.equal(run.testSummary?.status, "blocked");
    assert.equal(run.testSummary?.timedOut, true);
    assert.equal(run.status, "blocked");
    assert.equal(exitCodeForRun(run), EXIT_CODES.blocked);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(shimDir, { recursive: true, force: true });
  }
});

test("runnerOverride pytest without python3 on PATH → discovery not_executed, run blocked, exit 3", async () => {
  const repo = await makeTempDir("tests-missing");
  const emptyDir = await makeTempDir("empty-path");
  await fs.writeFile(path.join(repo, "conftest.py"), "", "utf8");
  await fs.writeFile(
    path.join(repo, "test_app.py"),
    "def test_ok():\n    assert True\n",
    "utf8",
  );
  await initGitRepo(repo);

  // Only an empty dir on PATH: python3 is genuinely absent.
  const previousPath = process.env.PATH ?? "";
  process.env.PATH = emptyDir;
  const harness: EngineHarness = makeEngine({
    repoDir: repo,
    mutateConfig: (config) => {
      config.tests.runnerOverride = "pytest";
    },
  });
  try {
    const run = await harness.engine.run({
      mode: "test",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    assert.equal(run.testSummary, null); // execution stage never ran a command
    const discoveryStage = run.stages.find((s) => s.stage === "test_discovery");
    assert.equal(discoveryStage?.status, "not_executed");
    assert.match(discoveryStage?.reason ?? "", /pytest/);
    assert.equal(run.status, "blocked");
    assert.equal(exitCodeForRun(run), EXIT_CODES.blocked);
  } finally {
    process.env.PATH = previousPath;
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(emptyDir, { recursive: true, force: true });
  }
});
