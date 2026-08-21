/**
 * Deterministic security rules.
 *
 * Line-oriented, dependency-free pattern rules covering the six required
 * categories: shell injection, unsafe subprocess usage, unsafe
 * deserialization, hard-coded secrets, suspicious network calls, and unsafe
 * filesystem access. Every match carries concrete evidence (the source line).
 */

import type { ScannerRule, ScannerRuleMatch, Severity } from "../core/contracts.js";
import { redactString } from "../evidence/redaction.js";

interface LineMatch {
  re: RegExp;
  severity?: Severity;
  message: string;
}

function scanLines(content: string, matchers: readonly LineMatch[]): ScannerRuleMatch[] {
  const matches: ScannerRuleMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length > 4000) continue; // minified blobs handled by policy notes
    for (const matcher of matchers) {
      matcher.re.lastIndex = 0;
      if (matcher.re.test(line)) {
        matches.push({
          startLine: i + 1,
          endLine: i + 1,
          message: matcher.message,
          severity: matcher.severity ?? "medium",
          confidence: "medium",
          excerpt: redactString(line.trim().slice(0, 200)).text,
        });
        break; // one finding per line per rule
      }
    }
  }
  return matches;
}

const isExamplePath = (filePath: string): boolean =>
  /(^|\/)(examples?|samples?|fixtures?|tests?|__tests__)(\/|$)|\.example\b|\.spec\./i.test(filePath);

function confidenceFor(filePath: string): "low" | "high" {
  return isExamplePath(filePath) ? "low" : "high";
}

// ── NF-SECRET: hard-coded credentials ───────────────────────────────────────

const SECRET_MATCHERS: readonly LineMatch[] = [
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, severity: "high", message: "GitHub token literal in source." },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, severity: "high", message: "GitHub fine-grained PAT literal in source." },
  { re: /\bsk-(or-v1-)?[A-Za-z0-9_-]{20,}\b/, severity: "high", message: "OpenAI/OpenRouter-style API key literal in source." },
  { re: /\bAKIA[0-9A-Z]{16}\b/, severity: "critical", message: "AWS access key id literal in source." },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, severity: "high", message: "Private key material committed to the repository." },
  {
    re: /\b(api[_-]?key|secret|token|passwd|password|access[_-]?key)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    severity: "high",
    message: "Hard-coded credential assignment.",
  },
];

export const secretRule: ScannerRule = {
  id: "NF-SECRET",
  version: "1.0.0",
  category: "secrets",
  description: "Hard-coded credentials, tokens, or private key material.",
  recommendedAction:
    "Remove the credential from source, load it from a secret manager or environment, and rotate the exposed value.",
  defaultSeverity: "high",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, SECRET_MATCHERS).map((m) => ({ ...m }));
  },
};

// ── NF-SHELL: shell / dynamic code injection ────────────────────────────────

const SHELL_MATCHERS: readonly LineMatch[] = [
  {
    re: /\b(bash|sh|zsh)\s+-c\s+["'`].*(\$\(|\$\{|`)/,
    severity: "high",
    message: "Shell invoked with -c and interpolated input; OS command injection risk.",
  },
  {
    re: /child_process\.(exec|execSync)\s*\(\s*[`"'][^"'`]*[`"']?\s*\+/,
    severity: "high",
    message: "child_process exec built by string concatenation; use execFile/spawn with argv arrays.",
  },
  {
    re: /child_process\.(exec|execSync)\s*\(\s*`[^`]*\$\{/,
    severity: "high",
    message: "child_process exec using template interpolation; use execFile/spawn with argv arrays.",
  },
  {
    re: /\bos\.system\s*\(/,
    severity: "high",
    message: "os.system() executes a shell string; use subprocess.run with an argument list.",
  },
  {
    re: /\bos\.popen\s*\(/,
    severity: "high",
    message: "os.popen() executes a shell string; use subprocess.run with an argument list.",
  },
  {
    re: /\beval\s*\(\s*(?!['"`]\s*$)/,
    severity: "high",
    message: "eval() on dynamic input executes arbitrary code.",
  },
  {
    re: /new\s+Function\s*\(/,
    severity: "high",
    message: "new Function() compiles dynamic input into executable code.",
  },
  {
    re: /curl\s+[^|]*\|\s*(sudo\s+)?(sh|bash)\b/,
    severity: "high",
    message: "Remote script piped directly into a shell.",
  },
  {
    re: /wget\s+[^|]*\|\s*(sudo\s+)?(sh|bash)\b/,
    severity: "high",
    message: "Remote script piped directly into a shell.",
  },
];

export const shellRule: ScannerRule = {
  id: "NF-SHELL",
  version: "1.0.0",
  category: "shell-injection",
  description: "Shell invocation or dynamic code execution built from untrusted strings.",
  recommendedAction:
    "Use argument arrays (spawn/execFile, subprocess.run with a list), avoid shell=True, and validate inputs before execution.",
  defaultSeverity: "high",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, SHELL_MATCHERS);
  },
};

// ── NF-SUBPROCESS: unsafe process spawning ──────────────────────────────────

const SUBPROCESS_MATCHERS: readonly LineMatch[] = [
  {
    re: /subprocess\.[a-z_]+\s*\([^)]*shell\s*=\s*True/i,
    severity: "high",
    message: "Python subprocess call with shell=True; command injection risk.",
  },
  {
    re: /\bspawn\s*\([^)]*shell\s*:\s*true/,
    severity: "high",
    message: "Node spawn() with shell:true reintroduces shell interpretation; pass argv arrays instead.",
  },
  {
    re: /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(/,
    severity: "medium",
    message: "Java Runtime.exec with a single command string; tokenization may be exploitable.",
  },
  {
    re: /\bexecFile\s*\(\s*[`"'][^"'`]*[`"']?\s*\+/,
    severity: "medium",
    message: "Executable path built by concatenation; pin the executable name.",
  },
];

export const subprocessRule: ScannerRule = {
  id: "NF-SUBPROCESS",
  version: "1.0.0",
  category: "subprocess",
  description: "Process spawning APIs used in ways that enable command injection.",
  recommendedAction:
    "Spawn fixed executables with structured arguments; never enable shell interpretation for untrusted input.",
  defaultSeverity: "high",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, SUBPROCESS_MATCHERS);
  },
};

// ── NF-DESER: unsafe deserialization ────────────────────────────────────────

const DESER_MATCHERS: readonly LineMatch[] = [
  { re: /\bpickle\.loads?\s*\(/, severity: "high", message: "pickle deserialization of potentially untrusted data can execute arbitrary code." },
  { re: /\bmarshal\.loads?\s*\(/, severity: "high", message: "marshal deserialization is unsafe for untrusted input." },
  { re: /\byaml\.load\s*\((?![^)]*Loader\s*=)/, severity: "high", message: "yaml.load without a safe Loader can instantiate arbitrary objects." },
  { re: /\bunserialize\s*\(/i, severity: "high", message: "unserialize() on untrusted data enables object injection." },
  { re: /ObjectInputStream[\s\S]{0,80}readObject\s*\(/, severity: "medium", message: "Java native deserialization of a stream; validate the source." },
];

export const deserRule: ScannerRule = {
  id: "NF-DESER",
  version: "1.0.0",
  category: "deserialization",
  description: "Deserialization APIs that can execute code or instantiate objects from untrusted data.",
  recommendedAction:
    "Prefer safe formats (JSON with schema validation) or format-specific safe loaders; never deserialize untrusted data with pickle/marshal/yaml.unsafe_load.",
  defaultSeverity: "high",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, DESER_MATCHERS);
  },
};

// ── NF-NET: suspicious network activity ─────────────────────────────────────

const NET_MATCHERS: readonly LineMatch[] = [
  { re: /https?:\/\/[^\s"'`]*@/, severity: "medium", message: "URL embeds credentials; move them to headers or environment." },
  { re: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/, severity: "low", message: "Cleartext HTTP endpoint; use HTTPS." },
  { re: /\burllib\.request\.urlopen\s*\(/, severity: "low", message: "Dynamic URL fetch; verify scheme and host allow-lists." },
  { re: /\brequests\.(get|post|put|delete|patch)\s*\(\s*(?!['"]https?:\/\/)/, severity: "low", message: "HTTP request to a dynamic URL; validate destination against an allow-list." },
  { re: /\bsocket\.socket\s*\(/, severity: "low", message: "Raw socket creation; confirm this endpoint is intended and documented." },
  { re: /\bnet\.createConnection\s*\(/, severity: "low", message: "Raw TCP connection; confirm this endpoint is intended and documented." },
  { re: /\bfetch\s*\(\s*`[^`]*\$\{/, severity: "low", message: "Fetch URL built with interpolation; validate components." },
];

export const networkRule: ScannerRule = {
  id: "NF-NET",
  version: "1.0.0",
  category: "network",
  description: "Network calls that warrant review: embedded credentials, cleartext transport, dynamic destinations, raw sockets.",
  recommendedAction:
    "Use HTTPS with pinned validation, keep credentials out of URLs, and restrict outbound destinations to documented allow-lists.",
  defaultSeverity: "medium",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, NET_MATCHERS);
  },
};

// ── NF-FS: unsafe filesystem access ─────────────────────────────────────────

const FS_MATCHERS: readonly LineMatch[] = [
  { re: /chmod\s+(-R\s+)?777\b/, severity: "high", message: "World-writable permissions (chmod 777)." },
  { re: /shutil\.rmtree\s*\(\s*(?!['"])/, severity: "medium", message: "Recursive delete of a dynamic path; validate it is inside the intended directory." },
  { re: /fs\.(rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync)\s*\(\s*[^)]*\.\./, severity: "medium", message: "Delete targeting a path containing traversal segments." },
  { re: /(open|writeFile|writeFileSync)\s*\(\s*["'`]?\/etc\//, severity: "high", message: "Write into /etc from application code." },
  { re: />\s*\/dev\/(sd|nvme|disk)/, severity: "critical", message: "Direct write to a block device." },
  { re: /mkfs(\.\w+)?\b/, severity: "critical", message: "Filesystem formatting command in source." },
  { re: /dd\s+if=.*of=\/dev\//, severity: "critical", message: "Raw device write via dd." },
];

export const filesystemRule: ScannerRule = {
  id: "NF-FS",
  version: "1.0.0",
  category: "filesystem",
  description: "Destructive or overly broad filesystem operations.",
  recommendedAction:
    "Constrain writes/deletes to a known workspace root, resolve and canonicalize paths first, and refuse traversal outside it.",
  defaultSeverity: "medium",
  appliesTo: () => true,
  scan(content: string): ScannerRuleMatch[] {
    return scanLines(content, FS_MATCHERS);
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

/** All built-in deterministic rules, in stable report order. */
export const BUILTIN_RULES: readonly ScannerRule[] = [
  secretRule,
  shellRule,
  subprocessRule,
  deserRule,
  networkRule,
  filesystemRule,
];

export function ruleById(id: string): ScannerRule | undefined {
  return BUILTIN_RULES.find((r) => r.id === id);
}

export { confidenceFor };
