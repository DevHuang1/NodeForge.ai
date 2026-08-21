/**
 * Shared command helpers: effective-config resolution, engine construction,
 * output-format selection, and rendering.
 */

import type { VerificationRun } from "../core/contracts.js";
import { VerificationEngine, type EngineDeps } from "../core/engine.js";
import { policyFromConfig } from "../core/policy.js";
import { LocalSourceProvider } from "../context/repository.js";
import { GitHubSourceProvider } from "../context/github.js";
import { GuardedTestExecutor } from "../executors/test-runner.js";
import { createAnalysisProvider } from "../analysis/provider.js";
import { createStorage } from "../storage/factory.js";
import { loadConfigFromDir, type LoadedConfig, type NodeForgeConfig } from "../config/config.js";
import { renderRunJson } from "../reporters/json.js";
import { renderRunMarkdown } from "../reporters/markdown.js";
import { renderRunSarif } from "../reporters/sarif.js";
import { renderRunTerminal } from "../reporters/terminal.js";
import type { Logger } from "../utils/logger.js";

export type OutputFormat = "terminal" | "json" | "markdown" | "sarif";

export interface GlobalOptions {
  verbose?: boolean;
  quiet?: boolean;
  color?: boolean;
  json?: boolean;
  markdown?: boolean;
  sarif?: boolean;
  timeout?: string;
  provider?: string;
  dryRun?: boolean;
}

export function resolveFormat(opts: GlobalOptions, explicitFormat?: string): OutputFormat {
  if (explicitFormat === "json" || explicitFormat === "markdown" || explicitFormat === "sarif" || explicitFormat === "terminal") {
    return explicitFormat;
  }
  if (opts.json) return "json";
  if (opts.sarif) return "sarif";
  if (opts.markdown) return "markdown";
  return "terminal";
}

/** Load .nodeforge/config.json (walking up from cwd) and apply flag overrides. */
export async function loadEffectiveConfig(
  opts: GlobalOptions,
  cwd: string
): Promise<{ loaded: LoadedConfig; config: NodeForgeConfig; providerOverride: string | null }> {
  const loaded = await loadConfigFromDir(cwd);
  const config = loaded.config;
  let providerOverride: string | null = null;
  if (opts.timeout !== undefined) {
    const ms = Number(opts.timeout);
    if (!Number.isInteger(ms) || ms <= 0) {
      throw new Error(`Invalid --timeout value "${opts.timeout}"; expected a positive integer of milliseconds.`);
    }
    config.tests.timeoutMs = ms;
  }
  if (opts.provider !== undefined) {
    const valid = ["openrouter", "openai", "featherless", "none"];
    if (!valid.includes(opts.provider)) {
      throw new Error(`Invalid --provider "${opts.provider}"; expected one of ${valid.join(", ")}.`);
    }
    if (opts.provider === "none") {
      config.analysis.enabled = false;
    } else {
      config.analysis.enabled = true;
      config.analysis.provider = "openai-compatible";
      providerOverride = opts.provider;
    }
  }
  return { loaded, config, providerOverride };
}

export function buildEngine(
  config: NodeForgeConfig,
  cwd: string,
  version: string,
  providerOverride: string | null = null
): VerificationEngine {
  const deps: EngineDeps = {
    version,
    localSource: new LocalSourceProvider(),
    githubSource: new GitHubSourceProvider(),
    executor: new GuardedTestExecutor(),
    analysis: createAnalysisProvider(config, providerOverride),
    repository: createStorage(config, cwd),
  };
  return new VerificationEngine(deps);
}

export function buildPolicy(config: NodeForgeConfig, opts: GlobalOptions) {
  return policyFromConfig(config, {
    timeoutMs: opts.timeout !== undefined ? Number(opts.timeout) : undefined,
  });
}

export function renderRun(run: VerificationRun, format: OutputFormat, log: Logger): void {
  switch (format) {
    case "json":
      log.raw(renderRunJson(run));
      break;
    case "markdown":
      log.raw(renderRunMarkdown(run));
      break;
    case "sarif":
      log.raw(renderRunSarif(run));
      break;
    case "terminal":
    default:
      log.raw(renderRunTerminal(run, log.colorEnabled));
      break;
  }
}
