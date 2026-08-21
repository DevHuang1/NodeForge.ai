/**
 * `nodeforge doctor` — environment and configuration health check.
 * Never prints secret values; presence only.
 */

import { promises as fs } from "fs";
import path from "path";
import type { Logger } from "../utils/logger.js";
import { EXIT_CODES } from "../core/exit-codes.js";
import { execGit, findExecutable } from "../context/repository.js";
import { hasGitHubCredentials } from "../context/github.js";
import { resolveAnalysisKey } from "../analysis/provider.js";
import { loadConfigFromDir } from "../config/config.js";
import type { GlobalOptions } from "./common.js";

export interface DoctorOptions extends GlobalOptions {
  connectivity?: boolean;
}

type CheckStatus = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

const MIN_NODE_MAJOR = 18;

export async function doctorAction(opts: DoctorOptions, log: Logger, version: string): Promise<void> {
  const checks: Check[] = [];
  const add = (name: string, status: CheckStatus, detail: string): void => {
    checks.push({ name, status, detail });
  };

  // CLI + Node versions
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add("nodeforge", "ok", `v${version}`);
  add(
    "node",
    nodeMajor >= MIN_NODE_MAJOR ? "ok" : "fail",
    `${process.versions.node} (requires >=${MIN_NODE_MAJOR})`
  );

  // Git
  try {
    const version = await execGit(process.cwd(), ["--version"]);
    add("git", "ok", version.stdout.trim().replace("git version ", "git "));
  } catch {
    add("git", "fail", "git is not available on PATH; refs and worktrees are unavailable.");
  }

  // Toolchains / runners
  const runners = ["node", "npm", "npx", "pnpm", "yarn", "python3", "pytest", "go"];
  for (const runner of runners) {
    const found = await findExecutable(runner);
    add(`runner:${runner}`, found ? "ok" : "warn", found ? found : "not found on PATH");
  }

  // Sandbox capability honesty
  const docker = await findExecutable("docker");
  add(
    "sandbox",
    docker ? "ok" : "warn",
    docker
      ? "container runtime detected; containerized execution possible in future backends"
      : "no container runtime; network denial during tests is best-effort (env sanitization only)"
  );

  // Configuration
  const cwd = process.cwd();
  const { config, issues, sourceDir } = await loadConfigFromDir(cwd);
  for (const issue of issues) {
    add("config", "fail", `${issue.path}: ${issue.message}`);
  }
  if (issues.length === 0) {
    add(
      "config",
      "ok",
      sourceDir ? path.join(path.relative(cwd, sourceDir), ".nodeforge", "config.json") : "defaults (no config file found)"
    );
  }

  // Storage writability
  try {
    const probeDir = path.join(cwd, config.storage.dir);
    await fs.mkdir(probeDir, { recursive: true });
    await fs.access(probeDir);
    await fs.writeFile(path.join(probeDir, ".doctor-probe"), "probe", "utf8");
    await fs.rm(path.join(probeDir, ".doctor-probe"), { force: true });
    add("storage", "ok", `${config.storage.backend} backend at ${config.storage.dir}`);
  } catch (error) {
    add("storage", "fail", `not writable: ${(error as Error).message}`);
  }

  // Credentials (presence only — never values)
  add("github-token", hasGitHubCredentials() ? "ok" : "warn", hasGitHubCredentials() ? "configured via environment" : "not set; PR review will be blocked");
  const analysisKey = resolveAnalysisKey(opts.provider === "none" ? null : opts.provider ?? null);
  add(
    "llm-key",
    analysisKey ? "ok" : "warn",
    analysisKey ? `configured (${analysisKey.providerLabel})` : "not set; analysis stage will report blocked"
  );

  // Optional connectivity probe
  if (opts.connectivity && analysisKey) {
    const base =
      config.analysis.baseUrl ??
      process.env.OPENROUTER_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      "https://openrouter.ai/api/v1";
    try {
      const response = await fetch(`${base.replace(/\/+$/, "")}/models`, {
        method: "GET",
        headers: { Authorization: "Bearer probe" },
        signal: AbortSignal.timeout(5000),
      });
      add(
        "provider-connectivity",
        response.status < 500 ? "ok" : "warn",
        `${base} responded HTTP ${response.status}`
      );
    } catch (error) {
      add("provider-connectivity", "warn", `${base} unreachable: ${(error as Error).message}`);
    }
  }

  // Render
  const useColor = log.colorEnabled;
  const colorFor = (status: CheckStatus): string => {
    if (!useColor) return status.toUpperCase().padEnd(4);
    const code = status === "ok" ? "32" : status === "warn" ? "33" : "31";
    return `\u001B[${code}m${status.toUpperCase().padEnd(4)}\u001B[0m`;
  };
  for (const check of checks) {
    log.info(`${colorFor(check.status)} ${check.name.padEnd(22)} ${check.detail}`);
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  log.info("");
  log.info(`${checks.length} checks: ${failed} failed, ${warned} warnings`);
  process.exitCode = failed > 0 ? EXIT_CODES.invalidInput : EXIT_CODES.ok;
}
