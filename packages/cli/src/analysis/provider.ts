/**
 * Optional LLM analysis provider (OpenAI-compatible chat completions).
 *
 * Hard constraints:
 * - Analysis is evidence-constrained: the model receives only redacted,
 *   bounded excerpts from this run and may only reference files that exist in
 *   the snapshot. It can never invent execution results.
 * - Provider failure degrades to a blocked analysis outcome; deterministic
 *   findings and test results are never modified or erased by analysis.
 * - Credentials come from environment variables only and are never logged.
 */

import type {
  AnalysisInput,
  AnalysisProvider,
  AnalysisResult,
  RawAnalysisFinding,
  Severity,
} from "../core/contracts.js";
import { ErrorCode, EngineError } from "../core/errors.js";
import type { NodeForgeConfig } from "../config/config.js";
import { redactString } from "../evidence/redaction.js";

const REQUEST_TIMEOUT_MS = 45_000;
const VALID_SEVERITIES: ReadonlySet<string> = new Set(["low", "medium", "high", "critical"]);

export function resolveAnalysisKey(preferred?: string | null): { key: string; providerLabel: string } | null {
  const candidates: Array<[string, string]> = [
    ["openrouter", process.env.OPENROUTER_API_KEY?.trim() ?? ""],
    ["openai", process.env.OPENAI_API_KEY?.trim() ?? ""],
    ["featherless", process.env.FEATHERLESS_API_KEY?.trim() ?? ""],
  ];
  for (const [label, key] of candidates) {
    if (!key) continue;
    if (preferred && label !== preferred) continue;
    return { key, providerLabel: label };
  }
  return null;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface ParsedAnalysis {
  findings?: Array<{
    ruleId?: string;
    category?: string;
    severity?: string;
    message?: string;
    filePath?: string;
    startLine?: number;
    recommendedAction?: string;
  }>;
}

export class OpenAICompatibleProvider implements AnalysisProvider {
  id = "openai-compatible";

  constructor(
    private readonly config: NodeForgeConfig,
    private readonly providerOverride: string | null = null
  ) {}

  async analyze(input: AnalysisInput, signal: AbortSignal): Promise<AnalysisResult> {
    const started = Date.now();
    const credentials = resolveAnalysisKey(this.providerOverride ?? null);
    if (!credentials) {
      return blockedOutcome("No analysis API key configured (set OPENROUTER_API_KEY or OPENAI_API_KEY).", started);
    }
    const envBaseUrl =
      this.providerOverride === "openai"
        ? process.env.OPENAI_BASE_URL
        : this.providerOverride === "featherless"
          ? process.env.FEATHERLESS_BASE_URL
          : process.env.OPENROUTER_BASE_URL ?? process.env.OPENAI_BASE_URL;
    const fallbackBaseUrl =
      this.providerOverride === "openai"
        ? "https://api.openai.com/v1"
        : "https://openrouter.ai/api/v1";
    const baseUrl = (this.config.analysis.baseUrl ?? envBaseUrl ?? fallbackBaseUrl).replace(/\/+$/, "");
    const model =
      this.config.analysis.model ??
      (this.providerOverride === "openai" ? process.env.OPENAI_MODEL : undefined) ??
      process.env.OPENROUTER_MODEL ??
      "openai/gpt-4o-mini";

    const prompt = buildPrompt(input);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 1200,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      if (!response.ok) {
        return blockedOutcome(`Analysis provider returned HTTP ${response.status}.`, started);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content ?? "";
      const candidates = parseAnalysisContent(content, input);
      return {
        outcome: {
          status: candidates.length > 0 || hasDeterministicWork(input) ? "passed" : "not_executed",
          providerId: this.id,
          model,
          reason: `Analysis completed via ${credentials.providerLabel}; ${candidates.length} validated finding(s).`,
          findingsContributed: candidates.length,
          durationMs: Date.now() - started,
        },
        candidates,
      };
    } catch (error) {
      if ((error as Error).name === "AbortError" || signal.aborted) throw error;
      return blockedOutcome(`Analysis provider unreachable: ${redactString((error as Error).message).text}`, started);
    }
  }
}

function hasDeterministicWork(input: AnalysisInput): boolean {
  return input.run.findings.length > 0 || input.run.testSummary !== null;
}

function blockedOutcome(reason: string, started: number): AnalysisResult {
  return {
    outcome: {
      status: "blocked",
      providerId: null,
      model: null,
      reason,
      findingsContributed: 0,
      durationMs: Date.now() - started,
    },
    candidates: [],
  };
}

const SYSTEM_PROMPT = [
  "You are a code-review analyst. You receive deterministic scan findings and test outcomes.",
  "Return ONLY JSON: {\"findings\":[{\"ruleId\",\"category\",\"severity\",\"message\",\"filePath\",\"startLine\",\"recommendedAction\"}]}.",
  "Rules: severity must be low|medium|high|critical. filePath must be one of the files listed in the input.",
  "Do not invent test results or claim code was executed. Do not add findings without concrete evidence in the input.",
].join(" ");

function buildPrompt(input: AnalysisInput): string {
  const run = input.run;
  const lines: string[] = [];
  lines.push(`Repository: ${run.repository.remoteUrl ?? run.request.target.path ?? "unknown"}`);
  lines.push(`Mode: ${run.request.mode}`);
  const tests = run.testSummary;
  lines.push(
    tests
      ? `Tests: status=${tests.status} passed=${tests.passed} failed=${tests.failed} runner=${tests.runner ?? "none"}`
      : "Tests: not executed"
  );
  lines.push(`Deterministic findings (${run.findings.length}):`);
  for (const finding of run.findings.slice(0, input.maxFindings)) {
    lines.push(
      `- [${finding.ruleId}] ${finding.severity} ${finding.filePath}:${finding.startLine} — ${redactString(finding.message).text}`
    );
  }
  const scannable = run.repository.changedFiles.filter((f) => !f.binary).slice(0, 50);
  lines.push(`Files available for reference: ${scannable.map((f) => f.path).join(", ")}`);
  lines.push(
    "Task: classify each deterministic finding with a corrected severity if warranted, and add at most 3 additional findings that are directly supported by the listed evidence. Respond with JSON only."
  );
  return lines.join("\n");
}

/** Strict validation: unknown severities and unknown file paths are dropped. */
export function parseAnalysisContent(content: string, input: AnalysisInput): RawAnalysisFinding[] {
  let parsed: ParsedAnalysis;
  try {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new EngineError(ErrorCode.Internal, "no json");
    parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as ParsedAnalysis;
  } catch {
    return [];
  }
  const knownPaths = new Set(input.run.repository.changedFiles.map((f) => f.path));
  const out: RawAnalysisFinding[] = [];
  for (const raw of parsed.findings ?? []) {
    if (!raw.message || !raw.filePath) continue;
    if (!VALID_SEVERITIES.has(raw.severity ?? "")) continue;
    if (!knownPaths.has(raw.filePath)) continue;
    out.push({
      ruleId: raw.ruleId && raw.ruleId.startsWith("NF-") ? raw.ruleId : "NF-ANALYSIS",
      category: raw.category ?? "analysis",
      severity: raw.severity as Severity,
      message: String(raw.message).slice(0, 300),
      filePath: raw.filePath,
      startLine: typeof raw.startLine === "number" && raw.startLine > 0 ? Math.floor(raw.startLine) : 1,
      recommendedAction: String(raw.recommendedAction ?? "Review this location manually.").slice(0, 300),
    });
    if (out.length >= 10) break;
  }
  return out;
}

export class DisabledAnalysisProvider implements AnalysisProvider {
  id = "disabled";

  async analyze(_input: AnalysisInput, _signal: AbortSignal): Promise<AnalysisResult> {
    void _input;
    void _signal;
    return {
      outcome: {
        status: "skipped",
        providerId: this.id,
        model: null,
        reason: "Analysis disabled in configuration.",
        findingsContributed: 0,
        durationMs: 0,
      },
      candidates: [],
    };
  }
}

export function createAnalysisProvider(
  config: NodeForgeConfig,
  providerOverride?: string | null
): AnalysisProvider {
  if (!config.analysis.enabled || providerOverride === "none") return new DisabledAnalysisProvider();
  return new OpenAICompatibleProvider(config, providerOverride ?? null);
}
