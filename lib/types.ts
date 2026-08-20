export type GateStatus =
  | "pass"
  | "pass_with_limitations"
  | "needs_revision"
  | "blocked_for_human_review";

export type VerificationStatus =
  | "executed"
  | "static_check"
  | "proposed"
  | "blocked"
  | "not_executed";

export type Severity = "low" | "medium" | "high" | "critical";

export type RouteTarget = "node_2" | "node_3" | "node_4" | "human_review";

export interface Node1Artifact {
  request_id: string;
  status: "captured" | "blocked_for_missing_input";
  raw_request: string;
  known_metadata: Record<string, string | unknown>;
  unresolved_items: string[];
  warnings: string[];
}

export interface Node2Artifact {
  request_id: string;
  status: "ready_for_execution" | "blocked_for_clarification";
  objective: string;
  scope: { in_scope: string[]; out_of_scope: string[] };
  facts_from_request: string[];
  assumptions: Array<{
    assumption: string;
    impact: "low" | "medium" | "high";
    safe_default: string;
  }>;
  acceptance_criteria: Array<{
    id: string;
    criterion: string;
    priority: "must" | "should" | "could";
  }>;
  input_contract: { fields: string[]; validation_rules: string[] };
  output_contract: {
    shape: string;
    success_behavior: string;
    failure_behavior: string;
  };
  edge_cases: string[];
  threat_model: Array<{
    risk: string;
    attack_or_failure_mode: string;
    required_control: string;
    severity: Severity;
  }>;
  clarification_questions: Array<{ question: string; blocking: boolean }>;
  implementation_plan: string[];
  warnings: string[];
}

export interface Node3Test {
  id: string;
  name: string;
  category: string;
  maps_to: string[];
  input_fixture: string;
  expected_result: string;
  verification_status: VerificationStatus;
  observed_result: string;
}

export interface Node3Artifact {
  request_id: string;
  status: "implementation_ready" | "blocked_by_specification";
  implementation: {
    language: string;
    files: Array<{
      path: string;
      content: string;
      change_summary: string;
    }>;
  };
  tests: Node3Test[];
  criterion_mapping: Array<{
    criterion_id: string;
    test_ids: string[];
    coverage_status: "covered" | "partial" | "uncovered";
    reason: string;
  }>;
  dependencies: string[];
  known_uncertainties: string[];
  warnings: string[];
}

export interface Node4Finding {
  id: string;
  category:
    | "syntax"
    | "completeness"
    | "security"
    | "traceability"
    | "format"
    | "honesty";
  severity: Severity;
  description: string;
  evidence: string;
  recommended_route: RouteTarget;
  required_correction: string;
}

export interface Node4Artifact {
  request_id: string;
  quality_gate: GateStatus;
  findings: Node4Finding[];
  traceability: Array<{
    criterion_id: string;
    implementation_reference: string;
    test_ids: string[];
    status: "supported" | "partial" | "unsupported";
  }>;
  final_response: {
    summary: string;
    code_or_patch: string;
    tests_and_status: string[];
    security_notes: string[];
    limitations: string[];
  };
  redactions: string[];
  warnings: string[];
}

export type AnyArtifact =
  | Node1Artifact
  | Node2Artifact
  | Node3Artifact
  | Node4Artifact;

export interface PipelineArtifacts {
  node1?: Node1Artifact;
  node2?: Node2Artifact;
  node3?: Node3Artifact;
  node4?: Node4Artifact;
  baseline?: BaselineResult;
}

export interface BaselineResult {
  request_id: string;
  raw_response: string;
  code?: string;
  model: string;
  usage?: UsageInfo;
}

export interface RevisionFeedback {
  source: string;
  target: RouteTarget;
  finding_id: string;
  description: string;
  severity: Severity;
  correction: string;
  applied_at: string;
}

export interface PromptOverrides {
  node2?: string;
  node3?: string;
  node4?: string;
  baseline?: string;
}

export interface UsageInfo {
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
}

export interface RunNodeRequest {
  node: 2 | 3 | 4;
  requestId: string;
  rawRequest: string;
  requestIdPrefix: string;
  artifacts: {
    node1?: Node1Artifact;
    node2?: Node2Artifact;
    node3?: Node3Artifact;
  };
  feedback?: RevisionFeedback[];
  temperature?: number;
  injectDefect?: boolean;
  promptOverrides?: PromptOverrides;
  model?: string;
  provider?: string;
}

export interface RunNodeResponseData {
  node: 2 | 3 | 4;
  artifact: Node2Artifact | Node3Artifact | Node4Artifact;
  usage?: UsageInfo;
}

export interface BaselineRequest {
  requestId: string;
  rawRequest: string;
  requestIdPrefix: string;
  temperature?: number;
  promptOverride?: string;
  model?: string;
  provider?: string;
}

export interface ProviderInfo {
  name: string;
  baseUrl: string;
  model: string;
  siteUrl?: string;
}

export interface ApiConfig {
  configured: boolean;
  providers: ProviderInfo[];
  priority: "o" | "f";
  defaultTemperature: number;
  maxTokens: number;
}

// ── Repository-aware review ────────────────────────────────────────────────

export type ReviewStage =
  | "context"
  | "expand"
  | "analyze"
  | "execute"
  | "security"
  | "synthesize"
  | "done"
  | "error";

export type ReviewRunStatus = "pending" | "running" | "done" | "error";

export interface PullRequestFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  content: string;
  unifiedDiff: string;
  lines: string[];
  binary: boolean;
}

export interface PullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  url: string;
  files: PullRequestFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface ContextFileSelection {
  path: string;
  sizeBytes: number;
  estimatedTokens: number;
  reason: "changed" | "manifest" | "readme" | "import" | "test" | "ignored";
  selected: boolean;
}

export interface RepositoryContext {
  owner: string;
  repo: string;
  headSha: string;
  baseSha: string;
  language: string;
  framework: string;
  testCommand: string | null;
  files: ContextFileSelection[];
  changedTokens: number;
  budget: number;
  summary: string;
}

export type FindingSource = "deterministic" | "model";

export interface ReviewFinding {
  id: string;
  category: string;
  severity: Severity;
  description: string;
  evidence: string;
  file_path: string;
  line_start?: number;
  line_end?: number;
  confidence: "low" | "medium" | "high";
  recommended_action: string;
  source: FindingSource;
  recommended_route?: RouteTarget;
}

export type FindingDecisionAction =
  | "approve"
  | "dismiss"
  | "request_revision"
  | "assign";

export interface FindingDecision {
  findingId: string;
  action: FindingDecisionAction;
  reason: string;
  reviewer?: string;
  at: string;
}

export interface PatchProposal {
  description: string;
  diff: string;
  files: Array<{ path: string; status: string; content: string }>;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface TestExecutionItem {
  id: string;
  name: string;
  maps_to: string[];
  verification_status: VerificationStatus;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
  failure_reason: string;
  observed_result: string;
}

export interface TestExecutionSummary {
  status: "ok" | "partial" | "failed" | "blocked" | "offline_sample";
  tested: number;
  passed: number;
  failed: number;
  blocked: number;
  not_executed: number;
  duration_ms: number;
  items: TestExecutionItem[];
  notes: string[];
  sandbox: string;
}

export interface ReviewRun {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  baseSha: string;
  headSha: string;
  status: ReviewRunStatus;
  currentStage: ReviewStage;
  stageLog: Array<{ stage: ReviewStage; at: string; detail?: string }>;
  context: RepositoryContext | null;
  artifacts: PipelineArtifacts;
  deterministicFindings: ReviewFinding[];
  modelFindings: ReviewFinding[];
  testResult: TestExecutionSummary | null;
  patch: PatchProposal | null;
  decisions: FindingDecision[];
  provider: string | null;
  model: string | null;
  usage: Record<string, UsageInfo | undefined>;
  durationMs: number;
  retryCount: number;
  promptVersion: string;
  policyVersion: string;
  offline: boolean;
  errors: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRunSummary {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  status: ReviewRunStatus;
  currentStage: ReviewStage;
  headSha: string;
  findingsCount: number;
  offline: boolean;
  provider: string | null;
  durationMs: number;
  createdAt: string;
}

export type AuditAction =
  | "finding.approve"
  | "finding.dismiss"
  | "finding.request_revision"
  | "finding.assign"
  | "patch.approve"
  | "patch.reject"
  | "review.comment"
  | "run.create"
  | "run.reload"
  | "version.publish"
  | "version.rollback";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationMetrics {
  requirementCoverage: number;
  testExecutionAccuracy: number | null;
  findingPrecision: number | null;
  findingRecall: number | null;
  hallucinatedClaims: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  providerFallbacks: number;
}

export interface EvaluationResult {
  runId: string;
  metrics: EvaluationMetrics;
  regressionDelta: number | null;
  markdown: string;
}