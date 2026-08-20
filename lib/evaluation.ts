import type {
  EvaluationMetrics,
  EvaluationResult,
  ReviewRun,
  ReviewRunSummary,
} from "./types";
import { listReviewRuns } from "./persistence";
import { securityFindingsMarkdown } from "./security-rules";

export function evaluateRun(run: ReviewRun): EvaluationMetrics {
  const node2 = run.artifacts.node2;
  const node3 = run.artifacts.node3;
  const node4 = run.artifacts.node4;

  const criteria = node2?.acceptance_criteria ?? [];
  const mapping = node3?.criterion_mapping ?? [];
  const covered = mapping.filter((m) => m.coverage_status !== "uncovered").length;
  const requirementCoverage = criteria.length
    ? Math.round((covered / criteria.length) * 100) / 100
    : 0;

  const executed = run.testResult?.items.filter((i) => i.verification_status === "executed") ?? [];
  const testExecutionAccuracy =
    run.testResult && executed.length
      ? Math.round((run.testResult.passed / executed.length) * 100) / 100
      : null;

  const contextPaths = new Set((run.context?.files ?? []).map((f) => f.path));
  const modelRefsOutsidePr = run.modelFindings.filter(
    (f) => f.file_path && !contextPaths.has(f.file_path)
  ).length;

  const honestyFindings =
    node4?.findings.filter((f) => f.category === "honesty").length ?? 0;
  const falseExecuted = (run.testResult?.items ?? []).filter(
    (i) => run.offline && i.verification_status === "executed"
  ).length;

  const inputTokens = Object.values(run.usage ?? {})
    .filter(Boolean)
    .reduce((sum, u) => sum + (u?.input_tokens ?? 0), 0);
  const outputTokens = Object.values(run.usage ?? {})
    .filter(Boolean)
    .reduce((sum, u) => sum + (u?.output_tokens ?? 0), 0);

  return {
    requirementCoverage,
    testExecutionAccuracy,
    findingPrecision: null,
    findingRecall: null,
    hallucinatedClaims: honestyFindings + falseExecuted + modelRefsOutsidePr,
    latencyMs: run.durationMs,
    inputTokens,
    outputTokens,
    providerFallbacks: run.retryCount,
  };
}

function compositeScore(m: EvaluationMetrics): number {
  const acc = m.testExecutionAccuracy ?? 0;
  return (
    m.requirementCoverage * 0.4 +
    acc * 0.3 +
    Math.max(0, 1 - m.hallucinatedClaims / 10) * 0.2 +
    Math.max(0, 1 - m.providerFallbacks / 5) * 0.1
  );
}

export async function evaluateRunWithRegression(
  run: ReviewRun
): Promise<EvaluationResult> {
  const metrics = evaluateRun(run);
  const prior = await listReviewRuns({
    repo: run.repo,
    prNumber: String(run.prNumber),
    limit: 50,
  });
  const previous = prior.find((p) => p.id !== run.id && p.createdAt < run.createdAt);
  let regressionDelta: number | null = null;
  if (previous) {
    const priorRun = await import("./persistence").then((p) => p.getReviewRun(previous.id));
    if (priorRun) {
      regressionDelta = Math.round((compositeScore(metrics) - compositeScore(evaluateRun(priorRun))) * 1000) / 1000;
    }
  }
  return {
    runId: run.id,
    metrics,
    regressionDelta,
    markdown: evaluationMarkdown(run, metrics, regressionDelta),
  };
}

function evaluationMarkdown(run: ReviewRun, m: EvaluationMetrics, delta: number | null): string {
  return [
    `## Evaluation — ${run.owner}/${run.repo}#${run.prNumber}`,
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Requirement coverage | ${(m.requirementCoverage * 100).toFixed(1)}% |`,
    `| Test execution accuracy | ${m.testExecutionAccuracy === null ? "n/a (no executed tests)" : `${(m.testExecutionAccuracy * 100).toFixed(1)}%`} |`,
    `| Finding precision | n/a (no labeled ground truth) |`,
    `| Finding recall | n/a (no labeled ground truth) |`,
    `| Hallucinated claims | ${m.hallucinatedClaims} |`,
    `| Latency | ${m.latencyMs} ms |`,
    `| Input tokens | ${m.inputTokens} |`,
    `| Output tokens | ${m.outputTokens} |`,
    `| Provider fallbacks | ${m.providerFallbacks} |`,
    `| Regression delta | ${delta === null ? "n/a (no prior run)" : delta} |`,
    "",
  ].join("\n");
}

export function buildReviewReport(run: ReviewRun): string {
  const findings = run.deterministicFindings.concat(run.modelFindings);
  const node2 = run.artifacts.node2;
  const node3 = run.artifacts.node3;
  const node4 = run.artifacts.node4;

  const sections: string[] = [];
  sections.push(
    `# Review report — ${run.owner}/${run.repo}#${run.prNumber}`,
    "",
    `**${run.title}**`,
    "",
    `- Status: ${run.status} (stage ${run.currentStage})`,
    `- Mode: ${run.offline ? "offline sample" : "live"}`,
    `- Provider: ${run.provider ?? "n/a"} · Model: ${run.model ?? "n/a"}`,
    `- Duration: ${run.durationMs} ms`,
    `- Head: \`${run.headSha.slice(0, 10)}\``,
    ""
  );

  sections.push("## Files in review", "");
  sections.push("| File | Size | Tokens | Reason |", "| --- | --- | --- | --- |");
  for (const f of run.context?.files ?? []) {
    sections.push(
      `| ${f.path} | ${f.sizeBytes} B | ${f.estimatedTokens} | ${f.reason}${f.selected ? "" : " (excluded)"} |`
    );
  }
  sections.push("");

  sections.push("## Context", "", `${run.context?.summary ?? "n/a"}`, "");

  sections.push("## Specification (Node 2)", "");
  sections.push(node2?.objective ?? "n/a");
  if (node2?.acceptance_criteria?.length) {
    sections.push("", "### Acceptance criteria");
    sections.push(
      ...node2.acceptance_criteria.map((c) => `- [${c.priority}] ${c.id}: ${c.criterion}`)
    );
  }
  sections.push("");

  sections.push("## Implementation & tests (Node 3)", "");
  if (node3?.implementation?.files?.length) {
    sections.push("### Proposed files");
    sections.push(
      ...node3.implementation.files.map((f) => `- \`${f.path}\` — ${f.change_summary}`)
    );
  }
  if (node3?.tests?.length) {
    sections.push("", "### Test matrix");
    sections.push(
      ...node3.tests.map(
        (t) => `- ${t.id} (${t.name}) → ${t.maps_to.join(", ")} — ${t.verification_status}`
      )
    );
  }
  sections.push("");

  sections.push("## Findings", "", `Total: ${findings.length}`);
  if (findings.length) {
    sections.push("", "| ID | Source | Severity | Category | File | Confidence |");
    sections.push("| --- | --- | --- | --- | --- | --- |");
    sections.push(
      ...findings.map(
        (f) =>
          `| ${f.id} | ${f.source} | ${f.severity} | ${f.category} | ${f.file_path}${f.line_start ? `:${f.line_start}` : ""} | ${f.confidence} |`
      )
    );
  }
  sections.push("");

  sections.push("## Security scan", "", securityFindingsMarkdown(run.deterministicFindings), "");

  const ts = run.testResult;
  sections.push("## Test execution", "");
  if (ts) {
    sections.push(
      `Status: ${ts.status} · tested ${ts.tested} · passed ${ts.passed} · failed ${ts.failed} · blocked ${ts.blocked} · not executed ${ts.not_executed}`,
      `Sandbox: ${ts.sandbox}`,
      ...ts.notes.map((n) => `- ${n}`)
    );
  } else {
    sections.push("No test execution recorded.");
  }
  sections.push("");

  if (node4) {
    sections.push(
      "## Quality gate (Node 4)",
      "",
      `Gate: ${node4.quality_gate}`,
      "",
      node4.final_response?.summary ?? "",
      ""
    );
  }

  sections.push("## Patch proposal", "");
  if (run.patch) {
    sections.push(run.patch.description, "", "```diff", run.patch.diff.slice(0, 8000), "```", "");
  } else {
    sections.push("No patch proposed.");
  }

  sections.push("## Decisions", "");
  if (run.decisions.length) {
    sections.push(
      ...run.decisions.map((d) => `- ${d.findingId} → ${d.action}${d.reason ? ` (${d.reason})` : ""} at ${d.at}`)
    );
  } else {
    sections.push("No decisions recorded.");
  }

  sections.push("", "---", `Generated by NodeForge.ai · policy v${run.policyVersion} · prompt v${run.promptVersion}`);

  return sections.join("\n");
}

export function summarizeRunList(runs: ReviewRunSummary[]): string {
  if (!runs.length) return "No review runs recorded.";
  return [
    "| ID | Repo | PR | Title | Status | Findings | Mode | Created |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...runs.map(
      (r) =>
        `| ${r.id} | ${r.owner}/${r.repo} | #${r.prNumber} | ${r.title.slice(0, 40)} | ${r.status} | ${r.findingsCount} | ${r.offline ? "offline" : "live"} | ${r.createdAt} |`
    ),
    "",
  ].join("\n");
}