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
  provider: string;
  model: string;
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