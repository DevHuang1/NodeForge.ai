/**
 * Integration: scan mode against real fixture repositories on disk.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { exitCodeForRun } from "../../src/core/exit-codes.js";
import {
  freshSignal,
  initGitRepo,
  makeEngine,
  makeTempDir,
  writeCleanProject,
  writeVulnerableProject,
} from "./helpers.js";

test("scan flags all six rule categories in a vulnerable project and persists the run", async () => {
  const repo = await makeTempDir("vuln");
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

    assert.equal(run.status, "completed_with_findings");
    assert.equal(exitCodeForRun(run), 1);

    const categories = new Set(run.findings.map((f) => f.ruleId));
    for (const rule of [
      "NF-SECRET",
      "NF-SHELL",
      "NF-SUBPROCESS",
      "NF-DESER",
      "NF-NET",
      "NF-FS",
    ]) {
      assert.ok(categories.has(rule), `expected a ${rule} finding`);
    }
    // Findings are sorted by severity then path; ids are stable NF-001…
    assert.equal(run.findings[0]!.id, "NF-001");

    // Persisted to disk with the documented layout.
    const runDir = path.join(repo, ".nodeforge", "runs", run.id);
    const runDoc = JSON.parse(
      await fs.readFile(path.join(runDir, "run.json"), "utf8"),
    ) as {
      id: string;
      status: string;
      findings: unknown[];
    };
    assert.equal(runDoc.id, run.id);
    assert.equal(runDoc.status, "completed_with_findings");
    assert.equal(runDoc.findings.length, run.findings.length);
    await fs.access(path.join(runDir, "findings.json"));
    await fs.access(path.join(runDir, "stages.json"));
    await fs.access(path.join(runDir, "audit.jsonl"));
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("scan of a clean project completes with zero findings and exit code 0", async () => {
  const repo = await makeTempDir("clean");
  await writeCleanProject(repo);

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
    assert.equal(run.status, "completed");
    assert.equal(run.findings.length, 0);
    assert.equal(exitCodeForRun(run), 0);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("dry-run scan synthesizes status but writes nothing to disk", async () => {
  const repo = await makeTempDir("dry");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);

  const harness = makeEngine({ repoDir: repo });
  try {
    const run = await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: true,
      signal: freshSignal(),
    });
    assert.equal(run.status, "completed_with_findings");
    assert.ok(run.findings.length > 0);
    const runsDir = path.join(repo, ".nodeforge", "runs");
    await assert.rejects(fs.access(runsDir));
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("review of a nonexistent path fails fast with InvalidTarget", async () => {
  const repo = await makeTempDir("missing");
  const harness = makeEngine({ repoDir: repo });
  try {
    await assert.rejects(
      harness.engine.run({
        mode: "review",
        targetInput: path.join(repo, "does-not-exist"),
        cwd: repo,
        config: harness.config,
        dryRun: false,
        signal: freshSignal(),
      }),
      (error: Error) =>
        /neither an existing directory nor a git ref/.test(error.message),
    );
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});
