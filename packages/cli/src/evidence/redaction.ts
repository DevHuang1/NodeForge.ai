/**
 * Secret redaction.
 *
 * Applied before terminal output, persistence, artifact storage, LLM
 * submission, and report generation. Rules are pattern-based with
 * provider-specific matchers; each replacement records which rule fired so
 * audit trails can prove redaction happened.
 */

export interface RedactionRule {
  name: string;
  pattern: RegExp;
}

export const REDACTION_RULES: readonly RedactionRule[] = [
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { name: "github-fine-grained", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: "openrouter-key", pattern: /\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/g },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "aws-secret", pattern: /\b(?![A-Za-z0-9]*--)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "bearer-token", pattern: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{12,}\b/g },
  {
    name: "credential-assignment",
    pattern:
      /\b(api[_-]?key|secret|token|passwd|password|access[_-]?key)\b\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  },
  { name: "url-credentials", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^@\s/:]+:[^@\s/]+@/gi },
];

export interface RedactionResult {
  text: string;
  appliedRules: string[];
}

function freshRules(): RedactionRule[] {
  return REDACTION_RULES.map((rule) => ({ name: rule.name, pattern: new RegExp(rule.pattern.source, rule.pattern.flags) }));
}

/** Redact a single string, reporting which rules matched. */
export function redactString(input: string): RedactionResult {
  let text = input;
  const applied: string[] = [];
  for (const rule of freshRules()) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      applied.push(rule.name);
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, `[REDACTED:${rule.name}]`);
    }
  }
  return { text, appliedRules: applied };
}

const REDACTED_SENTINEL = "__nodeforge_redacted__";

/**
 * Deeply redact all strings inside a JSON-like value. Returns the sanitized
 * value plus the union of applied rule names. Cycles are tolerated.
 */
export function redactDeep<T>(value: T): { value: T; appliedRules: string[] } {
  const applied = new Set<string>();
  const seen = new WeakSet<object>();

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      const result = redactString(node);
      for (const rule of result.appliedRules) applied.add(rule);
      return result.text;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === "object") {
      if (seen.has(node)) return REDACTED_SENTINEL;
      seen.add(node);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };

  const cleaned = walk(value) as T;
  return { value: cleaned, appliedRules: [...applied].sort() };
}

/** True when the text still contains something that looks like a secret. */
export function containsLikelySecret(text: string): boolean {
  for (const rule of freshRules()) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) return true;
  }
  return false;
}
