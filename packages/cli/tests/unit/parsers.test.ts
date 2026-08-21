import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_COUNTS,
  countsAreCoherent,
  parseGoTest,
  parseJestLike,
  parseNodeTest,
  parsePytest,
  parseRunnerOutput,
} from "../../src/executors/parsers.js";

const JEST_TEXT = "Tests:       1 failed, 5 passed, 2 skipped, 8 total";
const JEST_COUNTS = { discovered: 8, passed: 5, failed: 1, skipped: 2 };

test("parseJestLike reads a Jest summary block", () => {
  assert.deepEqual(parseJestLike(JEST_TEXT), JEST_COUNTS);
});

test("parseJestLike reads a Vitest style summary block", () => {
  const counts = parseJestLike(" Tests  2 failed | 7 passed (9)");
  assert.deepEqual(counts, { discovered: 9, passed: 7, failed: 2, skipped: 0 });
  assert.equal(countsAreCoherent(counts), true);
});

test("parsePytest reads collected items plus the short summary", () => {
  const output = ["collected 6 items", "=== 1 failed, 5 passed in 0.5s ==="].join("\n");
  const counts = parsePytest(output);
  assert.deepEqual(counts, { discovered: 6, passed: 5, failed: 1, skipped: 0 });
  assert.equal(countsAreCoherent(counts), true);
});

test("parseGoTest counts failing tests and packages", () => {
  const output = ["=== RUN   TestX", "--- FAIL: TestX (0.00s)", "FAIL"].join("\n");
  assert.deepEqual(parseGoTest(output), { discovered: 1, passed: 0, failed: 1, skipped: 0 });
});

test("parseGoTest counts passing tests and ok packages", () => {
  const output = ["--- PASS: TestY (0.00s)", "ok  example.com/pkg  0.01s"].join("\n");
  assert.deepEqual(parseGoTest(output), { discovered: 1, passed: 1, failed: 0, skipped: 0 });
});

test("parseNodeTest reads the spec reporter summary", () => {
  const output = [
    "▶ tests",
    "  ✔ math still works (0.6ms)",
    "ℹ tests 1",
    "ℹ suites 0",
    "ℹ pass 1",
    "ℹ fail 0",
    "ℹ cancelled 0",
    "ℹ skipped 0",
    "ℹ todo 0",
  ].join("\n");
  assert.deepEqual(parseNodeTest(output), { discovered: 1, passed: 1, failed: 0, skipped: 0 });
});

test("parseNodeTest reads the TAP reporter summary", () => {
  const output = [
    "TAP version 14",
    "ok 1 - math still works",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ].join("\n");
  assert.deepEqual(parseNodeTest(output), { discovered: 1, passed: 1, failed: 0, skipped: 0 });
});

test("parseNodeTest counts failures and skips", () => {
  const output = ["not ok 1 - broken", "# tests 3", "# pass 1", "# fail 1", "# skipped 1"].join("\n");
  assert.deepEqual(parseNodeTest(output), { discovered: 3, passed: 1, failed: 1, skipped: 1 });
});

test("parseNodeTest does not misread Jest or Vitest summaries", () => {
  assert.deepEqual(parseNodeTest(JEST_TEXT), EMPTY_COUNTS);
  assert.deepEqual(parseNodeTest(" Tests  2 failed | 7 passed (9)"), EMPTY_COUNTS);
});

test("parseRunnerOutput dispatches npm-test to Jest-like parsing", () => {
  assert.deepEqual(parseRunnerOutput("npm-test", JEST_TEXT), JEST_COUNTS);
});

test("parseRunnerOutput falls back to node:test parsing for npm scripts", () => {
  const output = ["ℹ tests 2", "ℹ pass 2", "ℹ fail 0"].join("\n");
  assert.deepEqual(parseRunnerOutput("npm-test", output), { discovered: 2, passed: 2, failed: 0, skipped: 0 });
});

test("unparseable output yields EMPTY_COUNTS and incoherent counts", () => {
  const counts = parseRunnerOutput(null, "an unfathomable wall of text");
  assert.deepEqual(counts, EMPTY_COUNTS);
  assert.equal(countsAreCoherent(counts), false);
});
