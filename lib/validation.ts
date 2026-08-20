export interface ValidationIssue {
  path: string;
  message: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): boolean {
  return typeof v === "string";
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((i) => typeof i === "string");
}

const NODE1_REQUIRED: Record<string, (v: unknown) => boolean> = {
  request_id: isString,
  status: isString,
  raw_request: isString,
  known_metadata: isObject,
  unresolved_items: isStringArray,
  warnings: isStringArray,
};

const NODE2_REQUIRED: Record<string, (v: unknown) => boolean> = {
  request_id: isString,
  status: isString,
  objective: isString,
  scope: isObject,
  facts_from_request: isStringArray,
  assumptions: (v) => Array.isArray(v),
  acceptance_criteria: (v) => Array.isArray(v),
  input_contract: isObject,
  output_contract: isObject,
  edge_cases: isStringArray,
  threat_model: (v) => Array.isArray(v),
  clarification_questions: (v) => Array.isArray(v),
  implementation_plan: isStringArray,
  warnings: isStringArray,
};

const NODE3_REQUIRED: Record<string, (v: unknown) => boolean> = {
  request_id: isString,
  status: isString,
  implementation: isObject,
  tests: (v) => Array.isArray(v),
  criterion_mapping: (v) => Array.isArray(v),
  dependencies: isStringArray,
  known_uncertainties: isStringArray,
  warnings: isStringArray,
};

const NODE4_REQUIRED: Record<string, (v: unknown) => boolean> = {
  request_id: isString,
  quality_gate: isString,
  findings: (v) => Array.isArray(v),
  traceability: (v) => Array.isArray(v),
  final_response: isObject,
  redactions: isStringArray,
  warnings: isStringArray,
};

const SCHEMAS: Record<number, Record<string, (v: unknown) => boolean>> = {
  1: NODE1_REQUIRED,
  2: NODE2_REQUIRED,
  3: NODE3_REQUIRED,
  4: NODE4_REQUIRED,
};

function validateChecks(
  artifact: Record<string, unknown>,
  checks: Record<string, (v: unknown) => boolean>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [key, ok] of Object.entries(checks)) {
    if (!(key in artifact)) {
      issues.push({ path: key, message: `Missing required field "${key}".` });
    } else if (!ok(artifact[key])) {
      issues.push({ path: key, message: `Field "${key}" has an unexpected type.` });
    }
  }
  return issues;
}

export function validateArtifact(node: 1 | 2 | 3 | 4, artifact: unknown): ValidationIssue[] {
  if (!isObject(artifact)) {
    return [{ path: "$", message: "Artifact is not a JSON object." }];
  }
  return validateChecks(artifact, SCHEMAS[node] ?? {});
}

export function validateNode2CriterionMapping(
  artifact: unknown
): ValidationIssue[] {
  if (!isObject(artifact)) return [];
  const criteria = Array.isArray(artifact.acceptance_criteria)
    ? (artifact.acceptance_criteria as Array<Record<string, unknown>>)
    : [];
  const mapping = Array.isArray(artifact.criterion_mapping)
    ? (artifact.criterion_mapping as Array<Record<string, unknown>>)
    : [];
  const ids = new Set(criteria.map((c) => String(c.id)));
  const issues: ValidationIssue[] = [];
  if (ids.size && mapping.length === 0) {
    issues.push({
      path: "criterion_mapping",
      message: "Acceptance criteria exist but no tests are mapped to them.",
    });
  }
  return issues;
}