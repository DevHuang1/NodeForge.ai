/**
 * Test discovery and guarded execution.
 *
 * Discovery never executes project code; it inspects manifests and lockfiles
 * (via the capability map) plus optional configuration overrides. Execution
 * goes through the allow-list and the guarded process runner only.
 */

import type {
  CapabilityMap,
  DetectedRunner,
  RepositorySnapshot,
  TestDiscovery,
  TestExecutor,
  TestSummary,
} from "../core/contracts.js";
import type { NodeForgeConfig } from "../config/config.js";
import type { ExecutionPolicy } from "../core/policy.js";
import { ErrorCode, EngineError } from "../core/errors.js";
import { runProcess } from "./process.js";
import { buildChildEnv, checkCommandAllowed } from "./sandbox.js";
import { countsAreCoherent, parseRunnerOutput, EMPTY_COUNTS } from "./parsers.js";
import { redactString } from "../evidence/redaction.js";
import { truncate } from "../utils/misc.js";

const EXCERPT_BYTES = 2000;

function emptySummary(partial: Partial<TestSummary>): TestSummary {
  return {
    status: "not_executed",
    runner: null,
    command: null,
    discovered: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    durationMs: 0,
    exitCode: null,
    signal: null,
    timedOut: false,
    reason: "",
    stdoutExcerpt: "",
    stderrExcerpt: "",
    evidenceIds: [],
    networkPolicy: "denied",
    networkEnforcement: "not_applicable",
    ...partial,
  };
}

export class GuardedTestExecutor implements TestExecutor {
  id = "guarded-local/1";

  async discover(
    snapshot: RepositorySnapshot,
    capabilities: CapabilityMap,
    config: NodeForgeConfig
  ): Promise<TestDiscovery> {
    void snapshot;
    const candidates = capabilities.testRunners;

    if (config.tests.commandOverride) {
      const override: DetectedRunner = {
        id: "configured",
        command: config.tests.commandOverride,
        source: ".nodeforge/config.json tests.commandOverride",
        confidence: "high",
        available: null,
      };
      return {
        runner: override,
        candidates: [override, ...candidates],
        reason: "Using configured command override.",
      };
    }

    if (config.tests.runnerOverride) {
      const wanted = config.tests.runnerOverride.toLowerCase();
      const match =
        candidates.find((c) => c.id === wanted) ??
        candidates.find((c) => c.id.startsWith(wanted));
      if (!match) {
        return {
          runner: null,
          candidates,
          reason: `Configured runner "${config.tests.runnerOverride}" was not detected in this repository.`,
        };
      }
      return { runner: match, candidates, reason: `Using configured runner override "${match.id}".` };
    }

    const firstUsable = candidates.find((c) => c.available !== false);
    if (!firstUsable) {
      return {
        runner: null,
        candidates,
        reason:
          candidates.length > 0
            ? `Detected ${candidates.map((c) => c.id).join(", ")} but none are installed in this environment.`
            : "No test runner detected in this repository.",
      };
    }
    return { runner: firstUsable, candidates, reason: `Selected "${firstUsable.id}" (${firstUsable.source}).` };
  }

  async execute(
    snapshot: RepositorySnapshot,
    discovery: TestDiscovery,
    config: NodeForgeConfig,
    policy: ExecutionPolicy,
    signal: AbortSignal,
    hooks: { onCommandExecuted: (command: string[], durationMs: number, exitCode: number | null) => void; onPolicyDenied: (reason: string) => void }
  ): Promise<TestSummary> {
    const root = snapshot.root;
    if (!root) {
      return emptySummary({
        status: "blocked",
        reason:
          "Remote pull-request snapshots have no working tree to execute; materialize a checkout or run against a local path.",
      });
    }

    if (!discovery.runner) {
      return emptySummary({ status: "not_executed", reason: discovery.reason });
    }

    const argv = discovery.runner.command;
    const check = checkCommandAllowed(argv, policy);
    if (!check.allowed) {
      hooks.onPolicyDenied(check.reason);
      return emptySummary({
        status: "blocked",
        runner: discovery.runner.id,
        command: argv,
        reason: `Policy denied execution: ${check.reason}`,
        networkPolicy: policy.networkDuringTests,
      });
    }

    if (signal.aborted) {
      return emptySummary({
        status: "blocked",
        runner: discovery.runner.id,
        command: argv,
        reason: "Cancelled before execution.",
      });
    }

    const env = buildChildEnv(policy);
    const result = await runProcess(
      {
        executable: argv[0]!,
        args: argv.slice(1),
        cwd: root,
        env,
        timeoutMs: config.tests.timeoutMs,
      },
      policy,
      signal
    );

    hooks.onCommandExecuted(argv, result.durationMs, result.exitCode);

    const stdoutExcerpt = truncate(redactString(result.stdout).text, EXCERPT_BYTES).text;
    const stderrExcerpt = truncate(redactString(result.stderr).text, EXCERPT_BYTES).text;
    const combined = `${result.stdout}\n${result.stderr}`;

    const networkFields = {
      networkPolicy: policy.networkDuringTests,
      networkEnforcement: (policy.networkDuringTests === "denied" ? "best_effort" : "not_enforced") as
        | "best_effort"
        | "not_enforced",
    };

    if (result.cancelled) {
      return emptySummary({
        status: "blocked",
        runner: discovery.runner.id,
        command: argv,
        durationMs: result.durationMs,
        stdoutExcerpt,
        stderrExcerpt,
        reason: "Cancelled by user request; child process terminated.",
        ...networkFields,
      });
    }

    if (result.spawnError) {
      const missingRuntime = /ENOENT|not found|not recognized/i.test(result.spawnError);
      throw new EngineError(
        ErrorCode.MissingRuntime,
        missingRuntime
          ? `Test runtime for "${discovery.runner.id}" is not installed in this environment (${result.spawnError.split("\n")[0]}). Tests were NOT executed.`
          : `Failed to launch test command: ${result.spawnError}`,
        { stage: "test_execution" }
      );
    }

    if (result.timedOut) {
      return emptySummary({
        status: "blocked",
        runner: discovery.runner.id,
        command: argv,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: true,
        stdoutExcerpt,
        stderrExcerpt,
        reason: `Timed out after ${config.tests.timeoutMs}ms and the process group was killed. Partial output cannot prove test results.`,
        ...networkFields,
      });
    }

    const parsed = parseRunnerOutput(discovery.runner.id, combined);

    if (result.exitCode !== 0) {
      return emptySummary({
        status: "failed",
        runner: discovery.runner.id,
        command: argv,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        signal: result.signal,
        stdoutExcerpt,
        stderrExcerpt,
        discovered: parsed.discovered,
        passed: parsed.passed,
        failed: Math.max(parsed.failed, 1),
        skipped: parsed.skipped,
        reason: countsAreCoherent(parsed)
          ? `${parsed.failed} test(s) failed (exit code ${result.exitCode}).`
          : `Runner exited with code ${result.exitCode}; no parseable summary was found.`,
        ...networkFields,
      });
    }

    if (!countsAreCoherent(parsed)) {
      return emptySummary({
        status: "not_executed",
        runner: discovery.runner.id,
        command: argv,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        stdoutExcerpt,
        stderrExcerpt,
        reason:
          "Runner exited 0 but no test results could be parsed from its output; refusing to claim a pass without evidence.",
        ...networkFields,
      });
    }

    return emptySummary({
      status: "passed",
      runner: discovery.runner.id,
      command: argv,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stdoutExcerpt,
      stderrExcerpt,
      discovered: parsed.discovered,
      passed: parsed.passed,
      failed: 0,
      skipped: parsed.skipped,
      reason: `${parsed.passed} passed, ${parsed.skipped} skipped of ${parsed.discovered} reported.`,
      ...networkFields,
    });
  }
}

export { EMPTY_COUNTS };
