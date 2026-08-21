/**
 * Capability map: languages, package managers, frameworks, and candidate test
 * runners detected from the repository snapshot. Detection is read-only and
 * never executes project code.
 */

import { promises as fs } from "fs";
import path from "path";
import type { CapabilityMap, DetectedRunner, FileSnapshot, RepositorySnapshot } from "../core/contracts.js";
import { findExecutable } from "../utils/misc.js";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rb": "ruby",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".php": "php",
};

const MANAGER_BY_FILE: Record<string, string> = {
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "requirements.txt": "pip",
  "pyproject.toml": "pip",
  "Pipfile": "pipenv",
  "poetry.lock": "poetry",
  "go.mod": "go-modules",
  "Cargo.toml": "cargo",
  "Gemfile": "bundler",
  "composer.json": "composer",
};

interface PackageJsonLite {
  scripts?: Record<string, unknown>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

async function readPackageJson(files: FileSnapshot[], root: string | null): Promise<PackageJsonLite | null> {
  const manifest = files.find((f) => f.path === "package.json" && f.content);
  if (manifest?.content) {
    try {
      return JSON.parse(manifest.content) as PackageJsonLite;
    } catch {
      return null;
    }
  }
  if (root) {
    try {
      const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
      return JSON.parse(raw) as PackageJsonLite;
    } catch {
      return null;
    }
  }
  return null;
}

function hasFile(files: FileSnapshot[], name: string): boolean {
  return files.some((f) => f.path === name || f.path.endsWith(`/${name}`));
}

async function existsInRepo(root: string | null, rel: string): Promise<boolean> {
  if (!root) return false;
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

export async function detectCapabilities(
  snapshot: RepositorySnapshot
): Promise<CapabilityMap> {
  const files = snapshot.changedFiles;
  const notes: string[] = [];

  const languages = new Set<string>();
  for (const file of files) {
    const lang = LANGUAGE_BY_EXT[file.path.slice(file.path.lastIndexOf("."))];
    if (lang) languages.add(lang);
  }

  const packageManagers = new Set<string>();
  for (const file of files) {
    const base = file.path.slice(file.path.lastIndexOf("/") + 1);
    const manager = MANAGER_BY_FILE[base];
    if (manager) packageManagers.add(manager);
  }

  const frameworks = new Set<string>();
  const pkg = await readPackageJson(files, snapshot.root);
  const allDeps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };
  const frameworkByDep: Record<string, string> = {
    next: "next",
    react: "react",
    vue: "vue",
    svelte: "svelte",
    jest: "jest",
    vitest: "vitest",
    mocha: "mocha",
    django: "django",
    flask: "flask",
  };
  for (const dep of Object.keys(allDeps)) {
    const fw = frameworkByDep[dep];
    if (fw) frameworks.add(fw);
  }
  if (hasFile(files, "pytest.ini") || hasFile(files, "conftest.py")) frameworks.add("pytest");
  if (hasFile(files, "vitest.config.ts") || hasFile(files, "vitest.config.js")) frameworks.add("vitest");
  if (hasFile(files, "jest.config.js") || hasFile(files, "jest.config.ts")) frameworks.add("jest");

  // ── Test runner candidates, most specific first ──────────────────────────
  const candidates: DetectedRunner[] = [];
  const push = (
    id: string,
    command: string[],
    source: string,
    confidence: DetectedRunner["confidence"]
  ): void => {
    candidates.push({ id, command, source, confidence, available: null });
  };

  const hasVitest =
    "vitest" in allDeps ||
    hasFile(files, "vitest.config.ts") ||
    hasFile(files, "vitest.config.js") ||
    hasFile(files, "vitest.config.mts");
  if (hasVitest) push("vitest", ["npx", "vitest", "run"], "vitest dependency/config", "high");

  const hasJest =
    "jest" in allDeps ||
    hasFile(files, "jest.config.js") ||
    hasFile(files, "jest.config.ts") ||
    hasFile(files, "jest.config.mjs");
  if (hasJest) push("jest", ["npx", "jest"], "jest dependency/config", "high");

  const pythonFiles = files.some((f) => f.path.endsWith(".py"));
  const pytestConfigured =
    hasFile(files, "pytest.ini") ||
    hasFile(files, "conftest.py") ||
    /pytest/.test(Object.keys(allDeps).join(" "));
  const pyprojectHasPytest = files.some(
    (f) => f.path === "pyproject.toml" && f.content?.includes("pytest")
  );
  if ((pythonFiles && pytestConfigured) || pyprojectHasPytest || hasFile(files, "requirements.txt")) {
    if (pythonFiles || pyprojectHasPytest) {
      push("pytest", ["python3", "-m", "pytest"], "python test layout", "high");
    }
  }

  if (hasFile(files, "go.mod")) push("go-test", ["go", "test", "./..."], "go.mod present", "high");

  const testScript = typeof pkg?.scripts?.test === "string" ? (pkg.scripts.test as string) : null;
  if (testScript) {
    if (packageManagers.has("pnpm")) push("pnpm-test", ["pnpm", "test"], "package.json scripts.test + pnpm lockfile", "medium");
    if (packageManagers.has("yarn")) push("yarn-test", ["yarn", "test"], "package.json scripts.test + yarn lockfile", "medium");
    push("npm-test", ["npm", "test"], "package.json scripts.test", "medium");
  } else if (pkg !== null) {
    notes.push("package.json has no test script.");
  }

  // Availability probing without spawning processes.
  for (const candidate of candidates) {
    const head = candidate.command[0]!;
    if (head === "npx" || head === "npm" || head === "pnpm" || head === "yarn") {
      const toolOnPath = await findExecutable(head);
      if (!toolOnPath) {
        candidate.available = false;
        continue;
      }
      const binName = candidate.id === "vitest" ? "vitest" : candidate.id === "jest" ? "jest" : null;
      if (binName) {
        const localBin = await existsInRepo(snapshot.root, path.join("node_modules", ".bin", binName));
        candidate.available = localBin ? true : null; // npx could still fetch it
      } else {
        candidate.available = true;
      }
    } else {
      const found = await findExecutable(head);
      candidate.available = found !== null;
    }
  }

  return {
    languages: [...languages].sort(),
    packageManagers: [...packageManagers].sort(),
    frameworks: [...frameworks].sort(),
    testRunners: candidates,
    notes,
  };
}
