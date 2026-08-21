/**
 * NodeForge CLI — core domain contracts.
 *
 * These types are the stable boundary between the verification engine and every
 * adapter (CLI commands, reporters, storage backends, providers). Everything in
 * here must remain JSON-serializable: no Error instances, ChildProcess handles,
 * or other runtime objects.
 */

import type { ExecutionPolicy } from "./policy.js";
import type { NodeForgeConfig } from "../config/config.js";

/** Bumped whenever a persisted document shape changes. */
export const SCHEMA_VERSION = 1 as const;

// ── Severity and status vocabulary ──────────────────────────────────────────

export type Severity = "low" | "medium" | "high" | "critical";

export const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Honest execution status for any stage or test outcome.
 * A blocked outcome is NOT a failure; an unattempted outcome is NOT a pass.
 */
export type VerificationStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "not_executed"
  | "skipped";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_findings"
  | "blocked"
  | "failed"
  | "cancelled";

export type StageName =
  | "prepare"
  | "context"
  | "capability_map"
  | "deterministic_scan"
  | "test_discovery"
  | "test_execution"
  | "analysis"
  | "synthesis"
  | "persistence";

export const ALL_STAGES: readonly StageName[] = [
  "prepare",
  "context",
  "capability_map",
  "deterministic_scan",
  "test_discovery",
  "test_execution",
  "analysis",
  "synthesis",
  "persistence",
];

export type RunMode = "review" | "scan" | "test";

export type Confidence = "low" | "medium" | "high";

// ── Targets ─────────────────────────────────────────────────────────────────

export interface LocalTarget {
  kind: "local";
  /** Absolute path to the repository or subdirectory. */
  path: string;
  /** Optional git ref (branch, tag, or commit SHA) verified via a temp worktree. */
  ref?: string;
}

export interface PullRequestTarget {
  kind: "pull_request";
  url: string;
  owner: string;
  repo: string;
  number: number;
}

export type ReviewTarget = LocalTarget | PullRequestTarget;

/** Target with credentials and volatile fields removed; safe to persist. */
export interface SanitizedTarget {
  kind: ReviewTarget["kind"];
  path?: string;
  ref?: string;
  url?: string;
  owner?: string;
  repo?: string;
  number?: number;
}

// ── Files and repository snapshot ───────────────────────────────────────────

export interface FileSnapshot {
  /** Repo-relative POSIX path. */
  path: string;
  sizeBytes: number;
  contentHash: string;
  binary: boolean;
  /** Present only when content was loadable within policy limits. */
  content?: string;
}

export interface PullRequestMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  baseSha: string;
}

export interface RepositorySnapshot {
  root: string | null;
  ref: string | null;
  commitSha: string | null;
  /** Remote URL with any embedded credentials stripped. */
  remoteUrl: string | null;
  pullRequest: PullRequestMeta | null;
  changedFiles: FileSnapshot[];
  fileCount: number;
  truncated: boolean;
  notes: string[];
}

// ── Capabilities ────────────────────────────────────────────────────────────

export interface DetectedRunner {
  id: string;
  /** argv-style command; never a shell string. */
  command: string[];
  source: string;
  confidence: Confidence;
  /** null = availability unknown (not probed). */
  available: boolean | null;
}

export interface CapabilityMap {
  languages: string[];
  packageManagers: string[];
  frameworks: string[];
  testRunners: DetectedRunner[];
  notes: string[];
}

// ── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceKind =
  | "source"
  | "diff"
  | "stdout"
  | "stderr"
  | "metadata"
  | "artifact";

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  uri?: string;
  contentHash: string;
  byteLength: number;
  capturedAt: string;
  redactionApplied: boolean;
  redactionRules: string[];
  excerpt?: string;
}

export interface ArtifactRecord {
  id: string;
  kind: string;
  name: string;
  byteLength: number;
  contentHash: string;
}

// ── Findings ────────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  ruleId: string;
  category: string;
  severity: Severity;
  description: string;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  confidence: Confidence;
  recommendedAction: string;
  source: "deterministic" | "analysis";
  evidenceIds: string[];
  /** Stable identity: ruleId + fileHash + line + normalized message. */
  fingerprint: string;
}

// ── Tests ───────────────────────────────────────────────────────────────────

export interface TestSummary {
  status: VerificationStatus;
  runner: string | null;
  command: string[] | null;
  discovered: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  reason: string;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  evidenceIds: string[];
  networkPolicy: "denied" | "allowed";
  networkEnforcement: "not_enforced" | "best_effort" | "containerized" | "not_applicable";
}

// ── Analysis (optional LLM stage) ───────────────────────────────────────────

export interface AnalysisOutcome {
  status: VerificationStatus;
  providerId: string | null;
  model: string | null;
  reason: string;
  findingsContributed: number;
  durationMs: number;
}

// ── Stages and runs ─────────────────────────────────────────────────────────

export interface EngineErrorInfo {
  code: string;
  message: string;
  stage?: StageName;
  retryable: boolean;
}

export interface StageOutcome {
  stage: StageName;
  status: VerificationStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  reason: string;
  evidenceIds: string[];
  artifactIds: string[];
  errors: EngineErrorInfo[];
}

export interface SanitizedRequest {
  mode: RunMode;
  target: SanitizedTarget;
  correlationId: string;
  requestedBy: string;
  dryRun: boolean;
  configFingerprint: string;
}

export interface VerificationRun {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  status: RunStatus;
  request: SanitizedRequest;
  repository: RepositorySnapshot;
  capabilities: CapabilityMap;
  stages: StageOutcome[];
  findings: Finding[];
  testSummary: TestSummary | null;
  analysis: AnalysisOutcome | null;
  evidence: EvidenceRecord[];
  artifacts: ArtifactRecord[];
  createdAt: string;
  completedAt: string | null;
  durationMs: number;
  nodeforgeVersion: string;
}

export interface RunIndexEntry {
  id: string;
  createdAt: string;
  status: RunStatus;
  mode: RunMode;
  target: string;
  findings: number;
  testStatus: VerificationStatus | null;
  durationMs: number;
}

// ── Audit ───────────────────────────────────────────────────────────────────

export type AuditAction =
  | "run.created"
  | "run.cancelled"
  | "run.persisted"
  | "stage.started"
  | "stage.completed"
  | "policy.denied"
  | "command.executed"
  | "evidence.registered"
  | "finding.recorded"
  | "redaction.applied"
  | "analysis.completed";

export interface AuditEvent {
  id: string;
  runId: string;
  at: string;
  actor: string;
  action: AuditAction;
  stage: StageName | null;
  outcome: "ok" | "error" | "denied" | "cancelled";
  metadata: Record<string, string | number | boolean | null>;
}

// ── Adapter interfaces (provider-agnostic seams) ────────────────────────────

export interface SourceProvider {
  id: string;
  /** Resolve a target into a repository snapshot plus a workspace cleanup hook. */
  load(
    target: ReviewTarget,
    policy: ExecutionPolicy,
    signal: AbortSignal
  ): Promise<{ snapshot: RepositorySnapshot; cleanup: () => Promise<void> }>;
}

export interface ScannerRuleMatch {
  startLine: number;
  endLine: number;
  message: string;
  severity: Severity;
  confidence: Confidence;
  excerpt: string;
}

export interface ScannerRule {
  id: string;
  version: string;
  category: string;
  description: string;
  recommendedAction: string;
  defaultSeverity: Severity;
  appliesTo(filePath: string): boolean;
  scan(content: string): ScannerRuleMatch[];
}

export interface ScanResult {
  findings: Finding[];
  filesScanned: number;
  filesSkipped: number;
  truncated: boolean;
}

export interface DeterministicScanner {
  id: string;
  scan(files: FileSnapshot[], policy: ExecutionPolicy): Promise<ScanResult>;
}

export interface TestDiscovery {
  runner: DetectedRunner | null;
  candidates: DetectedRunner[];
  reason: string;
}

export interface ExecutorHooks {
  onCommandExecuted(command: string[], durationMs: number, exitCode: number | null): void;
  onPolicyDenied(reason: string): void;
}

export interface TestExecutor {
  id: string;
  discover(
    snapshot: RepositorySnapshot,
    capabilities: CapabilityMap,
    config: NodeForgeConfig,
    policy: ExecutionPolicy
  ): Promise<TestDiscovery>;
  execute(
    snapshot: RepositorySnapshot,
    discovery: TestDiscovery,
    config: NodeForgeConfig,
    policy: ExecutionPolicy,
    signal: AbortSignal,
    hooks: ExecutorHooks
  ): Promise<TestSummary>;
}

export interface AnalysisInput {
  run: VerificationRun;
  maxFindings: number;
}

/** A finding proposed by analysis; must reference evidence that exists. */
export interface RawAnalysisFinding {
  ruleId: string;
  category: string;
  severity: Severity;
  message: string;
  filePath: string;
  startLine: number;
  recommendedAction: string;
}

export interface AnalysisResult {
  outcome: AnalysisOutcome;
  /** Candidates are validated against the run before becoming findings. */
  candidates: RawAnalysisFinding[];
}

export interface AnalysisProvider {
  id: string;
  analyze(input: AnalysisInput, signal: AbortSignal): Promise<AnalysisResult>;
}

export interface RunRepository {
  saveRun(run: VerificationRun): Promise<void>;
  getRun(id: string): Promise<VerificationRun | null>;
  listRuns(limit: number): Promise<RunIndexEntry[]>;
  saveArtifact(runId: string, name: string, content: string): Promise<ArtifactRecord>;
  appendAudit(event: AuditEvent): Promise<void>;
  listAudit(runId: string | null, limit: number): Promise<AuditEvent[]>;
}
