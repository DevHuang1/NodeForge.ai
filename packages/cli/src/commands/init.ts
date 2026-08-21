/**
 * `nodeforge init` — scaffold .nodeforge/config.json + config.schema.json.
 */

import { promises as fs } from "fs";
import path from "path";
import type { Logger } from "../utils/logger.js";
import { EXIT_CODES } from "../core/exit-codes.js";
import { CONFIG_DIR, CONFIG_FILE, defaultConfig } from "../config/config.js";
import { atomicWriteFile } from "../utils/misc.js";

export interface InitOptions {
  force?: boolean;
}

const SCHEMA_SOURCE = new URL("../../config/config.schema.json", import.meta.url);

export async function initAction(opts: InitOptions, log: Logger): Promise<void> {
  const cwd = process.cwd();
  const configDir = path.join(cwd, CONFIG_DIR);
  const configPath = path.join(configDir, CONFIG_FILE);
  const schemaPath = path.join(configDir, "config.schema.json");

  let exists = false;
  try {
    await fs.access(configPath);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists && !opts.force) {
    log.error(`${CONFIG_DIR}/${CONFIG_FILE} already exists; use --force to overwrite.`);
    process.exitCode = EXIT_CODES.invalidInput;
    return;
  }

  await fs.mkdir(configDir, { recursive: true });

  // Copy the JSON schema next to the config so editors can validate it.
  try {
    const schemaText = await fs.readFile(SCHEMA_SOURCE, "utf8");
    await atomicWriteFile(schemaPath, schemaText);
  } catch (error) {
    log.warn(`could not copy config.schema.json: ${(error as Error).message}`);
  }

  const defaults = defaultConfig();
  const configDocument = {
    $schema: "./config.schema.json",
    ...defaults,
  };
  await atomicWriteFile(configPath, `${JSON.stringify(configDocument, null, 2)}\n`);

  log.success(`Created ${CONFIG_DIR}/${CONFIG_FILE} and ${CONFIG_DIR}/config.schema.json`);
  log.info("");
  log.info("Configuration reference (defaults shown; edit to taste):");
  const rows: Array<[string, string, string]> = [
    ["scan.excludeDirs", defaults.scan.excludeDirs.join(", "), "directory names skipped during scanning"],
    ["scan.maxFileBytes", String(defaults.scan.maxFileBytes), "files larger than this are not read"],
    ["tests.enabled", String(defaults.tests.enabled), "whether review runs execute the test suite"],
    ["tests.timeoutMs", String(defaults.tests.timeoutMs), "hard timeout for the whole test command"],
    ["tests.onBlocked", defaults.tests.onBlocked, "review status when tests cannot run: blocked | completed_with_findings"],
    ["analysis.enabled", String(defaults.analysis.enabled), "LLM analysis is opt-in"],
    ["analysis.model", defaults.analysis.model ?? "(provider default)", "model id for the OpenAI-compatible provider"],
    ["storage.backend", defaults.storage.backend, "filesystem | memory"],
    ["storage.dir", defaults.storage.dir, "where run artifacts are written"],
  ];
  for (const [key, value, description] of rows) {
    log.info(log.dim(`  ${key.padEnd(22)} ${value.padEnd(28)} ${description}`));
  }
  log.info("");
  log.info("Next steps:");
  log.info("  nodeforge doctor            verify your environment");
  log.info("  nodeforge scan ./src        deterministic security scan");
  log.info("  nodeforge test .            discover and run tests");
  log.info("  nodeforge review <pr-url>   full verification workflow");
  process.exitCode = EXIT_CODES.ok;
}
