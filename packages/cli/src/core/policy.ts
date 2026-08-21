/**
 * Execution policy: the security boundary every adapter must respect.
 *
 * Defaults are conservative: allow-listed commands only, no shell, bounded
 * output, hard timeouts, and network denied during test execution unless
 * explicitly enabled in configuration.
 */

import type { NodeForgeConfig } from "../config/config.js";

export interface ExecutionPolicy {
  /** Hard timeout for a single external command. */
  commandTimeoutMs: number;
  /** Wall-clock budget for an entire verification run. */
  runTimeoutMs: number;
  /** Captured stdout/stderr is truncated at this size per stream. */
  maxOutputBytes: number;
  /** Files larger than this are hashed but not content-scanned. */
  maxFileBytes: number;
  /** Maximum number of files collected into a snapshot. */
  maxFiles: number;
  networkDuringTests: "denied" | "allowed";
  /** Basenames of executables that may ever be spawned. */
  allowList: readonly string[];
  /** Only these environment variables are forwarded to child processes. */
  envAllowList: readonly string[];
}

export const DEFAULT_POLICY: ExecutionPolicy = {
  commandTimeoutMs: 30_000,
  runTimeoutMs: 600_000,
  maxOutputBytes: 200_000,
  maxFileBytes: 512 * 1024,
  maxFiles: 2000,
  networkDuringTests: "denied",
  allowList: [
    "node",
    "npx",
    "npm",
    "pnpm",
    "yarn",
    "vitest",
    "jest",
    "pytest",
    "python3",
    "python",
    "go",
  ],
  envAllowList: [
    "PATH",
    "LANG",
    "LC_ALL",
    "TZ",
    "TMPDIR",
    "HOME",
    "CI",
    "NODEFORGE_RUN_ID",
    "PYTHONHASHSEED",
    "SOURCE_DATE_EPOCH",
    "NO_COLOR",
  ],
};

export function policyFromConfig(
  config: NodeForgeConfig,
  overrides: { timeoutMs?: number; runTimeoutMs?: number } = {}
): ExecutionPolicy {
  return {
    ...DEFAULT_POLICY,
    commandTimeoutMs: overrides.timeoutMs ?? config.tests.timeoutMs,
    runTimeoutMs: overrides.runTimeoutMs ?? DEFAULT_POLICY.runTimeoutMs,
    maxFileBytes: config.scan.maxFileBytes,
    maxFiles: config.scan.maxFiles,
    networkDuringTests: config.tests.network,
  };
}
