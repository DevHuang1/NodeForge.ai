/**
 * VerificationEngine: the single orchestration entry point.
 *
 * Executes a fixed stage graph (see planner.ts) with consistent timing,
 * audit logging, cancellation, and evidence collection. Adapters are injected;
 * the engine contains no I/O policy of its own beyond the stage graph.
 */

import type {
  AnalysisOutcome,
  AnalysisProvider,
  AuditAction,
  RunMode,
  ReviewTarget,
  RunRepository,
  SourceProvider,
  StageName,
  StageOutcome,
  TestExecutor,
  TestSummary,
  VerificationRun,
  VerificationStatus,
} from "./contracts.js";
import { SCHEMA_VERSION } from "./contracts.js";
import type { NodeForgeConfig } from "../config/config.js";
import { fingerprintConfig } from "../config/config.js";
import type { ExecutionPolicy } from "./policy.js";
import { policyFromConfig } from "./policy.js";
import { ErrorCode, EngineError } from "./errors.js";
import { planStages } from "./planner.js";
import { synthesizeStatus } from "./synthesis.js";
import { transitionRun } from "./state-machine.js";
import { DeterministicScanEngine } from "../scanners/deterministic.js";
import { BUILTIN_RULES } from "../scanners/rules.js";
import { parseTarget, resolveRefTarget } from "../context/repository.js";
import { detectCapabilities } from "../context/capability-map.js";
import { EvidenceCollector } from "../evidence/evidence.js";
import { AuditLogger } from "../audit/logger.js";
import {
  newId,
  nowIso,
  realClock,
  truncate,
  type Clock,
} from "../utils/misc.js";
import { promises as fs } from "fs";

export interface EngineRequest {
  mode: RunMode;
  /** Raw target argument: path, git ref, or GitHub PR URL. */
  targetInput: string;
  cwd: string;
  config: NodeForgeConfig;
  /** Defaults to policyFromConfig(config) when omitted. */
  policy?: ExecutionPolicy;
  dryRun: boolean;
  requestedBy?: string;
  signal: AbortSignal;
  onStage?: (
    stage: StageName,
    status: VerificationStatus,
    detail: string,
  ) => void;
}

export interface EngineDeps {
  version: string;
  clock?: Clock;
  localSource: SourceProvider;
  githubSource: SourceProvider;
  executor: TestExecutor;
  analysis: AnalysisProvider;
  repository: RunRepository;
}

function emptyStage(stage: StageName, startedAt: string): StageOutcome {
  return {
    stage,
    status: "passed",
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    reason: "",
    evidenceIds: [],
    artifactIds: [],
    errors: [],
  };
}

export class VerificationEngine {
  constructor(private readonly deps: EngineDeps) {}

  async run(request: EngineRequest): Promise<VerificationRun> {
    const clock = this.deps.clock ?? realClock;
    const policy = request.policy ?? policyFromConfig(request.config);
    const startedAt = clock.now();
    const runId = newId("run");
    const audit = new AuditLogger(this.deps.repository, runId);
    const evidence = new EvidenceCollector(clock);
    const scanner = new DeterministicScanEngine(BUILTIN_RULES, evidence);

    const record = (
      stage: StageName | null,
      action: AuditAction,
      metadata: Record<string, unknown> = {},
      outcome: "ok" | "error" | "denied" | "cancelled" = "ok",
    ): void => {
      // Dry runs never persist anything: audit events are not written either.
      if (request.dryRun) return;
      void audit.record(action, { stage, outcome, metadata }).catch(() => {});
    };

    // ── Prepare: resolve the target before any side effects. ────────────────
    const target = await this.resolveTarget(request);
    const run: VerificationRun = {
      id: runId,
      schemaVersion: SCHEMA_VERSION,
      status: "running",
      request: {
        mode: request.mode,
        target: sanitizeTarget(target),
        correlationId: newId("corr"),
        requestedBy: request.requestedBy ?? "cli",
        dryRun: request.dryRun,
        configFingerprint: fingerprintConfig(request.config),
      },
      repository: {
        root: null,
        ref: null,
        commitSha: null,
        remoteUrl: null,
        pullRequest: null,
        changedFiles: [],
        fileCount: 0,
        truncated: false,
        notes: [],
      },
      capabilities: {
        languages: [],
        packageManagers: [],
        frameworks: [],
        testRunners: [],
        notes: [],
      },
      stages: [],
      findings: [],
      testSummary: null,
      analysis: null,
      evidence: [],
      artifacts: [],
      createdAt: nowIso(clock),
      completedAt: null,
      durationMs: 0,
      nodeforgeVersion: this.deps.version,
    };
    record(null, "run.created", { mode: request.mode, dryRun: request.dryRun });

    let workspaceCleanup: (() => Promise<void>) | null = null;
    let pendingDiscovery: Awaited<ReturnType<TestExecutor["discover"]>> | null =
      null;
    let contextBlockedReason: string | null = null;
    let persistAfterLoop = false;
    try {
      const stages = planStages(request.mode, request.config);
      for (const stageName of stages) {
        if (request.signal.aborted) {
          run.stages.push(
            finishStage(
              emptyStage(stageName, nowIso(clock)),
              "skipped",
              "Cancelled before this stage.",
              clock,
            ),
          );
          continue;
        }

        const stage = emptyStage(stageName, nowIso(clock));
        record(stageName, "stage.started", {});
        let detail = "";
        try {
          switch (stageName) {
            case "prepare":
              detail = `Resolved target ${describeTarget(target)}.`;
              break;

            case "context": {
              request.signal.throwIfAborted();
              const source =
                target.kind === "pull_request"
                  ? this.deps.githubSource
                  : this.deps.localSource;
              const loaded = await source.load(target, policy, request.signal);
              workspaceCleanup = loaded.cleanup;
              run.repository = loaded.snapshot;
              detail = loaded.snapshot.pullRequest
                ? `Loaded PR #${loaded.snapshot.pullRequest.number} (${loaded.snapshot.changedFiles.length} changed files).`
                : `Loaded ${loaded.snapshot.fileCount} files at ${loaded.snapshot.commitSha?.slice(0, 12) ?? "unknown revision"}.`;
              for (const note of loaded.snapshot.notes) detail += ` ${note}`;
              break;
            }

            case "capability_map":
              request.signal.throwIfAborted();
              run.capabilities = await detectCapabilities(run.repository);
              detail = `Languages: ${run.capabilities.languages.join(", ") || "unknown"}.`;
              break;

            case "deterministic_scan": {
              request.signal.throwIfAborted();
              const scan = await scanner.scan(
                run.repository.changedFiles,
                policy,
              );
              run.findings = scan.findings;
              record(stageName, "finding.recorded", {
                count: scan.findings.length,
              });
              detail = `Scanned ${scan.filesScanned} file(s), ${scan.filesSkipped} skipped; ${scan.findings.length} finding(s).`;
              break;
            }

            case "test_discovery": {
              if (request.mode === "review" && !request.config.tests.enabled) {
                stage.status = "skipped";
                detail = "Tests disabled in configuration.";
                break;
              }
              request.signal.throwIfAborted();
              const discovery = await this.deps.executor.discover(
                run.repository,
                run.capabilities,
                request.config,
                policy,
              );
              pendingDiscovery = discovery;
              detail = discovery.reason;
              if (!discovery.runner) stage.status = "not_executed";
              break;
            }

            case "test_execution": {
              if (request.mode === "review" && !request.config.tests.enabled) {
                stage.status = "skipped";
                detail = "Tests disabled in configuration.";
                break;
              }
              if (!pendingDiscovery || !pendingDiscovery.runner) {
                stage.status = "not_executed";
                detail = pendingDiscovery?.reason ?? "No runner selected.";
                break;
              }
              request.signal.throwIfAborted();
              const hooks = {
                onCommandExecuted: (
                  command: string[],
                  durationMs: number,
                  exitCode: number | null,
                ): void => {
                  record(stageName, "command.executed", {
                    command: command.join(" "),
                    durationMs,
                    exitCode,
                  });
                },
                onPolicyDenied: (reason: string): void => {
                  record(stageName, "policy.denied", { reason }, "denied");
                },
              };
              const summary = await this.executeTests(
                run,
                pendingDiscovery,
                request,
                policy,
                request.signal,
                hooks,
                evidence,
                audit,
              );
              run.testSummary = summary;
              stage.status =
                summary.status === "passed"
                  ? "passed"
                  : summary.status === "failed"
                    ? "failed"
                    : summary.status;
              detail = summary.reason;
              break;
            }

            case "analysis": {
              if (request.dryRun) {
                stage.status = "skipped";
                detail = "Dry run: analysis not executed.";
                break;
              }
              request.signal.throwIfAborted();
              const outcome = await this.runAnalysis(
                run,
                request,
                request.signal,
              );
              run.analysis = outcome;
              stage.status =
                outcome.status === "passed" ? "passed" : outcome.status;
              detail = outcome.reason;
              record(stageName, "analysis.completed", {
                providerId: outcome.providerId,
                findingsContributed: outcome.findingsContributed,
                status: outcome.status,
              });
              break;
            }

            case "synthesis": {
              if (request.dryRun) {
                stage.status = "skipped";
                detail = "Dry run.";
                break;
              }
              run.status = synthesizeStatus(run, request.config);
              detail = `Synthesized status ${run.status}.`;
              break;
            }

            case "persistence": {
              if (request.dryRun) {
                stage.status = "skipped";
                detail = "Dry run: nothing persisted.";
                break;
              }
              request.signal.throwIfAborted();
              // Persistence completes *after* this stage is pushed so the saved
              // run includes every stage. The audit event stays here.
              persistAfterLoop = true;
              detail = "Will persist once synthesis completes.";
              break;
            }
          }
        } catch (error) {
          if (
            request.signal.aborted ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            stage.status = "blocked";
            stage.errors.push({
              code: ErrorCode.Cancelled,
              message: "Cancelled.",
              retryable: false,
            });
            detail = "Cancelled.";
            record(
              stageName,
              "stage.completed",
              { status: "cancelled" },
              "cancelled",
            );
            run.stages.push(finishStage(stage, stage.status, detail, clock));
            continue;
          }
          const engineError =
            error instanceof EngineError
              ? error
              : new EngineError(
                  ErrorCode.Internal,
                  truncate((error as Error).message, 500).text,
                );
          stage.errors.push({
            code: engineError.code,
            message: engineError.message,
            stage: stageName,
            retryable: engineError.retryable,
          });
          stage.status = "failed";
          detail = `${engineError.code}: ${engineError.message}`;
          record(
            stageName,
            "stage.completed",
            { status: "failed", code: engineError.code },
            "error",
          );

          // Context failures for remote targets block rather than abort so the
          // run can still be persisted honestly with exit 3.
          if (stageName === "context" && target.kind === "pull_request") {
            stage.status = "blocked";
            contextBlockedReason = engineError.message;
            run.stages.push(finishStage(stage, stage.status, detail, clock));
            continue;
          }
          if (stageName === "prepare" || stageName === "persistence")
            throw engineError;
          // Non-fatal stage failure: keep going; synthesis will decide.
        }

        run.stages.push(finishStage(stage, stage.status, detail, clock));
        if (stage.status !== "skipped") {
          record(stageName, "stage.completed", { status: stage.status });
        }
        request.onStage?.(stageName, stage.status, detail);
      }

      // Cancellation finalization.
      if (request.signal.aborted && run.status !== "cancelled") {
        transitionRun(run, "cancelled");
      }

      // Blocked-context runs never reached synthesis; finalize here.
      if (contextBlockedReason !== null) {
        run.status = "blocked";
        finalizeRunRecord(run, evidence, clock, startedAt);
        if (!request.dryRun) {
          await this.deps.repository.saveRun(run).catch(() => {});
        }
        return run;
      }

      if (!request.dryRun && !run.stages.some((s) => s.stage === "synthesis")) {
        run.status = synthesizeStatus(run, request.config);
      }
      if (run.status === "running") {
        run.status = synthesizeStatus(run, request.config);
      }
      finalizeRunRecord(run, evidence, clock, startedAt);
      if (persistAfterLoop) {
        await this.deps.repository.saveRun(run);
        record(null, "run.persisted", { id: run.id });
      }
      return run;
    } finally {
      if (workspaceCleanup) await workspaceCleanup().catch(() => {});
    }
  }

  private async resolveTarget(request: EngineRequest): Promise<ReviewTarget> {
    const parsed = parseTarget(request.targetInput, request.cwd);
    if (parsed.kind === "pull_request") return parsed;
    try {
      const stat = await fs.stat(parsed.path);
      if (!stat.isDirectory()) {
        throw new EngineError(
          ErrorCode.InvalidTarget,
          `"${parsed.path}" is a file; nodeforge verifies repositories (pass a directory, git ref, or PR URL).`,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof EngineError) throw error;
      const asRef = await resolveRefTarget(request.targetInput, request.cwd);
      if (asRef) return asRef;
      throw new EngineError(
        ErrorCode.InvalidTarget,
        `"${request.targetInput}" is neither an existing directory nor a git ref resolvable in ${request.cwd}.`,
      );
    }
  }

  private async executeTests(
    run: VerificationRun,
    discovery: Awaited<ReturnType<TestExecutor["discover"]>>,
    request: EngineRequest,
    policy: ExecutionPolicy,
    signal: AbortSignal,
    hooks: Parameters<TestExecutor["execute"]>[5],
    evidence: EvidenceCollector,
    audit: AuditLogger,
  ): Promise<TestSummary> {
    try {
      const summary = await this.deps.executor.execute(
        run.repository,
        discovery,
        request.config,
        policy,
        signal,
        hooks,
      );
      const stdout = evidence.add({
        kind: "stdout",
        content: summary.stdoutExcerpt || "(no stdout)",
      });
      const stderr = evidence.add({
        kind: "stderr",
        content: summary.stderrExcerpt || "(no stderr)",
      });
      summary.evidenceIds = [stdout.id, stderr.id];
      if (request.config.report.artifacts) {
        const sink = (name: string, content: string): Promise<string> =>
          this.deps.repository
            .saveArtifact(run.id, name, content)
            .then(() => name);
        const log = await evidence.addArtifact(
          sink,
          "test-output.log",
          `${summary.stdoutExcerpt}\n${summary.stderrExcerpt}`,
        );
        if (log.artifact) run.artifacts.push(log.artifact);
        summary.evidenceIds.push(log.evidence.id);
      }
      return summary;
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      if (
        error instanceof EngineError &&
        error.code === ErrorCode.MissingRuntime
      ) {
        recordTestBlocked(audit, error.message);
        return blockedSummary(
          discovery.runner?.id ?? null,
          discovery.runner?.command ?? null,
          error.message,
          policy,
        );
      }
      if (
        error instanceof EngineError &&
        error.code === ErrorCode.PolicyDenied
      ) {
        recordTestBlocked(audit, error.message);
        return blockedSummary(
          discovery.runner?.id ?? null,
          discovery.runner?.command ?? null,
          error.message,
          policy,
        );
      }
      throw error;
    }
  }

  private async runAnalysis(
    run: VerificationRun,
    request: EngineRequest,
    signal: AbortSignal,
  ): Promise<AnalysisOutcome> {
    const started = Date.now();
    try {
      const result = await this.deps.analysis.analyze(
        { run, maxFindings: request.config.analysis.maxFindings },
        signal,
      );
      if (result.candidates.length > 0) {
        const known = new Set(run.repository.changedFiles.map((f) => f.path));
        const merged = [...run.findings.map((f) => ({ ...f }))];
        let contributed = 0;
        for (const candidate of result.candidates) {
          if (!known.has(candidate.filePath)) continue;
          merged.push({
            id: `NF-A${String(contributed + 1).padStart(2, "0")}`,
            fingerprint: `analysis-${contributed + 1}-${candidate.filePath}`,
            ruleId: candidate.ruleId,
            category: candidate.category,
            severity: candidate.severity,
            description: "LLM analysis finding (evidence-constrained).",
            message: candidate.message,
            filePath: candidate.filePath,
            startLine: candidate.startLine,
            endLine: candidate.startLine,
            confidence: "low",
            recommendedAction: candidate.recommendedAction,
            source: "analysis",
            evidenceIds: [],
          });
          contributed += 1;
        }
        run.findings = merged;
        result.outcome.findingsContributed = contributed;
      }
      return result.outcome;
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      return {
        status: "blocked",
        providerId: null,
        model: null,
        reason: `Analysis failed and was recorded as blocked: ${truncate((error as Error).message, 300).text}`,
        findingsContributed: 0,
        durationMs: Date.now() - started,
      };
    }
  }
}

// Per-run scratch state lives in run()-local variables; nothing module-scoped.

function recordTestBlocked(audit: AuditLogger, reason: string): void {
  void audit
    .record("policy.denied", {
      stage: "test_execution",
      outcome: "denied",
      metadata: { reason },
    })
    .catch(() => {});
}

function blockedSummary(
  runnerId: string | null,
  command: string[] | null,
  reason: string,
  policy: ExecutionPolicy,
): TestSummary {
  return {
    status: "blocked",
    runner: runnerId,
    command,
    discovered: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    durationMs: 0,
    exitCode: null,
    signal: null,
    timedOut: false,
    reason,
    stdoutExcerpt: "",
    stderrExcerpt: "",
    evidenceIds: [],
    networkPolicy: policy.networkDuringTests,
    networkEnforcement:
      policy.networkDuringTests === "denied" ? "best_effort" : "not_enforced",
  };
}

function finishStage(
  stage: StageOutcome,
  status: VerificationStatus,
  reason: string,
  clock: Clock,
): StageOutcome {
  const completedAt = nowIso(clock);
  return {
    ...stage,
    status,
    reason,
    completedAt,
    durationMs: Math.max(
      0,
      Date.parse(completedAt) - Date.parse(stage.startedAt) || 0,
    ),
  };
}

function finalizeRunRecord(
  run: VerificationRun,
  evidence: EvidenceCollector,
  clock: Clock,
  startedAt: Date,
): void {
  run.evidence = evidence.list();
  run.completedAt = nowIso(clock);
  run.durationMs = Math.max(0, clock.now().getTime() - startedAt.getTime());
}

function sanitizeTarget(
  target: ReviewTarget,
): VerificationRun["request"]["target"] {
  if (target.kind === "pull_request") {
    return {
      kind: "pull_request",
      url: target.url,
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    };
  }
  return {
    kind: "local",
    path: target.path,
    ...(target.ref ? { ref: target.ref } : {}),
  };
}

function describeTarget(target: ReviewTarget): string {
  return target.kind === "pull_request"
    ? target.url
    : `${target.path}${target.ref ? `@${target.ref}` : ""}`;
}
