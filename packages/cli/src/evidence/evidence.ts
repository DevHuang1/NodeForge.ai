/**
 * Evidence collector: first-class, hash-addressed evidence records.
 *
 * Every finding, test status, and analysis conclusion references evidence that
 * was captured through this module, so reports can prove where claims came
 * from. Content is redacted and bounded before it is stored.
 */

import type {
  ArtifactRecord,
  EvidenceKind,
  EvidenceRecord,
} from "../core/contracts.js";
import { newId, nowIso, sha256Hex, truncate } from "../utils/misc.js";
import { redactString } from "./redaction.js";

export interface EvidenceOptions {
  kind: EvidenceKind;
  content: string;
  uri?: string;
  /** Max excerpt length stored inline (default 512 chars). */
  excerptBytes?: number;
}

export interface ArtifactSink {
  /** Persist large payloads; returns a relative artifact name. */
  (name: string, content: string): Promise<string>;
}

const DEFAULT_EXCERPT_BYTES = 512;

export class EvidenceCollector {
  private readonly records: EvidenceRecord[] = [];
  private counter = 0;

  constructor(private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  add(options: EvidenceOptions): EvidenceRecord {
    const redacted = redactString(options.content);
    const bounded = truncate(redacted.text, options.excerptBytes ?? DEFAULT_EXCERPT_BYTES);
    this.counter += 1;
    const record: EvidenceRecord = {
      id: `ev-${this.counter.toString().padStart(3, "0")}`,
      kind: options.kind,
      uri: options.uri,
      contentHash: sha256Hex(options.content),
      byteLength: Buffer.byteLength(options.content, "utf8"),
      capturedAt: nowIso(this.clock as never),
      redactionApplied: redacted.appliedRules.length > 0,
      redactionRules: redacted.appliedRules,
      excerpt: bounded.text.length > 0 ? bounded.text : undefined,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Register a large payload (e.g. full test logs) as an artifact plus an
   * evidence record pointing at it. The sink is provided by the storage layer.
   */
  async addArtifact(
    sink: ArtifactSink | null,
    name: string,
    content: string,
    kind: string = "log"
  ): Promise<{ evidence: EvidenceRecord; artifact: ArtifactRecord | null }> {
    const redacted = redactString(content);
    let artifact: ArtifactRecord | null = null;
    let uri: string | undefined;
    if (sink) {
      const storedName = await sink(name, redacted.text);
      uri = `artifacts/${storedName}`;
      artifact = {
        id: `art-${this.counter + 1}`,
        kind,
        name: storedName,
        byteLength: Buffer.byteLength(redacted.text, "utf8"),
        contentHash: sha256Hex(redacted.text),
      };
    }
    const record = this.add({
      kind: "artifact",
      content: redacted.text,
      uri,
      excerptBytes: 400,
    });
    if (artifact) artifact.id = `art-${record.id}`;
    return { evidence: record, artifact };
  }

  list(): EvidenceRecord[] {
    return [...this.records];
  }

  ids(): string[] {
    return this.records.map((r) => r.id);
  }
}

export { newId };
