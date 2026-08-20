import type {
  ContextFileSelection,
  PullRequest,
  PullRequestFile,
  RepositoryContext,
} from "./types";

export const IGNORED_DIRS = new Set([
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
]);

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".class",
  ".jar",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm",
  ".pyc",
  ".pkl",
  ".bin",
  ".min.js",
  ".min.css",
]);

export const MANIFEST_FILES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
]);

export function isBinaryFile(path: string, content?: string): boolean {
  const lower = path.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (content === undefined) return false;
  const sample = content.slice(0, 8192);
  if (sample.includes("\u0000")) return true;
  return false;
}

export function isIgnoredPath(path: string): boolean {
  const parts = path.split("/");
  return parts.some((p) => IGNORED_DIRS.has(p));
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const re = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(diff)) !== null) {
    hunks.push({
      header: match[0],
      oldStart: Number(match[1]),
      oldLines: match[2] ? Number(match[2]) : 1,
      newStart: Number(match[3]),
      newLines: match[4] ? Number(match[4]) : 1,
    });
  }
  return hunks;
}

export function changedLinesFor(
  file: PullRequestFile,
  afterLine: number
): { line: number; kind: "added" | "removed" | "context" }[] {
  const out: Array<{ line: number; kind: "added" | "removed" | "context" }> = [];
  const hunks = parseUnifiedDiff(file.unifiedDiff);
  if (!hunks.length) return out;
  const lines = file.unifiedDiff.split("\n");
  let newLine = 0;
  for (const raw of lines) {
    if (/^@@/.test(raw)) continue;
    if (/^(diff |index |--- |\+\+\+ |new file|deleted file)/.test(raw)) continue;
    if (raw.startsWith("-") && !raw.startsWith("---")) {
      // removed line, maps to afterLine only via nearest context below
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      newLine++;
      if (newLine === afterLine) out.push({ line: newLine, kind: "added" });
      continue;
    }
    newLine++;
    if (newLine === afterLine) out.push({ line: newLine, kind: "context" });
  }
  return out;
}

export interface LanguageInfo {
  language: string;
  framework: string;
  testCommand: string | null;
}

export function detectLanguage(files: PullRequestFile[]): LanguageInfo {
  const paths = files.map((f) => f.path.toLowerCase());
  if (paths.some((p) => p.endsWith(".py") || p.includes("requirements") || p.includes("pyproject"))) {
    return {
      language: "python",
      framework: paths.some((p) => p.includes("django")) ? "django" : "pytest",
      testCommand: "pytest -q",
    };
  }
  if (paths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.includes("package.json"))) {
    return {
      language: "typescript",
      framework: paths.some((p) => p.includes("vitest")) ? "vitest" : "jest",
      testCommand: "npm test -- --runInBand",
    };
  }
  if (paths.some((p) => p.endsWith(".go"))) {
    return { language: "go", framework: "go test", testCommand: "go test ./..." };
  }
  if (paths.some((p) => p.endsWith(".rb"))) {
    return { language: "ruby", framework: "rspec", testCommand: "bundle exec rspec" };
  }
  return { language: "unknown", framework: "unknown", testCommand: null };
}

export const DEFAULT_CONTEXT_BUDGET = 16_000;
export const MAX_FILE_BYTES = 256 * 1024;

export function selectContext(
  pr: PullRequest,
  budget = DEFAULT_CONTEXT_BUDGET
): RepositoryContext {
  const selections: ContextFileSelection[] = [];
  let changedTokens = 0;

  for (const file of pr.files) {
    const path = file.path;
    if (isIgnoredPath(path)) {
      selections.push({ path, sizeBytes: file.content.length, estimatedTokens: 0, reason: "ignored", selected: false });
      continue;
    }
    if (isBinaryFile(path, file.content) || file.binary) {
      selections.push({ path, sizeBytes: file.content.length, estimatedTokens: 0, reason: "ignored", selected: false });
      continue;
    }
    const size = Buffer.byteLength(file.content, "utf8");
    const tokens = estimateTokens(file.content);
    const base = MANIFEST_FILES.has(path.toLowerCase());
    const isReadme = /readme|license|coc/i.test(path);
    const isTest = /test|spec|__tests__/i.test(path);
    const reason: ContextFileSelection["reason"] = base
      ? "manifest"
      : isReadme
        ? "readme"
        : isTest
          ? "test"
          : "changed";
    const withinSize = size <= MAX_FILE_BYTES;
    const withinBudget = changedTokens + tokens <= budget;
    const selected = withinSize && withinBudget;
    if (selected) changedTokens += tokens;
    selections.push({
      path,
      sizeBytes: size,
      estimatedTokens: tokens,
      reason,
      selected,
    });
  }

  const lang = detectLanguage(pr.files);

  return {
    owner: pr.owner,
    repo: pr.repo,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    language: lang.language,
    framework: lang.framework,
    testCommand: lang.testCommand,
    files: selections,
    changedTokens,
    budget,
    summary: summarizeChanges(pr, selections),
  };
}

export function summarizeChanges(
  pr: PullRequest,
  selections: ContextFileSelection[]
): string {
  const selected = selections.filter((s) => s.selected && s.reason !== "ignored");
  const skipped = selections.filter((s) => !s.selected && s.reason !== "ignored");
  const lines: string[] = [];
  lines.push(
    `PR #${pr.number} (${pr.headRef} → ${pr.baseRef}) changes ${pr.files.length} file(s): ` +
      `+${pr.totalAdditions} / -${pr.totalDeletions}.`
  );
  if (selected.length) {
    lines.push(`Context includes: ${selected.map((s) => s.path).join(", ")}.`);
  }
  if (skipped.length) {
    lines.push(
      `Skipped (binary/size/budget): ${skipped.map((s) => s.path).join(", ")}.`
    );
  }
  return lines.join("\n");
}

export function contextFilesMarkdown(context: RepositoryContext): string {
  const rows = context.files
    .filter((f) => f.selected)
    .map((f) => `| ${f.path} | ${f.estimatedTokens} | ${f.reason} |`);
  return [
    `## Repository context (${context.owner}/${context.repo})`,
    "",
    `Language: ${context.language} · framework: ${context.framework} · test command: ${context.testCommand ?? "none"}`,
    `Changed tokens: ${context.changedTokens} / budget ${context.budget}`,
    "",
    "| File | Tokens | Reason |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}