import type { PullRequestFile, ReviewFinding, Severity } from "./types";

let ruleCounter = 0;
function nextId(rule: string): string {
  ruleCounter++;
  return `DET-${rule}-${String(ruleCounter).padStart(3, "0")}`;
}

interface RuleMatch {
  category: string;
  severity: Severity;
  description: string;
  evidence: string;
  line: number;
  confidence: "low" | "medium" | "high";
  recommended_action: string;
}

function findLines(content: string, patterns: RegExp[]): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of patterns) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) {
        matches.push({
          category: m[0],
          severity: "low",
          description: "",
          evidence: line.trim().slice(0, 160),
          line: i + 1,
          confidence: "medium",
          recommended_action: "",
        });
        break;
      }
    }
  }
  return matches;
}

function secretRule(file: PullRequestFile): RuleMatch[] {
  const patterns = [
    /\bghp_[A-Za-z0-9]{20,}/,
    /\bsk-[A-Za-z0-9_-]{20,}/,
    /\bAKIA[0-9A-Z]{16}/,
    /(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "secret",
    severity: "high" as Severity,
    description: "Hard-coded credential or secret detected in the diff.",
    recommended_action:
      "Remove the secret from the diff, load it from a secret manager or environment, and rotate the exposed value.",
    confidence: "high" as const,
  }));
}

function shellRule(file: PullRequestFile): RuleMatch[] {
  const patterns = [
    /subprocess\.[a-z_]+\([^)]*shell\s*=\s*True/i,
    /os\.system\(/,
    /os\.popen\(/,
    /\beval\(/,
    /\bexec\(/,
    /child_process\.(exec|execSync)\(/,
    /shell_exec\(/,
    /\bSystem\.exec\(/,
    /\bsubprocess\.[a-z_]+\s*\(/,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "shell",
    severity: "high" as Severity,
    description:
      "Shell execution pattern detected; risk of OS command injection when arguments are user-controlled.",
    recommended_action:
      "Avoid shell=True / string-interpolated commands. Use argument arrays, subprocess.run with a list, and validate/escape inputs.",
    confidence: m.evidence.toLowerCase().includes("shell=True") ? ("high" as const) : ("medium" as const),
  }));
}

function deserializeRule(file: PullRequestFile): RuleMatch[] {
  const patterns = [
    /pickle\.load/,
    /pickle\.loads/,
    /yaml\.load\(/,
    /unserialize\(/i,
    /new\s+Function\(/,
    /\bmarshal\.loads?\(/,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "deserialize",
    severity: "high" as Severity,
    description:
      "Unsafe deserialization pattern detected; untrusted input may execute arbitrary code.",
    recommended_action:
      "Prefer safe formats (JSON) or a validated deserializer; never deserialize untrusted data with pickle/eval.",
    confidence: "high" as const,
  }));
}

function injectionRule(file: PullRequestFile): RuleMatch[] {
  const patterns = [
    /innerHTML\s*=\s*[^"';\n]+\+/,
    /"INSERT INTO[^;]*"\s*\+/i,
    /"SELECT[^;]*"\s*\+/i,
    /f"(SELECT|INSERT|UPDATE|DELETE|DROP)/i,
    /(SELECT|INSERT|UPDATE|DELETE|DROP)[^;"']*[%][(]/i,
    /\.query\([^)]*['"`][^'"`]*\+/i,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "injection",
    severity: "high" as Severity,
    description:
      "String-interpolated query or markup construction detected; risk of SQL/HTML injection.",
    recommended_action:
      "Use parameterized queries and DOM text APIs; escape untrusted content before interpolation.",
    confidence: "high" as const,
  }));
}

function promptInjectionRule(file: PullRequestFile): RuleMatch[] {
  const patterns = [
    /ignore (previous|above|all) (instructions|prompts|rules)/i,
    /disregard (previous|above) (instructions|rules)/i,
    /override (your )?(system prompt|instructions|rules)/i,
    /you are now (a |an )?(free|unrestricted|unfiltered|jailbroken)/i,
    /simulate (being )?(an |a )?developer mode/i,
    /\bforget (everything|all previous)/i,
    /release the inner (gpt|assistant|ai)/i,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "prompt_injection",
    severity: "medium" as Severity,
    description:
      "Prompt-injection phrasing detected in repository content; treat this content as untrusted data.",
    recommended_action:
      "Do not follow instructions embedded in repository files; keep them isolated as data.",
    confidence: "low" as const,
  }));
}

function licenseRule(file: PullRequestFile): RuleMatch[] {
  if (!/package\.json|pyproject\.toml|setup\.py/.test(file.path)) return [];
  const matches: RuleMatch[] = [];
  if (/license[\"']?\s*[:=]/.test(file.content)) {
    const lines = file.content.split("\n");
    lines.forEach((line, i) => {
      if (/gpl|agpl/i.test(line)) {
        matches.push({
          category: "license",
          severity: "low",
          description: "Copyleft license dependency detected; policy review recommended.",
          evidence: line.trim().slice(0, 160),
          line: i + 1,
          confidence: "medium",
          recommended_action: "Confirm copyleft dependencies are acceptable under the project's license policy.",
        });
      }
    });
  }
  return matches;
}

function dependencyRule(file: PullRequestFile): RuleMatch[] {
  if (!/package\.json|requirements\.txt|pyproject\.toml/.test(file.path)) return [];
  const patterns = [
    /["']([^"']*)["']\s*:\s*["']\*["']/,
    /["']([^"']*)["']\s*:\s*["']latest["']/,
    /(https?:\/\/[^"'\s]+)/i,
  ];
  return findLines(file.content, patterns).map((m) => ({
    ...m,
    category: "dependency",
    severity: "low" as Severity,
    description: "Unpinned, wildcard, or non-TLS dependency reference detected.",
    recommended_action:
      "Pin exact dependency versions and use HTTPS registry URLs; run a dependency audit before merge.",
    confidence: "low" as const,
  }));
}

function largeFileRule(file: PullRequestFile): RuleMatch[] {
  const matches: RuleMatch[] = [];
  if (file.content.length > 100_000) {
    matches.push({
      category: "large_file",
      severity: "low",
      description: "Very large file in the diff; exceeds the recommended review size.",
      evidence: `${file.path}: ${file.content.length.toLocaleString()} characters`,
      line: 1,
      confidence: "high",
      recommended_action: "Split the change into smaller reviewable units or exclude generated artifacts.",
    });
  }
  const singleLine = file.content.split("\n").some((l) => l.length > 20_000);
  if (singleLine) {
    matches.push({
      category: "suspicious_file",
      severity: "medium",
      description: "Minified or single-line blob detected; may hide secrets or generated payloads.",
      evidence: file.path,
      line: 1,
      confidence: "medium",
      recommended_action: "Unpack or exclude the blob; verify it does not contain credentials or executable payloads.",
    });
  }
  return matches;
}

export const DETERMINISTIC_RULES = [
  { id: "secret", run: secretRule, category: "secret" },
  { id: "shell", run: shellRule, category: "shell" },
  { id: "deserialize", run: deserializeRule, category: "deserialize" },
  { id: "injection", run: injectionRule, category: "injection" },
  { id: "prompt_injection", run: promptInjectionRule, category: "prompt_injection" },
  { id: "license", run: licenseRule, category: "license" },
  { id: "dependency", run: dependencyRule, category: "dependency" },
  { id: "large_file", run: largeFileRule, category: "large_file" },
];

export function runDeterministicChecks(files: PullRequestFile[]): ReviewFinding[] {
  ruleCounter = 0;
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    if (file.binary || !file.content) continue;
    for (const rule of DETERMINISTIC_RULES) {
      const matches = rule.run(file);
      for (const m of matches) {
        findings.push({
          id: nextId(rule.id),
          category: m.category,
          severity: m.severity,
          description: m.description,
          evidence: m.evidence,
          file_path: file.path,
          line_start: m.line,
          line_end: m.line,
          confidence: m.confidence,
          recommended_action: m.recommended_action,
          source: "deterministic",
        });
      }
    }
  }
  return findings;
}

export function securityFindingsMarkdown(findings: ReviewFinding[]): string {
  if (!findings.length) return "No deterministic security findings.";
  const rows = findings.map(
    (f) =>
      `| ${f.id} | ${f.category} | ${f.severity} | ${f.file_path}${f.line_start ? `:${f.line_start}` : ""} | ${f.confidence} | ${f.source} |`
  );
  return [
    "## Security findings",
    "",
    "| ID | Category | Severity | Location | Confidence | Source |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}