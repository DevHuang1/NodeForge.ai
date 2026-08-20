import type {
  Node2Artifact,
  Node3Artifact,
  Node4Artifact,
  RepositoryContext,
} from "./types";

const SAFE_SEARCH_PY = `import subprocess
import os

INDEX_ROOT = os.environ.get("SEARCH_INDEX", "./data")

def search_notes(keyword: str) -> list[str]:
    """Return matching lines for a keyword, without shell interpolation."""
    if not keyword or any(ch in keyword for ch in ";&|$\`"):
        raise ValueError("keyword must not contain shell metacharacters")
    proc = subprocess.run(
        ["grep", "-r", "--", keyword, INDEX_ROOT],
        capture_output=True,
        text=True,
    )
    return proc.stdout.splitlines()

def list_recent() -> list[str]:
    """Return the most recently indexed note names (JSON index)."""
    index = os.path.join(INDEX_ROOT, "index.json")
    if not os.path.exists(index):
        return []
    return sorted(os.listdir(index))[:10]
`;

export function offlineNode2(prCtx: {
  repo: string;
  title: string;
  body: string;
}): Node2Artifact {
  return {
    request_id: "offline-sample",
    status: "ready_for_execution",
    objective: `Review "${prCtx.title}" and produce a safe, verified change for ${prCtx.repo}.`,
    scope: {
      in_scope: [
        "Safe shell-free search implementation",
        "Recent-notes helper",
        "Tests mapped to acceptance criteria",
      ],
      out_of_scope: ["Web UI", "Authentication", "Deployment"],
    },
    facts_from_request: [
      "Search endpoint greps an index root",
      "User supplies the keyword",
    ],
    assumptions: [
      {
        assumption: "Index root comes from SEARCH_INDEX with default ./data",
        impact: "medium",
        safe_default: "./data",
      },
      {
        assumption: "Recent-notes index is a plain directory listing",
        impact: "low",
        safe_default: "Directory listing, no pickle",
      },
    ],
    acceptance_criteria: [
      { id: "AC-001", criterion: "Search returns matching lines for a valid keyword", priority: "must" },
      { id: "AC-002", criterion: "Empty or metacharacter keywords are rejected, not shell-interpolated", priority: "must" },
      { id: "AC-003", criterion: "Recent-notes helper returns a list without crashing", priority: "should" },
      { id: "AC-004", criterion: "No secrets or unsafe deserialization are introduced", priority: "must" },
    ],
    input_contract: {
      fields: ["keyword: str"],
      validation_rules: ["Reject empty", "Reject ; & | $ ` characters"],
    },
    output_contract: {
      shape: "list[str]",
      success_behavior: "Returns matching lines",
      failure_behavior: "Raises ValueError for unsafe keywords",
    },
    edge_cases: ["Empty keyword", "Keyword with ';' or '|'", "Missing index root", "Binary file matches"],
    threat_model: [
      {
        risk: "OS command injection",
        attack_or_failure_mode: "keyword interpolated into a shell command",
        required_control: "Argument array + no shell=True + metacharacter rejection",
        severity: "high",
      },
      {
        risk: "Unsafe deserialization",
        attack_or_failure_mode: "pickle.load on a possibly attacker-controlled index",
        required_control: "Use JSON or safe formats only",
        severity: "high",
      },
      {
        risk: "Secret leakage",
        attack_or_failure_mode: "credentials committed in the diff",
        required_control: "Env vars + secret scan",
        severity: "medium",
      },
    ],
    clarification_questions: [
      { question: "Which index root should be searched?", blocking: false },
    ],
    implementation_plan: [
      "Replace shell interpolation with subprocess argument list",
      "Add input validation for metacharacters",
      "Replace pickle index with a directory listing",
      "Add mapped tests",
    ],
    warnings: ["Offline sample artifact; produced without a live model call."],
  };
}

export function offlineNode3(ctx: RepositoryContext): Node3Artifact {
  return {
    request_id: "offline-sample",
    status: "implementation_ready",
    implementation: {
      language: ctx.language,
      files: [
        {
          path: "app/search.py",
          content: SAFE_SEARCH_PY,
          change_summary: "Safe search: no shell interpolation, no pickle, input validation added.",
        },
      ],
    },
    tests: [
      {
        id: "T-001",
        name: "Search returns matches",
        category: "normal",
        maps_to: ["AC-001"],
        input_fixture: "design doc",
        expected_result: "list containing matches",
        verification_status: "proposed",
        observed_result: "not_available",
      },
      {
        id: "T-002",
        name: "Empty keyword rejected",
        category: "malformed",
        maps_to: ["AC-002"],
        input_fixture: "",
        expected_result: "ValueError",
        verification_status: "proposed",
        observed_result: "not_available",
      },
      {
        id: "T-003",
        name: "Shell metacharacter rejected",
        category: "malformed",
        maps_to: ["AC-002", "AC-004"],
        input_fixture: "foo; rm -rf /",
        expected_result: "ValueError, no shell execution",
        verification_status: "proposed",
        observed_result: "not_available",
      },
      {
        id: "T-004",
        name: "Recent notes returns list",
        category: "normal",
        maps_to: ["AC-003"],
        input_fixture: "existing index",
        expected_result: "list",
        verification_status: "proposed",
        observed_result: "not_available",
      },
    ],
    criterion_mapping: [
      { criterion_id: "AC-001", test_ids: ["T-001"], coverage_status: "covered", reason: "Normal path" },
      { criterion_id: "AC-002", test_ids: ["T-002", "T-003"], coverage_status: "covered", reason: "Malformed inputs" },
      { criterion_id: "AC-003", test_ids: ["T-004"], coverage_status: "covered", reason: "Helper path" },
      { criterion_id: "AC-004", test_ids: ["T-003"], coverage_status: "partial", reason: "Security-by-construction, mapped to rejection test" },
    ],
    dependencies: ["python>=3.8"],
    known_uncertainties: ["No execution sandbox configured; tests are proposed, not executed."],
    warnings: ["Offline sample artifact; produced without a live model call."],
  };
}

export function offlineNode4(): Node4Artifact {
  return {
    request_id: "offline-sample",
    quality_gate: "needs_revision",
    findings: [
      {
        id: "MF-001",
        category: "security",
        severity: "high",
        description: "PR introduces OS command injection: keyword interpolated into a shell command.",
        evidence: "app/search.py uses f-string into subprocess.check_output(cmd, shell=True).",
        recommended_route: "node_3",
        required_correction: "Use an argument list and set shell=False; reject shell metacharacters.",
      },
      {
        id: "MF-002",
        category: "security",
        severity: "high",
        description: "Unsafe deserialization: pickle.load on a possibly attacker-controlled index file.",
        evidence: "app/search.py: pickle.load in load_index().",
        recommended_route: "node_3",
        required_correction: "Replace pickle with JSON or another safe format.",
      },
      {
        id: "MF-003",
        category: "honesty",
        severity: "medium",
        description: "README claims 'tested and production-ready' but no test was executed.",
        evidence: "README.md status section.",
        recommended_route: "node_4",
        required_correction: "Rewrite claims to match evidence; mark tests as proposed.",
      },
    ],
    traceability: [
      { criterion_id: "AC-001", implementation_reference: "app/search.py:search_notes", test_ids: ["T-001"], status: "supported" },
      { criterion_id: "AC-002", implementation_reference: "app/search.py:search_notes", test_ids: ["T-002", "T-003"], status: "supported" },
      { criterion_id: "AC-003", implementation_reference: "app/search.py:list_recent", test_ids: ["T-004"], status: "supported" },
      { criterion_id: "AC-004", implementation_reference: "app/search.py", test_ids: ["T-003"], status: "partial" },
    ],
    final_response: {
      summary: "The change is implementable but introduces a command-injection risk and an unsafe deserialization path; the safe patch is proposed.",
      code_or_patch: SAFE_SEARCH_PY,
      tests_and_status: ["T-001..T-004: proposed, not executed (offline executor)"],
      security_notes: ["Shell interpolation removed in the proposed patch", "Pickle replaced by directory listing"],
      limitations: ["No sandbox available; tests not executed"],
    },
    redactions: ["ghp_*** (rotated)"],
    warnings: ["Offline sample artifact; produced without a live model call."],
  };
}