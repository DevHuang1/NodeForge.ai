/**
 * Stable JSON reporter: key-sorted, pretty-printed, parse-equal round trips.
 */

import type { VerificationRun } from "../core/contracts.js";

/** Deterministic JSON: object keys sorted recursively. */
export function stableStringify(value: unknown, indent = 2): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function renderRunJson(run: VerificationRun): string {
  return stableStringify(run);
}
