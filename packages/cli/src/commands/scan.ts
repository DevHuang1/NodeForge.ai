/**
 * `nodeforge scan <path>` — deterministic security scan only.
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

export type ScanOptions = GlobalOptions;

export async function scanAction(
  targetPath: string,
  opts: ScanOptions,
  log: Logger,
  version: string,
  signal: AbortSignal
): Promise<void> {
  if (/^https?:\/\//i.test(targetPath)) {
    log.error("scan expects a local path; use `nodeforge review <pr-url>` for pull requests.");
    process.exitCode = 2;
    return;
  }
  const cwd = process.cwd();
  const { loaded, config } = await loadEffectiveConfig(opts, cwd);
  if (loaded.issues.length > 0) {
    for (const issue of loaded.issues) log.error(`config issue — ${issue.path}: ${issue.message}`);
    process.exitCode = 2;
    return;
  }

  const engine = buildEngine(config, cwd, version);
  const run = await engine.run({
    mode: "scan",
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
  process.exitCode = exitCodeForRun(run);
}
