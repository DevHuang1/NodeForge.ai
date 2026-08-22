import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../lib/llm";
import { checkRateLimit, clientIp, rateLimit } from "../lib/rate-limit";

test("extractJson parses plain JSON objects", () => {
  assert.deepEqual(extractJson('{"a": 1}'), { a: 1 });
  assert.deepEqual(extractJson('  {"a": {"b": [1,2]}}  '), { a: { b: [1, 2] } });
});

test("extractJson handles markdown fences and surrounding prose", () => {
  assert.deepEqual(extractJson('```json\n{"ok": true}\n```'), { ok: true });
  assert.deepEqual(
    extractJson('Here is the result:\n{"answer": "yes"}\nDone.'),
    { answer: "yes" }
  );
});

test("extractJson keeps braces inside string values balanced", () => {
  const value = 'code snippet with { and } inside';
  const raw = `{"note": "${value.replace(/"/g, '\\"')}"}`;
  assert.deepEqual(extractJson(`prefix ${raw}`), { note: value });
});

test("extractJson repairs truncated (unbalanced) JSON", () => {
  assert.deepEqual(extractJson('{"a": 1, "b": [2'), { a: 1, b: [2] });
});

test("extractJson repairs truncated nested objects and arrays", () => {
  assert.deepEqual(extractJson('{"a": {"b": [1, {"c": 2'), {
    a: { b: [1, { c: 2 }] },
  });
  assert.deepEqual(extractJson('{"items": ["x", "y"'), { items: ["x", "y"] });
});

test("extractJson parses objects that contain arrays normally", () => {
  assert.deepEqual(extractJson('noise {"a": [1, 2], "b": {"c": 3}} tail'), {
    a: [1, 2],
    b: { c: 3 },
  });
});

test("extractJson rejects output with no object", () => {
  assert.throws(() => extractJson("no json here"), /No JSON object found/);
});

test("extractJson throws a consistent error on invalid JSON payloads", () => {
  try {
    extractJson('{a: broken}');
    assert.fail("expected throw");
  } catch (err) {
    assert.match((err as Error).message, /Invalid JSON object in model output/);
    assert.equal((err as Error & { status?: number }).status, 0);
  }
});

test("rateLimit allows requests under the window budget", () => {
  const key = `test-ok-${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const result = rateLimit(key);
    assert.equal(result.allowed, true);
  }
});

test("rateLimit blocks once the fixed-window budget is exhausted", () => {
  const key = `test-block-${Date.now()}`;
  let blocked = false;
  for (let i = 0; i < 50 && !blocked; i++) {
    blocked = !rateLimit(key).allowed;
  }
  assert.equal(blocked, true);
  const after = rateLimit(key);
  assert.equal(after.allowed, false);
  assert.ok(after.retryAfterSec >= 1);
});

test("clientIp prefers proxy headers and falls back to anonymous", () => {
  const withHeader = new Request("https://x.test", {
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
  });
  assert.equal(clientIp(withHeader), "203.0.113.7");

  const bare = new Request("https://x.test");
  assert.equal(clientIp(bare), "anonymous");
});

test("checkRateLimit returns a 429 response when over budget", () => {
  const ip = `198.51.100.${Date.now() % 250}`;
  let last: Response | null = null;
  for (let i = 0; i < 12; i++) {
    last = checkRateLimit(
      new Request("https://x.test", { headers: { "x-forwarded-for": ip } }),
      "pipeline"
    );
  }
  assert.ok(last);
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("Retry-After"));
});
