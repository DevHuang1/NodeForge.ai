import { test } from "node:test";
import assert from "node:assert/strict";
import type { FileSnapshot, ScannerRule } from "../../src/core/contracts.js";
import { DEFAULT_POLICY } from "../../src/core/policy.js";
import { EvidenceCollector } from "../../src/evidence/evidence.js";
import {
  BUILTIN_RULES,
  deserRule,
  filesystemRule,
  networkRule,
  secretRule,
  shellRule,
  subprocessRule,
} from "../../src/scanners/rules.js";
import { DeterministicScanEngine } from "../../src/scanners/deterministic.js";
import { sha256Hex } from "../../src/utils/misc.js";

function snap(filePath: string, content: string): FileSnapshot {
  return {
    path: filePath,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    contentHash: sha256Hex(content),
    binary: false,
    content,
  };
}

const cases: Array<{ rule: ScannerRule; firing: string; clean: string }> = [
  {
    rule: secretRule,
    firing: `const t = ghp_${"x".repeat(30)};`,
    clean: "const t = process.env.GITHUB_TOKEN;",
  },
  {
    rule: shellRule,
    firing: "result = os.system(cmd)",
    clean: 'print("hello")',
  },
  {
    rule: subprocessRule,
    firing: "subprocess.call(cmd, shell=True)",
    clean: 'subprocess.run(["ls", "-la"])',
  },
  {
    rule: deserRule,
    firing: "obj = pickle.loads(blob)",
    clean: "obj = json.loads(text)",
  },
  {
    rule: networkRule,
    firing: "resp = requests.get(userSuppliedUrl)",
    clean: 'const endpoint = "https://example.com/api";',
  },
  {
    rule: filesystemRule,
    firing: "chmod 777 /tmp/shared",
    clean: "chmod 644 file.txt",
  },
];

for (const { rule, firing, clean } of cases) {
  test(`${rule.id} fires on a suspicious snippet with correct startLine`, () => {
    const content = `line one\n${firing}\nline three\n`;
    const matches = rule.scan(content);
    assert.ok(matches.length >= 1);
    assert.equal(matches[0]?.startLine, 2);
    assert.equal(matches[0]?.endLine, 2);
  });

  test(`${rule.id} ignores a clean snippet`, () => {
    assert.deepEqual(rule.scan(clean), []);
  });
}

test("networkRule flags cleartext http and dynamic requests.get", () => {
  const content = [
    "header",
    "http://example.com/api",
    "requests.get(userSuppliedUrl)",
    "tail",
  ].join("\n");
  const matches = networkRule.scan(content);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.startLine, 2);
  assert.equal(matches[1]?.startLine, 3);
});

test("engine sorts findings by severity desc then path", async () => {
  const collector = new EvidenceCollector();
  const engine = new DeterministicScanEngine(BUILTIN_RULES, collector);
  const fileA = snap("src/a.txt", "intro line\nos.system(command)\nchmod 777 scratch\n");
  const fileB = snap("src/b.txt", "key AKIA1234567890ABCDEF value\n");
  const result = await engine.scan([fileA, fileB], DEFAULT_POLICY);

  assert.equal(result.filesScanned, 2);
  assert.equal(result.filesSkipped, 0);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.findings.map((f) => f.ruleId),
    ["NF-SECRET", "NF-SHELL", "NF-FS"]
  );
  assert.deepEqual(
    result.findings.map((f) => f.severity),
    ["critical", "high", "high"]
  );
  assert.deepEqual(
    result.findings.map((f) => f.filePath),
    ["src/b.txt", "src/a.txt", "src/a.txt"]
  );
  assert.deepEqual(
    result.findings.map((f) => f.startLine),
    [1, 2, 3]
  );
});

test("identical matches across files dedupe to one fingerprint", async () => {
  const dup = "safe line\nchmod 777 target\n";
  const singleEngine = new DeterministicScanEngine(BUILTIN_RULES, new EvidenceCollector());
  const single = await singleEngine.scan([snap("docs/copy-one.txt", dup)], DEFAULT_POLICY);
  assert.equal(single.findings.length, 1);
  const fingerprint = single.findings[0]?.fingerprint;
  assert.ok(fingerprint);

  const dupEngine = new DeterministicScanEngine(BUILTIN_RULES, new EvidenceCollector());
  const both = await dupEngine.scan(
    [snap("docs/copy-one.txt", dup), snap("docs/copy-two.txt", dup)],
    DEFAULT_POLICY
  );
  assert.equal(both.findings.length, 1);
  assert.equal(both.findings[0]?.fingerprint, fingerprint);
});

test("binary and unreadable files are skipped and counted", async () => {
  const binaryFile: FileSnapshot = {
    path: "assets/logo.png",
    sizeBytes: 12,
    contentHash: sha256Hex("assets/logo.png"),
    binary: true,
  };
  const noContentFile: FileSnapshot = {
    path: "locked.txt",
    sizeBytes: 4,
    contentHash: sha256Hex("locked"),
    binary: false,
  };
  const oversize = snap("big.txt", "chmod 777 x\n");
  oversize.sizeBytes = DEFAULT_POLICY.maxFileBytes + 1;

  const engine = new DeterministicScanEngine(BUILTIN_RULES, new EvidenceCollector());
  const result = await engine.scan([binaryFile, noContentFile, oversize], DEFAULT_POLICY);
  assert.equal(result.filesScanned, 0);
  assert.equal(result.filesSkipped, 2);
  assert.deepEqual(result.findings, []);
});

test("every finding evidence id exists in the collector", async () => {
  const collector = new EvidenceCollector();
  const engine = new DeterministicScanEngine(BUILTIN_RULES, collector);
  const result = await engine.scan(
    [snap("src/a.txt", "os.system(command)\n"), snap("src/b.txt", "pickle.loads(blob)\n")],
    DEFAULT_POLICY
  );
  assert.ok(result.findings.length >= 2);
  const ids = new Set(collector.list().map((e) => e.id));
  for (const finding of result.findings) {
    assert.ok(finding.evidenceIds.length > 0);
    for (const id of finding.evidenceIds) {
      assert.ok(ids.has(id));
    }
  }
});
