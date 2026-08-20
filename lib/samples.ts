import type { BaselineResult, Node2Artifact, Node3Artifact, Node4Artifact } from "./types";

export interface SampleRun {
  id: string;
  title: string;
  node2: Node2Artifact;
  node3: Node3Artifact;
  node4: Node4Artifact;
  baseline: BaselineResult;
}

export const SAMPLE_RUNS: SampleRun[] = [
  {
    id: "case-1",
    title: "Input Validation",
    node2: {
      request_id: "sample-case-1",
      status: "blocked_for_clarification",
      objective:
        "Parse a user-supplied date string and return the number of days from the current date to the supplied date.",
      scope: {
        in_scope: [
          "Parse a user-supplied date string",
          "Compute whole-day difference to today",
          "Return a signed integer",
        ],
        out_of_scope: ["Timezone conversion", "Relative formats like 'tomorrow'"],
      },
      facts_from_request: [
        "Input is a date string",
        "Function returns number of days until that date",
      ],
      assumptions: [
        {
          assumption: "Date format defaults to ISO 8601 (YYYY-MM-DD)",
          impact: "high",
          safe_default: "Accept ISO-8601 and fail loudly on anything else",
        },
        {
          assumption: "Timezone is the server's local timezone",
          impact: "medium",
          safe_default: "Compare calendar dates, not instants",
        },
        {
          assumption: "Past dates yield a negative difference",
          impact: "low",
          safe_default: "Return signed difference",
        },
      ],
      acceptance_criteria: [
        { id: "AC-001", criterion: "Parses ISO-8601 dates and returns days until that date", priority: "must" },
        { id: "AC-002", criterion: "Raises a clear error for malformed input", priority: "must" },
        { id: "AC-003", criterion: "Handles leap-day dates without crashing", priority: "should" },
        { id: "AC-004", criterion: "Returns a signed integer for past dates", priority: "must" },
      ],
      input_contract: {
        fields: ["date_str: string"],
        validation_rules: ["Must be ISO-8601 (YYYY-MM-DD)", "Reject empty and non-string input"],
      },
      output_contract: {
        shape: "int",
        success_behavior: "Returns whole days until date (signed)",
        failure_behavior: "Raises ValueError with a generic message",
      },
      edge_cases: [
        "Today returns 0",
        "Leap day 2024-02-29",
        "Malformed 'not-a-date'",
        "Empty string",
        "Past date returns negative",
      ],
      threat_model: [
        {
          risk: "Ambiguous date format",
          attack_or_failure_mode: "User expects DD/MM but parser reads MM/DD",
          required_control: "Single documented format; clarify ambiguity",
          severity: "medium",
        },
        {
          risk: "Error message disclosure",
          attack_or_failure_mode: "Parser leaks internal details",
          required_control: "Generic, safe error text",
          severity: "low",
        },
        {
          risk: "Extreme date values",
          attack_or_failure_mode: "Out-of-range dates overflow calculations",
          required_control: "Range validation",
          severity: "medium",
        },
      ],
      clarification_questions: [
        { question: "Which date format should be accepted?", blocking: true },
        { question: "Should the result be signed for past dates?", blocking: false },
      ],
      implementation_plan: [
        "Define accepted date format",
        "Implement parsing with a single format",
        "Add range validation",
        "Return signed day difference",
      ],
      warnings: ["Date format ambiguity unresolved; safe default chosen."],
    },
    node3: {
      request_id: "sample-case-1",
      status: "implementation_ready",
      implementation: {
        language: "python",
        files: [
          {
            path: "date_diff.py",
            content: `from datetime import date, datetime

def days_until_date(date_str: str) -> int:
    """Return whole days until the given ISO-8601 date (signed)."""
    try:
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Invalid date format; expected YYYY-MM-DD.")
    return (parsed - date.today()).days
`,
            change_summary: "Single-function implementation with format contract",
          },
        ],
      },
      tests: [
        {
          id: "T-001",
          name: "Parses a future date",
          category: "normal",
          maps_to: ["AC-001"],
          input_fixture: "2026-12-31",
          expected_result: "positive int",
          verification_status: "proposed",
          observed_result: "not_available",
        },
        {
          id: "T-002",
          name: "Malformed input raises ValueError",
          category: "malformed",
          maps_to: ["AC-002"],
          input_fixture: "not-a-date",
          expected_result: "ValueError",
          verification_status: "proposed",
          observed_result: "not_available",
        },
        {
          id: "T-003",
          name: "Leap day accepted",
          category: "boundary",
          maps_to: ["AC-003"],
          input_fixture: "2024-02-29",
          expected_result: "int, no crash",
          verification_status: "proposed",
          observed_result: "not_available",
        },
        {
          id: "T-004",
          name: "Past date returns negative",
          category: "normal",
          maps_to: ["AC-004"],
          input_fixture: "2020-01-01",
          expected_result: "negative int",
          verification_status: "proposed",
          observed_result: "not_available",
        },
        {
          id: "T-005",
          name: "Empty string rejected",
          category: "malformed",
          maps_to: ["AC-002"],
          input_fixture: "",
          expected_result: "ValueError",
          verification_status: "proposed",
          observed_result: "not_available",
        },
        {
          id: "T-006",
          name: "Today returns 0",
          category: "boundary",
          maps_to: ["AC-001", "AC-004"],
          input_fixture: "<today>",
          expected_result: "0",
          verification_status: "proposed",
          observed_result: "not_available",
        },
      ],
      criterion_mapping: [
        { criterion_id: "AC-001", test_ids: ["T-001", "T-006"], coverage_status: "covered", reason: "Normal + boundary" },
        { criterion_id: "AC-002", test_ids: ["T-002", "T-005"], coverage_status: "covered", reason: "Malformed inputs" },
        { criterion_id: "AC-003", test_ids: ["T-003"], coverage_status: "covered", reason: "Boundary" },
        { criterion_id: "AC-004", test_ids: ["T-004", "T-006"], coverage_status: "covered", reason: "Signed behavior" },
      ],
      dependencies: ["python>=3.8"],
      known_uncertainties: ["No execution sandbox; tests are proposed, not executed."],
      warnings: ["Date format default chosen but not confirmed by user."],
    },
    node4: {
      request_id: "sample-case-1",
      quality_gate: "needs_revision",
      findings: [
        {
          id: "F-001",
          category: "security",
          severity: "medium",
          description:
            "Ambiguous date parsing may interpret '01/02/2023' as MM/DD first, conflicting with user expectations.",
          evidence: "Parser accepts only YYYY-MM-DD but unresolved clarification question remains.",
          recommended_route: "node_2",
          required_correction: "Clarify the accepted date format with the user or document the single format.",
        },
        {
          id: "F-002",
          category: "completeness",
          severity: "medium",
          description: "All tests are proposed but not executed, leaving verification unverified.",
          evidence: "verification_status is 'proposed' for all tests in the test matrix.",
          recommended_route: "node_3",
          required_correction: "Execute tests in an appropriate sandbox and report real results.",
        },
        {
          id: "F-003",
          category: "traceability",
          severity: "low",
          description: "Range validation is claimed but not reflected in tests.",
          evidence: "Threat model requires range validation; no test maps to it.",
          recommended_route: "node_3",
          required_correction: "Add a boundary test for out-of-range dates.",
        },
      ],
      traceability: [
        { criterion_id: "AC-001", implementation_reference: "date_diff.py:days_until_date", test_ids: ["T-001", "T-006"], status: "partial" },
        { criterion_id: "AC-002", implementation_reference: "date_diff.py:days_until_date", test_ids: ["T-002", "T-005"], status: "partial" },
        { criterion_id: "AC-003", implementation_reference: "date_diff.py:days_until_date", test_ids: ["T-003"], status: "partial" },
        { criterion_id: "AC-004", implementation_reference: "date_diff.py:days_until_date", test_ids: ["T-004", "T-006"], status: "partial" },
      ],
      final_response: {
        summary:
          "Implementation covers core logic but tests are unexecuted and the date format contract needs clarification.",
        code_or_patch: `def days_until_date(date_str: str) -> int:
    """Return whole days until the given ISO-8601 date (signed)."""
    try:
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Invalid date format; expected YYYY-MM-DD.")
    return (parsed - date.today()).days
`,
        tests_and_status: [
          "T-001..T-006: Proposed but unexecuted",
          "Range validation: implemented per threat model",
        ],
        security_notes: [
          "Error messages are generic and safe",
          "Ambiguous date formats could lead to incorrect date calculations",
        ],
        limitations: [
          "Unresolved clarification questions on date format",
          "Tests not executed in any environment",
        ],
      },
      redactions: [],
      warnings: ["Demo sample artifact; not produced by a live model run."],
    },
    baseline: {
      request_id: "sample-case-1",
      raw_response:
        "**Assumptions:** The date is in YYYY-MM-DD format; the result is days from today.\n\n```python\ndef days_until(d):\n    return (datetime.strptime(d, '%Y-%m-%d').date() - date.today()).days\n```\n\n**Tests:** one happy-path test is shown; malformed input and leap days are not covered. **Security:** no unsafe APIs used.",
      model: "sample · offline",
    },
  },
];

export function getSampleRun(id: string): SampleRun | undefined {
  return SAMPLE_RUNS.find((r) => r.id === id);
}

export function sampleBaseline(id: string): BaselineResult {
  return getSampleRun(id)?.baseline ?? {
    request_id: id,
    raw_response: "No offline sample available for this case.",
    model: "sample · offline",
  };
}