/**
 * Versioned document schema validation for persisted runs.
 *
 * getRun() refuses to return documents that do not satisfy the expected
 * shape, so reporters never render half-written or foreign data.
 */

import { SCHEMA_VERSION } from "../core/contracts.js";

export interface SchemaIssue {
  path: string;
  message: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural checks for a persisted run document. */
export function validateRunDocument(doc: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isObject(doc)) {
    return [{ path: "$", message: "Run document is not a JSON object." }];
  }
  if (doc["schemaVersion"] !== SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `Expected schemaVersion ${SCHEMA_VERSION}, found ${String(doc["schemaVersion"])}.`,
    });
  }
  const requiredStrings: Array<[string, unknown]> = [
    ["id", doc["id"]],
    ["status", doc["status"]],
    ["createdAt", doc["createdAt"]],
  ];
  for (const [key, value] of requiredStrings) {
    if (typeof value !== "string" || value.length === 0) {
      issues.push({ path: key, message: `Missing or invalid string field "${key}".` });
    }
  }
  for (const [key, value] of Object.entries({
    request: doc["request"],
    repository: doc["repository"],
    capabilities: doc["capabilities"],
  })) {
    if (!isObject(value)) {
      issues.push({ path: key, message: `Missing object field "${key}".` });
    }
  }
  if (!Array.isArray(doc["stages"])) {
    issues.push({ path: "stages", message: 'Missing array field "stages".' });
  }
  if (!Array.isArray(doc["findings"])) {
    issues.push({ path: "findings", message: 'Missing array field "findings".' });
  }
  if (!Array.isArray(doc["evidence"])) {
    issues.push({ path: "evidence", message: 'Missing array field "evidence".' });
  }
  return issues;
}
