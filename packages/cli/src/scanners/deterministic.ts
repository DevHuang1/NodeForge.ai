/**
 * Deterministic scan coordinator: applies the rule registry to every scannable
 * file in the snapshot, registers evidence for each match, and normalizes the
 * result. Purely static — no project code is executed.
 */

import type {
  DeterministicScanner,
  FileSnapshot,
  ScanResult,
  ScannerRule,
} from "../core/contracts.js";
import type { ExecutionPolicy } from "../core/policy.js";
import { EvidenceCollector } from "../evidence/evidence.js";
import { confidenceFor } from "./rules.js";
import { normalizeFindings, type RawFinding } from "./normalizer.js";

export class DeterministicScanEngine implements DeterministicScanner {
  id = "deterministic-rules/1";

  constructor(
    private readonly rules: readonly ScannerRule[],
    private readonly evidence: EvidenceCollector
  ) {}

  async scan(files: readonly FileSnapshot[], policy: ExecutionPolicy): Promise<ScanResult> {
    const raw: RawFinding[] = [];
    let filesScanned = 0;
    let filesSkipped = 0;

    for (const file of files) {
      if (!file.content || file.binary) {
        if (!file.binary) filesSkipped += 1;
        continue;
      }
      if (file.sizeBytes > policy.maxFileBytes) {
        filesSkipped += 1;
        continue;
      }
      filesScanned += 1;

      for (const rule of this.rules) {
        if (!rule.appliesTo(file.path)) continue;
        let matches;
        try {
          matches = rule.scan(file.content);
        } catch {
          // A broken rule must never crash the run; record as skipped evidence.
          this.evidence.add({
            kind: "metadata",
            content: `rule ${rule.id} failed on ${file.path}`,
          });
          continue;
        }
        for (const match of matches) {
          const ev = this.evidence.add({
            kind: "source",
            content: match.excerpt,
            uri: `file:${file.path}#L${match.startLine}`,
          });
          raw.push({
            ruleId: rule.id,
            category: rule.category,
            severity: match.severity ?? rule.defaultSeverity,
            description: rule.description,
            message: match.message,
            filePath: file.path,
            startLine: match.startLine,
            endLine: match.endLine,
            confidence:
              rule.id === "NF-SECRET" ? confidenceFor(file.path) : match.confidence,
            recommendedAction: rule.recommendedAction,
            source: "deterministic",
            evidenceIds: [ev.id],
            fileHash: file.contentHash,
          });
        }
      }
    }

    return {
      findings: normalizeFindings(raw),
      filesScanned,
      filesSkipped,
      truncated: false,
    };
  }
}
