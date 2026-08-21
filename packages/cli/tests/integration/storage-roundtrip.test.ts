/**
 * Integration: storage round-trips, corruption handling, and run listing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ErrorCode, EngineError } from "../../src/core/errors.js";
import {
  freshSignal,
  initGitRepo,
  makeEngine,
  makeTempDir,
  writeVulnerableProject,
} from "./helpers.js";

test("getRun returns the persisted run; listRuns is newest-first", async () => {
  const repo = await makeTempDir("storage-list");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);
  const harness = makeEngine({ repoDir: repo });
  try {
    const first = await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    // Ensure distinct ids and ordering even within the same millisecond.
    const second = await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    assert.notEqual(first.id, second.id);

    const loaded = await harness.repository.getRun(second.id);
    assert.ok(loaded);
    assert.equal(loaded!.id, second.id);
    assert.equal(loaded!.findings.length, second.findings.length);
    assert.equal(loaded!.stages.length, second.stages.length);

    const runs = await harness.repository.listRuns(10);
    assert.ok(runs.length >= 2);
    assert.equal(runs[0]!.id, second.id);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("corrupted run.json raises PersistenceFailed instead of lying", async () => {
  const repo = await makeTempDir("storage-corrupt");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);
  const harness = makeEngine({ repoDir: repo });
  try {
    const run = await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    const runJsonPath = path.join(
      repo,
      ".nodeforge",
      "runs",
      run.id,
      "run.json",
    );
    await fs.writeFile(runJsonPath, "{ this is not json", "utf8");

    try {
      await harness.repository.getRun(run.id);
      assert.fail("expected getRun to throw");
    } catch (error) {
      assert.ok(error instanceof EngineError);
      assert.equal((error as EngineError).code, ErrorCode.PersistenceFailed);
    }
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("audit trail survives to disk as JSONL with one event per line", async () => {
  const repo = await makeTempDir("storage-audit");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);
  const harness = makeEngine({ repoDir: repo });
  try {
    const run = await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    const auditText = await fs.readFile(
      path.join(repo, ".nodeforge", "runs", run.id, "audit.jsonl"),
      "utf8",
    );
    const lines = auditText.trim().split("\n");
    assert.ok(lines.length >= 3);
    for (const line of lines) {
      const event = JSON.parse(line) as { at: string; action: string };
      assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(event.action.length > 0);
    }
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});
