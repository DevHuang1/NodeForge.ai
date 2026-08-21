/**
 * Shared file classification used by the context layer and scanners.
 * Ported from the platform's repository-context module and adapted for
 * working-tree scanning.
 */

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
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
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".gz", ".tar",
  ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".woff", ".woff2",
  ".ttf", ".eot", ".wasm", ".pyc", ".pkl", ".bin", ".min.js", ".min.css",
  ".lock", ".ds_store",
]);

/** Text file extensions worth deep-scanning; everything else is metadata-only. */
const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".php",
  ".c", ".h", ".cpp", ".hpp", ".cs",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env", ".properties",
  ".md", ".txt", ".sh", ".bash", ".zsh", ".ps1", ".sql", ".html", ".css",
  ".xml", ".gradle", ".tf", ".dockerfile",
]);

const SPECIAL_FILENAMES: ReadonlySet<string> = new Set([
  "dockerfile", "makefile", "procfile", ".env", ".env.local", ".env.example",
  ".gitignore", ".gitattributes", "license", "notice",
]);

export function extensionOf(filePath: string): string {
  const base = filePath.toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot);
}

export function isIgnoredPath(repoRelativePath: string): boolean {
  return repoRelativePath
    .split("/")
    .some((segment) => IGNORED_DIRS.has(segment));
}

export function isBinaryExtension(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(filePath));
}

export function looksBinaryByExtension(filePath: string): boolean {
  const base = filePath.toLowerCase();
  const name = base.slice(base.lastIndexOf("/") + 1);
  if (SPECIAL_FILENAMES.has(name)) return false;
  if (!SCANNABLE_EXTENSIONS.has(extensionOf(base))) return true;
  return false;
}

/** NUL-byte sniff on a content sample. */
export function sniffBinary(sample: string): boolean {
  return sample.includes("\u0000");
}
