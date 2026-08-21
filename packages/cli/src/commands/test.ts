/**
 * `nodeforge test <path>` — discover and execute the project test suite.
 */

import type { Logger } from "../utils/logger.js";
import { EXIT_CODES, exitCodeForTestSummary } from "../core/exit-codes.js";
import {
  buildEngine,
  buildPolicy,
  loadEffectiveConfig,
  renderRun,
  resolveFormat,
  type GlobalOptions,
} from "./common.js";

export type TestOptions = GlobalOptions;

export async function testAction(
  targetPath: string,
  opts: TestOptions,
  log: Logger,
  version: string,
  signal: AbortSignal
): Promise<void> {
  const cwd = process.cwd();
  const { loaded, config } = await loadEffectiveConfig(opts, cwd);
  if (loaded.issues.length > 0) {
    for (const issue of loaded.issues) log.error(`config issue — ${issue.path}: ${issue.message}`);
    process.exitCode = 2;
    return;
  }

  const engine = buildEngine(config, cwd, version);
  const run = await engine.run({
    mode: "test",
    targetInput: targetPath,
    cwd,
    config,
    policy: buildPolicy(config, opts),
    dryRun: Boolean(opts.dryRun),
    signal,
    onStage: (stage, status, detail) => {
      if (opts.verbose && !opts.quiet && resolveFormat(opts) === "terminal") {
        log.info(log.dim(`[${stage}] ${status}${detail ? ` — ${detail}` : ""}`));
      }
    },
  });

  renderRun(run, resolveFormat(opts), log);

  // Exit codes follow the dedicated test semantics; cancellation and internal
  // failure still dominate.
  if (run.status === "cancelled") {
    process.exitCode = EXIT_CODES.cancelled;
  } else if (run.status === "failed") {
    process.exitCode = EXIT_CODES.internal;
  } else {
    process.exitCode = exitCodeForTestSummary(run.testSummary);
  }
}
