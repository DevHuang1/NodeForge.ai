/**
 * Sandbox policy checks: command allow-listing and environment construction.
 *
 * The process runner NEVER uses a shell. As defense in depth we additionally
 * reject shell metacharacters inside argv so a misconfigured project cannot
 * smuggle shell syntax into what we treat as literal arguments.
 */

import type { ExecutionPolicy } from "../core/policy.js";

export interface CommandCheck {
  allowed: boolean;
  reason: string;
}

const SHELL_METACHARS = /[;&|`$()<>\n\\]/;

export function checkCommandAllowed(
  argv: readonly string[],
  policy: ExecutionPolicy
): CommandCheck {
  if (argv.length === 0) {
    return { allowed: false, reason: "Empty command." };
  }
  const head = argv[0]!;
  const base = head.includes("/") ? head.slice(head.lastIndexOf("/") + 1) : head;
  if (!policy.allowList.includes(base)) {
    return {
      allowed: false,
      reason: `Executable "${base}" is not on the allow-list (${policy.allowList.join(", ")}).`,
    };
  }
  for (const arg of argv) {
    if (SHELL_METACHARS.test(arg)) {
      return {
        allowed: false,
        reason: `Argument contains shell metacharacters and is rejected defensively: "${arg.slice(0, 60)}".`,
      };
    }
  }
  return { allowed: true, reason: "" };
}

/** Build a minimal child environment; secrets and proxies are NOT forwarded. */
export function buildChildEnv(policy: ExecutionPolicy, runId?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of policy.envAllowList) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Deterministic-ish defaults for reproducibility.
  env.NODE_ENV = env.NODE_ENV ?? "test";
  if (runId) env.NODEFORGE_RUN_ID = runId;
  if (policy.networkDuringTests === "denied") {
    // Best-effort network denial: remove proxy configuration so tools cannot
    // inherit a working egress path. See README limitations for the honest
    // statement about OS-level enforcement.
    delete env.HTTP_PROXY;
    delete env.HTTPS_PROXY;
    delete env.http_proxy;
    delete env.https_proxy;
    delete env.ALL_PROXY;
    delete env.all_proxy;
  }
  return env;
}
