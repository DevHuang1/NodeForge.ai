/**
 * Filesystem run repository.
 *
 * Layout (all writes atomic; audit is append-only):
 *   <baseDir>/<run-id>/
 *     run.json          full versioned document
 *     findings.json     convenience projection
 *     tests.json        convenience projection
 *     evidence.json     convenience projection
 *     stages.json       convenience projection
 *     artifacts/        bounded, redacted payloads
 *     audit.jsonl       append-only audit trail for this run
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  ArtifactRecord,
  AuditEvent,
  RunIndexEntry,
  RunRepository,
  VerificationRun,
} from "../core/contracts.js";
import { ErrorCode, EngineError } from "../core/errors.js";
import { atomicWriteFile, sha256Hex } from "../utils/misc.js";
import { validateRunDocument } from "./schema.js";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export class FilesystemRunRepository implements RunRepository {
  constructor(private readonly baseDir: string) {}

  private runDir(runId: string): string {
    if (!SAFE_NAME.test(runId)) {
      throw new EngineError(ErrorCode.InvalidTarget, `Invalid run id "${runId}".`);
    }
    return path.join(this.baseDir, runId);
  }

  async saveRun(run: VerificationRun): Promise<void> {
    const dir = this.runDir(run.id);
    await fs.mkdir(dir, { recursive: true });
    const json = JSON.stringify(run, null, 2);
    await atomicWriteFile(path.join(dir, "run.json"), json);
    await atomicWriteFile(path.join(dir, "findings.json"), JSON.stringify(run.findings, null, 2));
    await atomicWriteFile(path.join(dir, "tests.json"), JSON.stringify(run.testSummary ?? null, null, 2));
    await atomicWriteFile(path.join(dir, "evidence.json"), JSON.stringify(run.evidence, null, 2));
    await atomicWriteFile(path.join(dir, "stages.json"), JSON.stringify(run.stages, null, 2));
  }

  async getRun(runId: string): Promise<VerificationRun | null> {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(this.runDir(runId), "run.json"), "utf8");
    } catch {
      return null;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(raw);
    } catch (error) {
      throw new EngineError(
        ErrorCode.PersistenceFailed,
        `Stored run "${runId}" is corrupted (invalid JSON): ${(error as Error).message}`
      );
    }
    const issues = validateRunDocument(doc);
    if (issues.length > 0) {
      const detail = issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      throw new EngineError(
        ErrorCode.PersistenceFailed,
        `Stored run "${runId}" failed schema validation: ${detail}`
      );
    }
    return doc as VerificationRun;
  }

  async listRuns(limit: number): Promise<RunIndexEntry[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.baseDir);
    } catch {
      return [];
    }
    const runs: RunIndexEntry[] = [];
    for (const entry of entries) {
      if (!SAFE_NAME.test(entry)) continue;
      try {
        const raw = await fs.readFile(path.join(this.baseDir, entry, "run.json"), "utf8");
        const doc = JSON.parse(raw) as Partial<VerificationRun>;
        if (!doc.id || !doc.createdAt || !doc.status || !doc.request) continue;
        runs.push({
          id: doc.id,
          createdAt: doc.createdAt,
          status: doc.status,
          mode: doc.request.mode,
          target:
            doc.request.target.path ??
            doc.request.target.url ??
            "unknown",
          findings: Array.isArray(doc.findings) ? doc.findings.length : 0,
          testStatus: doc.testSummary?.status ?? null,
          durationMs: doc.durationMs ?? 0,
        });
      } catch {
        // unreadable/corrupt entries are skipped for listing
      }
    }
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return runs.slice(0, limit);
  }

  async saveArtifact(runId: string, name: string, content: string): Promise<ArtifactRecord> {
    if (!SAFE_NAME.test(name)) {
      throw new EngineError(ErrorCode.InvalidTarget, `Invalid artifact name "${name}".`);
    }
    const dir = this.runDir(runId);
    await fs.mkdir(path.join(dir, "artifacts"), { recursive: true });
    await atomicWriteFile(path.join(dir, "artifacts", name), content);
    return {
      id: `art-${sha256Hex(name).slice(0, 8)}`,
      kind: "log",
      name,
      byteLength: Buffer.byteLength(content, "utf8"),
      contentHash: sha256Hex(content),
    };
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    const file = path.join(this.runDir(event.runId), "audit.jsonl");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
  }

  async listAudit(runId: string | null, limit: number): Promise<AuditEvent[]> {
    if (runId !== null) {
      return readAuditFile(path.join(this.runDir(runId), "audit.jsonl"), limit);
    }
    let entries: string[];
    try {
      entries = await fs.readdir(this.baseDir);
    } catch {
      return [];
    }
    const all: AuditEvent[] = [];
    for (const entry of entries) {
      const events = await readAuditFile(path.join(this.baseDir, entry, "audit.jsonl"), Number.MAX_SAFE_INTEGER);
      all.push(...events);
    }
    all.sort((a, b) => a.at.localeCompare(b.at));
    return all.slice(-limit);
  }
}

async function readAuditFile(file: string, limit: number): Promise<AuditEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const events: AuditEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      // tolerate torn tail lines from an interrupted write
    }
  }
  return events.slice(-limit);
}
