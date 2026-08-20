import { test } from "node:test";
import assert from "node:assert/strict";
import { runDeterministicChecks } from "../lib/security-rules";
import { getSamplePr } from "../lib/sample-pr";

test("deterministic checks flag the sample PR vulnerabilities", () => {
  const pr = getSamplePr()!;
  const findings = runDeterministicChecks(pr.files);

  const byCategory = (c: string) => findings.filter((f) => f.category === c);
  assert.ok(byCategory("shell").length > 0, "expected a shell finding");
  assert.ok(byCategory("secret").length > 0, "expected a secret finding");
  assert.ok(byCategory("deserialize").length > 0, "expected a deserialize finding");

  const shell = byCategory("shell")[0];
  assert.equal(shell.source, "deterministic");
  assert.equal(shell.file_path, "app/search.py");
  assert.equal(shell.severity, "high");

  const secret = byCategory("secret")[0];
  assert.equal(secret.file_path, ".env.example");
  assert.ok(secret.evidence.includes("ghp_"));
});

test("deterministic checks pass clean code", () => {
  const pr = getSamplePr()!;
  pr.files = pr.files.filter((f) => f.path !== "app/search.py" && f.path !== ".env.example");
  const findings = runDeterministicChecks(pr.files);
  const bad = findings.filter(
    (f) => f.category === "shell" || f.category === "secret" || f.category === "deserialize"
  );
  assert.equal(bad.length, 0);
});

test("every finding carries actionable fields", () => {
  const pr = getSamplePr()!;
  const findings = runDeterministicChecks(pr.files);
  for (const f of findings) {
    assert.ok(f.id.startsWith("DET-"));
    assert.ok(f.description.length > 0);
    assert.ok(f.recommended_action.length > 0);
    assert.ok(["low", "medium", "high"].includes(f.confidence));
  }
});