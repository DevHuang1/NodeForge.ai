/**
 * Configuration loading, validation, and defaults for `.nodeforge/config.json`.
 *
 * Validation is intentionally dependency-free structural checking (same spirit
 * as the platform's lib/validation.ts) so the published CLI has no runtime
 * validator requirement. A JSON Schema is shipped alongside for editor support.
 */

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";

export const CONFIG_DIR = ".nodeforge";
export const CONFIG_FILE = "config.json";
export const CONFIG_SCHEMA_FILE = "config.schema.json";

export interface ScanConfig {
  maxFiles: number;
  maxFileBytes: number;
  excludeDirs: string[];
}

export type NetworkPolicy = "denied" | "allowed";

export interface TestsConfig {
  enabled: boolean;
  timeoutMs: number;
  network: NetworkPolicy;
  /** Force a specific runner id (e.g. "pytest", "vitest"). */
  runnerOverride: string | null;
  /** Explicit argv override; must still pass the command allow-list. */
  commandOverride: string[] | null;
  /**
   * How `review` treats blocked test execution:
   * "blocked" marks the whole run blocked (exit 3);
   * "ignore" completes the run with an honest note.
   */
  onBlocked: "blocked" | "ignore";
}

export interface AnalysisConfig {
  enabled: boolean;
  provider: "openai-compatible";
  model: string | null;
  baseUrl: string | null;
  maxFindings: number;
}

export interface StorageConfig {
  backend: "fs" | "memory";
  dir: string;
}

export interface ReportConfig {
  artifacts: boolean;
}

export interface NodeForgeConfig {
  schemaVersion: 1;
  scan: ScanConfig;
  tests: TestsConfig;
  analysis: AnalysisConfig;
  storage: StorageConfig;
  report: ReportConfig;
}

export interface ConfigIssue {
  path: string;
  message: string;
}

export function defaultConfig(): NodeForgeConfig {
  return {
    schemaVersion: 1,
    scan: {
      maxFiles: 2000,
      maxFileBytes: 512 * 1024,
      excludeDirs: [
        "node_modules",
        ".git",
        ".next",
        "dist",
        "build",
        "vendor",
        "venv",
        ".venv",
        "__pycache__",
        "coverage",
        ".data",
        ".nodeforge",
      ],
    },
    tests: {
      enabled: true,
      timeoutMs: 30_000,
      network: "denied",
      runnerOverride: null,
      commandOverride: null,
      onBlocked: "blocked",
    },
    analysis: {
      enabled: false,
      provider: "openai-compatible",
      model: null,
      baseUrl: null,
      maxFindings: 10,
    },
    storage: {
      backend: "fs",
      dir: ".nodeforge/runs",
    },
    report: {
      artifacts: true,
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asStringOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === "string") return v;
  return undefined;
}

function asPositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  return null;
}

function asStringArray(v: unknown): string[] | null {
  if (Array.isArray(v) && v.every((i) => typeof i === "string")) return v as string[];
  return null;
}

/**
 * Validate an untrusted value against the config shape, merging onto defaults.
 * Unknown fields are ignored; wrong-typed fields produce issues.
 */
export function validateConfig(raw: unknown): {
  config: NodeForgeConfig;
  issues: ConfigIssue[];
} {
  const config = defaultConfig();
  const issues: ConfigIssue[] = [];
  if (raw === undefined || raw === null) return { config, issues };
  if (!isObject(raw)) {
    issues.push({ path: "$", message: "Configuration must be a JSON object." });
    return { config, issues };
  }

  const schemaVersion = raw["schemaVersion"] ?? raw["version"];
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    issues.push({
      path: "schemaVersion",
      message: `Unsupported schema version ${String(schemaVersion)}; expected 1.`,
    });
  }

  if (raw["scan"] !== undefined) {
    if (!isObject(raw["scan"])) {
      issues.push({ path: "scan", message: "Must be an object." });
    } else {
      const s = raw["scan"];
      const maxFiles = asPositiveInt(s["maxFiles"]);
      if (s["maxFiles"] !== undefined && maxFiles === null) {
        issues.push({ path: "scan.maxFiles", message: "Must be a positive integer." });
      } else if (maxFiles !== null) {
        config.scan.maxFiles = maxFiles;
      }
      const maxFileBytes = asPositiveInt(s["maxFileBytes"]);
      if (s["maxFileBytes"] !== undefined && maxFileBytes === null) {
        issues.push({ path: "scan.maxFileBytes", message: "Must be a positive integer." });
      } else if (maxFileBytes !== null) {
        config.scan.maxFileBytes = maxFileBytes;
      }
      const excludeDirs = asStringArray(s["excludeDirs"]);
      if (s["excludeDirs"] !== undefined && excludeDirs === null) {
        issues.push({ path: "scan.excludeDirs", message: "Must be an array of strings." });
      } else if (excludeDirs !== null) {
        config.scan.excludeDirs = excludeDirs;
      }
    }
  }

  if (raw["tests"] !== undefined) {
    if (!isObject(raw["tests"])) {
      issues.push({ path: "tests", message: "Must be an object." });
    } else {
      const t = raw["tests"];
      const enabled = asBoolean(t["enabled"]);
      if (t["enabled"] !== undefined && enabled === null) {
        issues.push({ path: "tests.enabled", message: "Must be a boolean." });
      } else if (enabled !== null) {
        config.tests.enabled = enabled;
      }
      const timeoutMs = asPositiveInt(t["timeoutMs"]);
      if (t["timeoutMs"] !== undefined && timeoutMs === null) {
        issues.push({ path: "tests.timeoutMs", message: "Must be a positive integer (milliseconds)." });
      } else if (timeoutMs !== null) {
        config.tests.timeoutMs = timeoutMs;
      }
      if (t["network"] !== undefined) {
        if (t["network"] === "denied" || t["network"] === "allowed") {
          config.tests.network = t["network"];
        } else {
          issues.push({ path: "tests.network", message: 'Must be "denied" or "allowed".' });
        }
      }
      const runnerOverride = asStringOrNull(t["runnerOverride"]);
      if (t["runnerOverride"] !== undefined && runnerOverride === undefined) {
        issues.push({ path: "tests.runnerOverride", message: "Must be a string or null." });
      } else if (runnerOverride !== undefined) {
        config.tests.runnerOverride = runnerOverride;
      }
      if (t["commandOverride"] !== undefined) {
        if (t["commandOverride"] === null) {
          config.tests.commandOverride = null;
        } else {
          const cmd = asStringArray(t["commandOverride"]);
          if (cmd === null || cmd.length === 0) {
            issues.push({
              path: "tests.commandOverride",
              message: "Must be a non-empty array of strings (argv) or null.",
            });
          } else {
            config.tests.commandOverride = cmd;
          }
        }
      }
      if (t["onBlocked"] !== undefined) {
        if (t["onBlocked"] === "blocked" || t["onBlocked"] === "ignore") {
          config.tests.onBlocked = t["onBlocked"];
        } else {
          issues.push({ path: "tests.onBlocked", message: 'Must be "blocked" or "ignore".' });
        }
      }
    }
  }

  if (raw["analysis"] !== undefined) {
    if (!isObject(raw["analysis"])) {
      issues.push({ path: "analysis", message: "Must be an object." });
    } else {
      const a = raw["analysis"];
      const enabled = asBoolean(a["enabled"]);
      if (a["enabled"] !== undefined && enabled === null) {
        issues.push({ path: "analysis.enabled", message: "Must be a boolean." });
      } else if (enabled !== null) {
        config.analysis.enabled = enabled;
      }
      if (a["provider"] !== undefined && a["provider"] !== "openai-compatible") {
        issues.push({ path: "analysis.provider", message: 'Only "openai-compatible" is supported.' });
      }
      const model = asStringOrNull(a["model"]);
      if (a["model"] !== undefined && model === undefined) {
        issues.push({ path: "analysis.model", message: "Must be a string or null." });
      } else if (model !== undefined) {
        config.analysis.model = model;
      }
      const baseUrl = asStringOrNull(a["baseUrl"]);
      if (a["baseUrl"] !== undefined && baseUrl === undefined) {
        issues.push({ path: "analysis.baseUrl", message: "Must be a string or null." });
      } else if (baseUrl !== undefined) {
        if (baseUrl !== null && !/^https?:\/\//.test(baseUrl)) {
          issues.push({ path: "analysis.baseUrl", message: "Must be an http(s) URL or null." });
        } else {
          config.analysis.baseUrl = baseUrl;
        }
      }
      const maxFindings = asPositiveInt(a["maxFindings"]);
      if (a["maxFindings"] !== undefined && maxFindings === null) {
        issues.push({ path: "analysis.maxFindings", message: "Must be a positive integer." });
      } else if (maxFindings !== null) {
        config.analysis.maxFindings = maxFindings;
      }
    }
  }

  if (raw["storage"] !== undefined) {
    if (!isObject(raw["storage"])) {
      issues.push({ path: "storage", message: "Must be an object." });
    } else {
      const st = raw["storage"];
      if (st["backend"] !== undefined) {
        if (st["backend"] === "fs" || st["backend"] === "memory") {
          config.storage.backend = st["backend"];
        } else {
          issues.push({ path: "storage.backend", message: 'Must be "fs" or "memory".' });
        }
      }
      const dir = asString(st["dir"]);
      if (st["dir"] !== undefined && dir === null) {
        issues.push({ path: "storage.dir", message: "Must be a string." });
      } else if (dir !== null) {
        if (path.isAbsolute(dir)) {
          issues.push({ path: "storage.dir", message: "Must be a relative path." });
        } else {
          config.storage.dir = dir;
        }
      }
    }
  }

  if (raw["report"] !== undefined) {
    if (!isObject(raw["report"])) {
      issues.push({ path: "report", message: "Must be an object." });
    } else {
      const r = raw["report"];
      const artifacts = asBoolean(r["artifacts"]);
      if (r["artifacts"] !== undefined && artifacts === null) {
        issues.push({ path: "report.artifacts", message: "Must be a boolean." });
      } else if (artifacts !== null) {
        config.report.artifacts = artifacts;
      }
    }
  }

  return { config, issues };
}

export interface LoadedConfig {
  config: NodeForgeConfig;
  /** Directory whose `.nodeforge/config.json` provided settings, if any. */
  sourceDir: string | null;
  issues: ConfigIssue[];
}

/** Find the nearest `.nodeforge/config.json` at or above `startDir`. */
export async function findConfigDir(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, CONFIG_DIR, CONFIG_FILE);
    try {
      await fs.access(candidate);
      return current;
    } catch {
      // keep walking
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function loadConfigFromDir(dir: string): Promise<LoadedConfig> {
  const found = await findConfigDir(dir);
  if (!found) return { config: defaultConfig(), sourceDir: null, issues: [] };
  const file = path.join(found, CONFIG_DIR, CONFIG_FILE);
  let raw: unknown;
  try {
    const text = await fs.readFile(file, "utf8");
    raw = JSON.parse(text);
  } catch (error) {
    return {
      config: defaultConfig(),
      sourceDir: found,
      issues: [
        {
          path: file,
          message: `Could not parse configuration: ${(error as Error).message}`,
        },
      ],
    };
  }
  const { config, issues } = validateConfig(raw);
  return { config, sourceDir: found, issues };
}

/** Stable fingerprint of the effective configuration for run records. */
export function fingerprintConfig(config: NodeForgeConfig): string {
  const canonical = JSON.stringify(config, Object.keys(flatten(config as unknown as object)).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function flatten(obj: object): Record<string, unknown> {
  // JSON.stringify with a replacer array needs a flat key list; configs are
  // plain nested objects, so collect every key path once.
  const keys: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (isObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        keys.push(k);
        walk(v);
      }
    }
  };
  walk(obj);
  return Object.fromEntries(keys.map((k) => [k, true]));
}
