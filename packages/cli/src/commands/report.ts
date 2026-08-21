/**
 * `nodeforge report <run-id>` — render a stored verification run.
 */

import type { Logger } from "../utils/logger.js";
import { EXIT_CODES } from "../core/exit-codes.js";
import { createStorage } from "../storage/factory.js";
import { loadConfigFromDir } from "../config/config.js";
import {
  resolveFormat,
  renderRun,
  type GlobalOptions,
  type OutputFormat,
} from "./common.js";

export interface ReportOptions extends GlobalOptions {
  format?: string;
}

const VALID_FORMATS = ["terminal", "json", "markdown", "sarif"];

export async function reportAction(
  runIdArg: string,
  opts: ReportOptions,
  log: Logger
): Promise<void> {
  if (opts.format !== undefined && !VALID_FORMATS.includes(opts.format)) {
    log.error(`Invalid --format "${opts.format}"; expected one of ${VALID_FORMATS.join(", ")}.`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }
  const cwd = process.cwd();
  const { config, issues } = await loadConfigFromDir(cwd);
  if (issues.length > 0) {
    for (const issue of issues) log.error(`config issue — ${issue.path}: ${issue.message}`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  const storage = createStorage(config, cwd);
  const resolvedId = await resolveRunId(storage, runIdArg);
  const run = resolvedId ? await storage.getRun(resolvedId) : null;
  if (!run) {
    log.error(`No stored run matches "${runIdArg}". Try \`nodeforge report latest\` or check .nodeforge/runs/.`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  renderRun(run, resolveFormat(opts, opts.format), log);
  process.exitCode = EXIT_CODES.ok;
}

/** Resolve "latest" (or a prefix match) to a concrete run id. */
export async function resolveRunId(
  storage: { listRuns(limit: number): Promise<Array<{ id: string }>> },
  runIdArg: string
): Promise<string | null> {
  if (runIdArg !== "latest") return runIdArg;
  const runs = await storage.listRuns(1);
  return runs[0]?.id ?? null;
}

export type { OutputFormat };
