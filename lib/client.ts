import type {
  Node1Artifact,
  PipelineArtifacts,
  RevisionFeedback,
} from "./types";

export function buildNode1(requestId: string, rawRequest: string): Node1Artifact {
  return {
    request_id: requestId,
    status: "captured",
    raw_request: rawRequest,
    known_metadata: {
      language_or_runtime: "unknown",
      repository_context: "unknown",
      requested_output: "code_and_explanation",
      execution_context: "unknown",
    },
    unresolved_items: [],
    warnings: [
      "Captured deterministically at the input edge; no model call performed for Node 1.",
    ],
  };
}

export function makeRequestId(prefix: string, caseId: string): string {
  return `${prefix}-${caseId}`;
}

export function pickFeedbackForNode(
  feedback: RevisionFeedback[],
  target: "node_2" | "node_3" | "node_4"
): RevisionFeedback[] {
  return feedback.filter((f) => f.target === target);
}

export interface ScoreRow {
  label: string;
  baseline: 0 | 1 | 2;
  pipeline: 0 | 1 | 2;
}

export function suggestScores(artifacts: PipelineArtifacts): ScoreRow[] {
  const n2 = artifacts.node2;
  const n3 = artifacts.node3;
  const n4 = artifacts.node4;
  const b = artifacts.baseline?.raw_response ?? "";

  const requirements =
    n2 &&
    n2.acceptance_criteria?.length > 0 &&
    n2.assumptions?.length > 0 &&
    n2.scope?.in_scope?.length > 0
      ? 2
      : n2
        ? 1
        : 0;

  const verification =
    n3 && n3.tests?.length > 0 && n3.criterion_mapping?.length > 0
      ? 2
      : n3 && n3.tests?.length > 0
        ? 1
        : 0;

  const security =
    n2?.threat_model?.length ||
    (n4?.findings ?? []).some((f) => f.category === "security")
      ? 2
      : n2
        ? 1
        : 0;

  const traceability =
    n4 && n4.traceability?.length > 0
      ? 2
      : n4
        ? 1
        : 0;

  return [
    {
      label: "Requirement clarity",
      baseline: /assum|ambigu|specif/.test(b) ? 1 : 0,
      pipeline: requirements,
    },
    {
      label: "Verification",
      baseline: /\btest|edge|boundary/.test(b) ? 1 : 0,
      pipeline: verification,
    },
    {
      label: "Security",
      baseline: /secur|inject|author|shell|risk/.test(b) ? 1 : 0,
      pipeline: security,
    },
    {
      label: "Traceability",
      baseline: 0,
      pipeline: traceability,
    },
  ];
}