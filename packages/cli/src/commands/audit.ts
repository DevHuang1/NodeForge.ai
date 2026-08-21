/**
 * `nodeforge audit <run-id>` — timestamped audit trail for a run.
 */

import type { AuditEvent, RunRepository } from "../core/contracts.js";
import type { Logger } from "../utils/logger.js";
import { EXIT_CODES } from "../core/exit-codes.js";
import { createStorage } from "../storage/factory.js";
import { loadConfigFromDir } from "../config/config.js";
import { resolveRunId } from "./report.js";
import type { GlobalOptions } from "./common.js";

export interface AuditOptions extends GlobalOptions {
  limit?: string;
}

export async function auditAction(
  runIdArg: string,
  opts: AuditOptions,
  log: Logger
): Promise<void> {
  const cwd = process.cwd();
  const { config, issues } = await loadConfigFromDir(cwd);
  if (issues.length > 0) {
    for (const issue of issues) log.error(`config issue — ${issue.path}: ${issue.message}`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  const storage = createStorage(config, cwd);
  const resolvedId = await resolveRunId(storage, runIdArg);
  if (resolvedId === null || !(await runExists(storage, resolvedId))) {
    log.error(`No stored run matches "${runIdArg}".`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  const limit = opts.limit !== undefined ? Number(opts.limit) : 200;
  if (!Number.isInteger(limit) || limit <= 0) {
    log.error(`Invalid --limit "${opts.limit}"; expected a positive integer.`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  const events = await storage.listAudit(resolvedId, limit);
  if (opts.json) {
    log.raw(JSON.stringify(events, null, 2));
  } else {
    renderAuditTable(events, log);
  }
  process.exitCode = EXIT_CODES.ok;
}

async function runExists(storage: RunRepository, runId: string): Promise<boolean> {
  return (await storage.getRun(runId)) !== null;
}

function renderAuditTable(events: readonly AuditEvent[], log: Logger): void {
  if (events.length === 0) {
    log.info("No audit events recorded for this run.");
    return;
  }
  for (const event of events) {
    const stage = event.stage ? ` [${event.stage}]` : "";
    log.info(`${event.at} ${event.actor} ${event.action}${stage} ${event.outcome}`);
    const entries = Object.entries(event.metadata);
    if (entries.length > 0) {
      const compact = entries
        .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : String(v)}`)
        .join(" ");
      log.info(log.dim(`    ${compact}`));
    }
  }
}
