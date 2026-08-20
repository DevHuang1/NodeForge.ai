import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBinaryFile,
  isIgnoredPath,
  estimateTokens,
  parseUnifiedDiff,
  changedLinesFor,
  detectLanguage,
  selectContext,
  DEFAULT_CONTEXT_BUDGET,
} from "../lib/repository-context";
import { getSamplePr } from "../lib/sample-pr";
import type { PullRequestFile } from "../lib/types";

test("isIgnoredPath filters git/ci/tooling dirs", () => {
  assert.equal(isIgnoredPath(".git/config"), true);
  assert.equal(isIgnoredPath("node_modules/x/index.js"), true);
  assert.equal(isIgnoredPath("__pycache__/cache.py"), true);
  assert.equal(isIgnoredPath("dist/bundle.js"), true);
  assert.equal(isIgnoredPath("app/search.py"), false);
});

test("isBinaryFile detects known extensions and null bytes", () => {
  assert.equal(isBinaryFile("assets/logo.png", ""), true);
  assert.equal(isBinaryFile("dist/app.zip", ""), true);
  assert.equal(isBinaryFile("app/search.py", "plain text"), false);
  assert.equal(isBinaryFile("data.bin", "\u0000\u0001\u0002"), true);
});

test("estimateTokens approximates chars / 4", () => {
  assert.equal(estimateTokens(""), 1);
  assert.equal(estimateTokens("hello world"), Math.ceil(11 / 4));
});

test("parseUnifiedDiff extracts hunks with line ranges", () => {
  const diff = [
    "diff --git a/app/search.py b/app/search.py",
    "@@ -3,5 +3,6 @@",
    " index_root = os.getenv(\"SEARCH_INDEX\")",
    "+proc = subprocess.check_output(cmd, shell=True)",
    " def search_notes(keyword):",
    "@@ -20,2 +21,3 @@",
    "+import pickle",
  ].join("\n");
  const hunks = parseUnifiedDiff(diff);
  assert.equal(hunks.length, 2);
  assert.deepEqual(hunks[0].newStart, 3);
  assert.deepEqual(hunks[0].newLines, 6);
});

test("changedLinesFor reports new-side line numbers", () => {
  const file: PullRequestFile = {
    path: "app/search.py",
    status: "modified",
    additions: 1,
    deletions: 0,
    content: "a\nb\nproc = shell(cmd)\n",
    unifiedDiff: [
      "diff --git a/app/search.py b/app/search.py",
      "@@ -1,2 +1,3 @@",
      " a",
      " b",
      "+proc = shell(cmd)",
    ].join("\n"),
    lines: ["a", "b", "proc = shell(cmd)"],
    binary: false,
  };
  const added = changedLinesFor(file, 3);
  assert.ok(added.some((e) => e.line === 3 && e.kind === "added"));
});

test("detectLanguage maps python/pytest", () => {
  const pr = getSamplePr()!;
  const lang = detectLanguage(pr.files);
  assert.equal(lang.language, "python");
  assert.equal(lang.testCommand, "pytest -q");
});

test("selectContext stays within token budget and includes changed files", () => {
  const pr = getSamplePr()!;
  const ctx = selectContext(pr);
  assert.ok(ctx.changedTokens <= ctx.budget);
  assert.equal(ctx.budget, DEFAULT_CONTEXT_BUDGET);
  assert.ok(ctx.files.some((f) => f.path === "app/search.py"));
  assert.ok(ctx.files.some((f) => f.path === ".env.example"));
  assert.ok(ctx.summary.includes("search"));
});