/**
 * `nodeforge review <target>` — full verification workflow.
 */

import type { Logger } from "../utils/logger.js";
import { exitCodeForRun } from "../core/exit-codes.js";
import {
  buildEngine,
  buildPolicy,
  loadEffectiveConfig,
  renderRun,
  resolveFormat,
  type GlobalOptions,
} from "./common.js";

export type ReviewOptions = GlobalOptions;

export async function reviewAction(
  target: string,
  opts: ReviewOptions,
  log: Logger,
  version: string,
  signal: AbortSignal
): Promise<void> {
  const cwd = process.cwd();
  const { loaded, config, providerOverride } = await loadEffectiveConfig(opts, cwd);
  if (loaded.issues.length > 0) {
    for (const issue of loaded.issues) log.error(`config issue — ${issue.path}: ${issue.message}`);
    process.exitCode = 2;
    return;
  }

  const engine = buildEngine(config, cwd, version, providerOverride);
  const run = await engine.run({
    mode: "review",
    targetInput: target,
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
  process.exitCode = exitCodeForRun(run);
}
