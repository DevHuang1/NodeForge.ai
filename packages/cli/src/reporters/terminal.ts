/**
 * Terminal reporter: concise, honest, color-aware summary.
 * Blocked and unexecuted stages are always surfaced prominently.
 */

import type { Severity, VerificationRun, VerificationStatus } from "../core/contracts.js";
import { exitCodeForRun } from "../core/exit-codes.js";
import { formatDuration } from "../utils/misc.js";

type Color = (text: string) => string;

function severityCounts(findings: readonly { severity: Severity }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function statusLabel(status: VerificationStatus | string): string {
  return status.toUpperCase().replace(/_/g, " ");
}

export function renderRunTerminal(run: VerificationRun, useColor: boolean): string {
  const green: Color = useColor ? (t) => `\u001B[32m${t}\u001B[0m` : (t) => t;
  const red: Color = useColor ? (t) => `\u001B[31m${t}\u001B[0m` : (t) => t;
  const yellow: Color = useColor ? (t) => `\u001B[33m${t}\u001B[0m` : (t) => t;
  const dim: Color = useColor ? (t) => `\u001B[2m${t}\u001B[0m` : (t) => t;
  const bold: Color = useColor ? (t) => `\u001B[1m${t}\u001B[0m` : (t) => t;

  const colorForStatus = (status: string): string => {
    switch (status) {
      case "completed":
      case "passed":
        return green(statusLabel(status));
      case "completed_with_findings":
      case "failed":
        return red(statusLabel(status));
      case "blocked":
      case "not_executed":
        return yellow(statusLabel(status));
      case "cancelled":
        return red("CANCELLED");
      default:
        return statusLabel(status);
    }
  };

  const lines: string[] = [];
  lines.push(bold(`NodeForge verification run ${run.id}`));

  const target =
    run.request.target.kind === "pull_request"
      ? run.request.target.url ?? "pull request"
      : `${run.request.target.path ?? "unknown"}${run.request.target.ref ? ` @ ${run.request.target.ref}` : ""}`;
  lines.push(`Target:   ${target}${run.repository.commitSha ? dim(` (${run.repository.commitSha.slice(0, 12)})`) : ""}`);
  lines.push(`Mode:     ${run.request.mode}${run.request.dryRun ? " (dry-run)" : ""} · Duration: ${formatDuration(run.durationMs)}`);
  lines.push(`Status:   ${colorForStatus(run.status)} ${dim(`(exit ${exitCodeForRun(run)})`)}`);

  // Findings
  if (run.findings.length > 0) {
    const counts = severityCounts(run.findings);
    lines.push("");
    lines.push(
      bold(`Findings: ${run.findings.length}`) +
        dim(` (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium}, low ${counts.low})`)
    );
    for (const finding of run.findings.slice(0, 20)) {
      const sev =
        finding.severity === "critical" || finding.severity === "high"
          ? red(finding.severity.toUpperCase())
          : yellow(finding.severity.toUpperCase());
      lines.push(`  ${dim(finding.id)} ${sev} ${dim(finding.ruleId)} ${finding.filePath}:${finding.startLine} — ${finding.message}`);
    }
    if (run.findings.length > 20) {
      lines.push(dim(`  … and ${run.findings.length - 20} more (see report)`));
    }
  } else {
    lines.push(green("Findings: none"));
  }

  // Tests
  lines.push("");
  const tests = run.testSummary;
  if (!tests) {
    lines.push(yellow("Tests:    NOT EXECUTED") + dim(" — no test stage in this run"));
  } else {
    const runnerPart = tests.runner ? dim(` (${tests.runner})`) : "";
    lines.push(`Tests:    ${colorForStatus(tests.status)}${runnerPart}`);
    if (tests.command) lines.push(dim(`          command: ${tests.command.join(" ")}`));
    lines.push(
      dim(
        `          ${tests.passed} passed · ${tests.failed} failed · ${tests.skipped} skipped · ${tests.discovered} discovered` +
          (tests.exitCode !== null ? ` · exit ${tests.exitCode}` : "") +
          (tests.timedOut ? " · TIMED OUT" : "")
      )
    );
    if (tests.reason) lines.push(dim(`          ${tests.reason}`));
  }

  // Analysis
  if (run.analysis) {
    const a = run.analysis;
    lines.push(`Analysis: ${colorForStatus(a.status)}${a.providerId ? dim(` (${a.providerId})`) : ""}`);
    if (a.reason) lines.push(dim(`          ${a.reason}`));
  }

  // Blocked / skipped stages are never hidden.
  const notableStages = run.stages.filter(
    (s) => s.status === "blocked" || s.status === "not_executed" || s.status === "skipped" || s.errors.length > 0
  );
  if (notableStages.length > 0) {
    lines.push("");
    lines.push(bold("Stage notes:"));
    for (const stage of notableStages) {
      const label = colorForStatus(stage.status);
      lines.push(`  ${label.padEnd(16)} ${stage.stage}: ${stage.reason || "(no detail)"}`);
      for (const error of stage.errors) {
        lines.push(red(`    ${error.code}: ${error.message}`));
      }
    }
  }

  if (run.repository.notes.length > 0) {
    lines.push("");
    for (const note of run.repository.notes) lines.push(dim(`note: ${note}`));
  }

  lines.push("");
  lines.push(dim(`Evidence records: ${run.evidence.length} · Artifacts: ${run.artifacts.length}`));
  return lines.join("\n");
}
