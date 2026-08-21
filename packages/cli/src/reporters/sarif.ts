/**
 * SARIF 2.1.0 reporter for CI code-scanning integration.
 *
 * Findings map to results with stable partial fingerprints; deterministic
 * rules become tool driver rules; invocation reflects honest execution.
 */

import type { Finding, RunStatus, Severity, VerificationRun } from "../core/contracts.js";

export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      informationUri: string;
      version: string;
      rules: SarifRule[];
    };
  };
  invocations: SarifInvocation[];
  artifacts: SarifArtifact[];
  results: SarifResult[];
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: SarifLevel };
  properties?: { recommendedAction?: string };
}

export interface SarifInvocation {
  executionSuccessful: boolean;
  endTimeUtc?: string;
}

export interface SarifArtifact {
  location: { uri: string };
}

export interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; endLine: number };
    };
  }>;
  partialFingerprints: Record<string, string>;
  properties?: { confidence?: string; category?: string };
}

export type SarifLevel = "error" | "warning" | "note";

const LEVEL_BY_SEVERITY: Record<Severity, SarifLevel> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
};

const SUCCESSFUL_STATUSES: ReadonlySet<RunStatus> = new Set(["completed", "completed_with_findings"]);

export function sarifLevelFor(severity: Severity): SarifLevel {
  return LEVEL_BY_SEVERITY[severity];
}

function distinctRules(findings: readonly Finding[]): SarifRule[] {
  const byId = new Map<string, SarifRule>();
  for (const finding of findings) {
    if (byId.has(finding.ruleId)) continue;
    byId.set(finding.ruleId, {
      id: finding.ruleId,
      name: finding.category,
      shortDescription: { text: finding.description || finding.message },
      defaultConfiguration: { level: sarifLevelFor(finding.severity) },
      ...(finding.recommendedAction
        ? { properties: { recommendedAction: finding.recommendedAction } }
        : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSarifLog(run: VerificationRun): SarifLog {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "nodeforge",
            informationUri: "https://nodeforge.ai",
            version: run.nodeforgeVersion,
            rules: distinctRules(run.findings),
          },
        },
        invocations: [
          {
            executionSuccessful: SUCCESSFUL_STATUSES.has(run.status),
            ...(run.completedAt ? { endTimeUtc: run.completedAt } : {}),
          },
        ],
        artifacts: run.repository.changedFiles.map((file) => ({
          location: { uri: file.path },
        })),
        results: run.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevelFor(finding.severity),
          message: { text: `${finding.message} (${finding.recommendedAction})` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.filePath },
                region: { startLine: finding.startLine, endLine: finding.endLine },
              },
            },
          ],
          partialFingerprints: {
            "nodeforgeFindingFingerprint/v1": finding.fingerprint,
          },
          properties: { confidence: finding.confidence, category: finding.category },
        })),
      },
    ],
  };
}

export function renderRunSarif(run: VerificationRun): string {
  return JSON.stringify(buildSarifLog(run), null, 2);
}
