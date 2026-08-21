/**
 * In-memory run repository: same contract as the filesystem backend, used in
 * tests and via storage.backend = "memory".
 */

import type {
  ArtifactRecord,
  AuditEvent,
  RunIndexEntry,
  RunRepository,
  VerificationRun,
} from "../core/contracts.js";
import { sha256Hex } from "../utils/misc.js";

export class MemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, VerificationRun>();
  private readonly artifacts = new Map<string, ArtifactRecord[]>();
  private readonly audit: AuditEvent[] = [];

  async saveRun(run: VerificationRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async getRun(id: string): Promise<VerificationRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async listRuns(limit: number): Promise<RunIndexEntry[]> {
    const entries: RunIndexEntry[] = [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        status: run.status,
        mode: run.request.mode,
        target: run.request.target.path ?? run.request.target.url ?? "unknown",
        findings: run.findings.length,
        testStatus: run.testSummary?.status ?? null,
        durationMs: run.durationMs,
      }));
    return entries.slice(0, limit);
  }

  async saveArtifact(runId: string, name: string, content: string): Promise<ArtifactRecord> {
    const record: ArtifactRecord = {
      id: `art-${sha256Hex(`${runId}:${name}`).slice(0, 8)}`,
      kind: "log",
      name,
      byteLength: Buffer.byteLength(content, "utf8"),
      contentHash: sha256Hex(content),
    };
    const list = this.artifacts.get(runId) ?? [];
    list.push(record);
    this.artifacts.set(runId, list);
    return record;
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    this.audit.push(structuredClone(event));
  }

  async listAudit(runId: string | null, limit: number): Promise<AuditEvent[]> {
    const filtered = runId === null ? this.audit : this.audit.filter((e) => e.runId === runId);
    return filtered.slice(-limit).map((e) => structuredClone(e));
  }
}
