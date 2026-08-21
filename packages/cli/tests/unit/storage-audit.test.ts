import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AuditEvent,
  Finding,
  RunRepository,
  VerificationRun,
} from "../../src/core/contracts.js";
import { ErrorCode, EngineError } from "../../src/core/errors.js";
import { MemoryRunRepository } from "../../src/storage/memory.js";
import { FilesystemRunRepository } from "../../src/storage/filesystem.js";

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

function makeRun(id: string, createdAt: string): VerificationRun {
  return {
    id,
    schemaVersion: 1,
    status: "completed",
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
    findings: [makeFinding(1), makeFinding(2)],
    testSummary: null,
    analysis: null,
    evidence: [],
    artifacts: [],
    createdAt,
    completedAt: null,
    durationMs: 0,
    nodeforgeVersion: "0.1.0",
  };
}

function makeEvent(runId: string, at: string, n: number): AuditEvent {
  return {
    id: `evt-${n}`,
    runId,
    at,
    actor: "test-actor",
    action: "stage.started",
    stage: "prepare",
    outcome: "ok",
    metadata: { n },
  };
}

async function exerciseRepository(repo: RunRepository): Promise<void> {
  await repo.saveRun(makeRun("run-a", "2026-01-01T00:00:00.000Z"));
  await repo.saveRun(makeRun("run-b", "2026-02-01T00:00:00.000Z"));

  const got = await repo.getRun("run-a");
  assert.ok(got);
  assert.equal(got.id, "run-a");
  assert.equal(got.findings.length, 2);
  assert.equal(await repo.getRun("does-not-exist"), null);

  const listed = await repo.listRuns(10);
  assert.deepEqual(
    listed.map((r) => r.id),
    ["run-b", "run-a"]
  );

  await repo.appendAudit(makeEvent("run-a", "2026-01-01T00:00:01.000Z", 1));
  await repo.appendAudit(makeEvent("run-a", "2026-01-01T00:00:02.000Z", 2));
  await repo.appendAudit(makeEvent("run-b", "2026-02-01T00:00:01.000Z", 3));

  const forRunA = await repo.listAudit("run-a", 10);
  assert.deepEqual(
    forRunA.map((e) => e.id),
    ["evt-1", "evt-2"]
  );

  const all = await repo.listAudit(null, 10);
  assert.deepEqual(
    all.map((e) => e.id),
    ["evt-1", "evt-2", "evt-3"]
  );
}

test("MemoryRunRepository roundtrips runs, lists newest-first, and keeps audit order", async () => {
  await exerciseRepository(new MemoryRunRepository());
});

test("FilesystemRunRepository roundtrips runs, lists newest-first, and keeps audit order", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  await exerciseRepository(new FilesystemRunRepository(dir));
});

test("FilesystemRunRepository.getRun throws PersistenceFailed on corrupted run.json", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  await fs.promises.mkdir(path.join(dir, "badrun"), { recursive: true });
  await fs.promises.writeFile(path.join(dir, "badrun", "run.json"), "{ broken", "utf8");

  const repo = new FilesystemRunRepository(dir);
  let caught: unknown;
  try {
    await repo.getRun("badrun");
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof EngineError);
  assert.equal((caught as EngineError).code, ErrorCode.PersistenceFailed);
});

test("saveRun rejects run ids containing path separators", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const repo = new FilesystemRunRepository(dir);
  await assert.rejects(
    () => repo.saveRun(makeRun("../evil", "2026-01-01T00:00:00.000Z")),
    EngineError
  );
});
