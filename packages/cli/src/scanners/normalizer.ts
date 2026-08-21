/**
 * Finding normalization: stable fingerprints, deduplication, and deterministic
 * identifiers so the same issue produces the same finding across runs.
 */

import type { Finding, Severity } from "../core/contracts.js";
import { SEVERITY_ORDER } from "../core/contracts.js";
import { canonicalJson, sha256Hex } from "../utils/misc.js";

export interface RawFinding {
  ruleId: string;
  category: string;
  severity: Severity;
  description: string;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  confidence: Finding["confidence"];
  recommendedAction: string;
  source: Finding["source"];
  evidenceIds: string[];
  fileHash: string;
}

/** Stable identity: rule + file content hash + line + normalized message. */
export function findingFingerprint(raw: RawFinding): string {
  const normalizedMessage = raw.message.toLowerCase().replace(/\s+/g, " ").trim();
  return sha256Hex(
    canonicalJson({
      ruleId: raw.ruleId,
      fileHash: raw.fileHash,
      startLine: raw.startLine,
      message: normalizedMessage,
    })
  ).slice(0, 16);
}

/** Deduplicate by fingerprint and order deterministically. */
export function normalizeFindings(rawFindings: readonly RawFinding[]): Finding[] {
  const byFingerprint = new Map<string, RawFinding>();
  for (const raw of rawFindings) {
    const fp = findingFingerprint(raw);
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, raw);
  }

  const ordered = [...byFingerprint.entries()].sort((a, b) => {
    const [, ra] = a;
    const [, rb] = b;
    const sev = SEVERITY_ORDER[rb.severity] - SEVERITY_ORDER[ra.severity];
    if (sev !== 0) return sev;
    if (ra.filePath !== rb.filePath) return ra.filePath < rb.filePath ? -1 : 1;
    if (ra.startLine !== rb.startLine) return ra.startLine - rb.startLine;
    return ra.ruleId.localeCompare(rb.ruleId);
  });

  return ordered.map(([fingerprint, raw], index) => ({
    id: `NF-${String(index + 1).padStart(3, "0")}`,
    fingerprint,
    ruleId: raw.ruleId,
    category: raw.category,
    severity: raw.severity,
    description: raw.description,
    message: raw.message,
    filePath: raw.filePath,
    startLine: raw.startLine,
    endLine: raw.endLine,
    confidence: raw.confidence,
    recommendedAction: raw.recommendedAction,
    source: raw.source,
    evidenceIds: raw.evidenceIds,
  }));
}
