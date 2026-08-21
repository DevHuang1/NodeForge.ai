/**
 * Shared integration-test helpers: disposable git fixtures, command shims,
 * and engine construction mirroring the CLI wiring.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { VerificationEngine, type EngineDeps } from "../../src/core/engine.js";
import {
  defaultConfig,
  type NodeForgeConfig,
} from "../../src/config/config.js";
import { DEFAULT_POLICY } from "../../src/core/policy.js";
import { LocalSourceProvider } from "../../src/context/repository.js";
import { GitHubSourceProvider } from "../../src/context/github.js";
import { GuardedTestExecutor } from "../../src/executors/test-runner.js";
import { DisabledAnalysisProvider } from "../../src/analysis/provider.js";
import { FilesystemRunRepository } from "../../src/storage/filesystem.js";

export const execFileP = promisify(execFile);

export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `nodeforge-it-${prefix}-`));
}

export async function initGitRepo(dir: string): Promise<void> {
  await execFileP("git", ["init", "-q"], { cwd: dir });
  await execFileP("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  await execFileP("git", ["config", "user.name", "Test User"], { cwd: dir });
  await execFileP("git", ["add", "."], { cwd: dir });
  await execFileP("git", ["commit", "-qm", "initial"], { cwd: dir });
}

/** Project that trips all six deterministic rule categories. */
export async function writeVulnerableProject(dir: string): Promise<void> {
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "vuln",
      version: "1.0.0",
      scripts: { test: "echo no tests" },
    }),
    "utf8",
  );
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "app.py"),
    [
      "import os",
      "import pickle",
      "import subprocess",
      "",
      'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"',
      'os.system("rm -rf " + user_input)',
      "subprocess.run(cmd, shell=True)",
      "data = pickle.loads(blob)",
      "requests.get(dynamic_url)",
      'subprocess.call("chmod 777 /srv", shell=True)',
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function writeCleanProject(dir: string): Promise<void> {
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "clean", version: "1.0.0" }),
    "utf8",
  );
  await fs.writeFile(
    path.join(dir, "index.js"),
    "console.log('hello');\n",
    "utf8",
  );
}

/** Write an executable shell-script shim (e.g. a fake `npm`). */
export async function writeShim(
  dir: string,
  name: string,
  body: string,
): Promise<string> {
  const shimPath = path.join(dir, name);
  await fs.writeFile(shimPath, `#!/bin/bash\n${body}\n`, "utf8");
  await fs.chmod(shimPath, 0o755);
  return shimPath;
}

/** Prepend shimDir to PATH; returns a restore function. */
export function prependPath(shimDir: string): () => void {
  const previous = process.env.PATH ?? "";
  process.env.PATH = `${shimDir}${path.delimiter}${previous}`;
  return () => {
    process.env.PATH = previous;
  };
}

export interface EngineHarness {
  engine: VerificationEngine;
  config: NodeForgeConfig;
  repository: FilesystemRunRepository;
  restorePath?: () => void;
}

export interface HarnessOptions {
  repoDir: string;
  storageDir?: string;
  mutateConfig?: (config: NodeForgeConfig) => void;
  shimDir?: string;
}

/** Build an engine wired exactly like the CLI but with test-friendly knobs. */
export function makeEngine(options: HarnessOptions): EngineHarness {
  const config = defaultConfig();
  config.storage.dir =
    options.storageDir ?? path.join(options.repoDir, ".nodeforge", "runs");
  options.mutateConfig?.(config);

  let restorePath: (() => void) | undefined;
  if (options.shimDir) restorePath = prependPath(options.shimDir);

  const deps: EngineDeps = {
    version: "test",
    localSource: new LocalSourceProvider(),
    githubSource: new GitHubSourceProvider(),
    executor: new GuardedTestExecutor(),
    analysis: new DisabledAnalysisProvider(),
    repository: new FilesystemRunRepository(config.storage.dir),
  };
  return {
    engine: new VerificationEngine(deps),
    config,
    repository: deps.repository as FilesystemRunRepository,
    restorePath,
  };
}

export function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

export { DEFAULT_POLICY };
