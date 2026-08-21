/**
 * Integration: the CLI surface itself — argument validation, exit-code
 * mapping, report/audit/init/doctor flows through main(argv).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { main } from "../../src/cli.js";
import {
  freshSignal,
  initGitRepo,
  makeEngine,
  makeTempDir,
  writeVulnerableProject,
} from "./helpers.js";

interface Captured {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run main(args) inside repoDir with stdout/stderr/exit code captured. */
async function runCli(args: string[], repoDir: string): Promise<Captured> {
  const previousCwd = process.cwd();
  const previousExitCode = process.exitCode;
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: (c: string) => boolean }).write = (
    c: string,
  ) => {
    chunks.push(c);
    return true;
  };
  (process.stderr as unknown as { write: (c: string) => boolean }).write = (
    c: string,
  ) => {
    errChunks.push(c);
    return true;
  };
  try {
    process.chdir(repoDir);
    process.exitCode = 0;
    await main(args);
    return {
      stdout: chunks.join(""),
      stderr: errChunks.join(""),
      code: process.exitCode ?? 0,
    };
  } finally {
    (process.stdout as unknown as { write: (c: string) => boolean }).write =
      origOut;
    (process.stderr as unknown as { write: (c: string) => boolean }).write =
      origErr;
    process.chdir(previousCwd);
    process.exitCode = previousExitCode;
  }
}

test("unknown option maps to exit code 2", async () => {
  const repo = await makeTempDir("cli-unknown");
  try {
    const captured = await runCli(["--bogus-flag"], repo);
    assert.equal(captured.code, 2);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("--version prints once and exits 0", async () => {
  const repo = await makeTempDir("cli-version");
  try {
    const captured = await runCli(["--version"], repo);
    assert.equal(captured.code, 0);
    assert.equal(captured.stdout.match(/^[0-9]+\.[0-9]+\.[0-9]+$/gm)?.length, 1);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("--help exits 0 without an error re-print", async () => {
  const repo = await makeTempDir("cli-help");
  try {
    const captured = await runCli(["--help"], repo);
    assert.equal(captured.code, 0);
    assert.match(captured.stdout, /Usage:/);
    assert.doesNotMatch(captured.stderr, /error|Exit code/i);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("review of a nonexistent target maps to exit code 2 with a redacted message", async () => {
  const repo = await makeTempDir("cli-missing");
  try {
    const captured = await runCli(["review", "./no-such-dir"], repo);
    assert.equal(captured.code, 2);
    assert.match(
      captured.stderr,
      /neither an existing directory nor a git ref/,
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("scan then `report latest --format json` round-trips findings through disk", async () => {
  const repo = await makeTempDir("cli-report");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);
  const harness = makeEngine({ repoDir: repo });
  try {
    // Produce a stored run first.
    await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });

    const captured = await runCli(["report", "latest", "--format", "json"], repo);
    assert.equal(captured.code, 0);
    const parsed = JSON.parse(captured.stdout) as {
      id: string;
      status: string;
      findings: Array<{ ruleId: string }>;
    };
    assert.match(parsed.id, /^run-/);
    assert.equal(parsed.status, "completed_with_findings");
    assert.ok(parsed.findings.length >= 6);

    // SARIF rendering of the same stored run.
    const sarif = await runCli(["report", "latest", "--format", "sarif"], repo);
    assert.equal(sarif.code, 0);
    const sarifLog = JSON.parse(sarif.stdout) as {
      version: string;
      runs: Array<{ results: unknown[] }>;
    };
    assert.equal(sarifLog.version, "2.1.0");
    assert.equal(sarifLog.runs[0]!.results.length, parsed.findings.length);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("audit latest prints the timestamped trail and exits 0", async () => {
  const repo = await makeTempDir("cli-audit");
  await writeVulnerableProject(repo);
  await initGitRepo(repo);
  const harness = makeEngine({ repoDir: repo });
  try {
    await harness.engine.run({
      mode: "scan",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    const captured = await runCli(["audit", "latest"], repo);
    assert.equal(captured.code, 0);
    assert.match(captured.stdout, /run\.created/);
    assert.match(captured.stdout, /run\.persisted/);
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("init scaffolds config; refuses overwrite without --force; --force succeeds", async () => {
  const repo = await makeTempDir("cli-init");
  try {
    const first = await runCli(["init"], repo);
    assert.equal(first.code, 0);
    const configText = await fs.readFile(
      path.join(repo, ".nodeforge", "config.json"),
      "utf8",
    );
    const parsed = JSON.parse(configText) as {
      $schema?: string;
      storage: { dir: string };
    };
    assert.equal(parsed.$schema, "./config.schema.json");
    await fs.access(path.join(repo, ".nodeforge", "config.schema.json"));

    const second = await runCli(["init"], repo);
    assert.equal(second.code, 2);

    const forced = await runCli(["init", "--force"], repo);
    assert.equal(forced.code, 0);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("doctor completes with exit 0 in a healthy environment", async () => {
  const repo = await makeTempDir("cli-doctor");
  try {
    const captured = await runCli(["doctor"], repo);
    assert.equal(captured.code, 0);
    assert.match(captured.stdout, /nodeforge/);
    assert.ok(
      !/AKIA|sk-/.test(captured.stdout),
      "doctor must never print secret values",
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});
