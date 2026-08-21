import { test } from "node:test";
import assert from "node:assert/strict";
import { containsLikelySecret, redactDeep, redactString } from "../../src/evidence/redaction.js";

const GH_TOKEN = `ghp_${"x".repeat(30)}`;
const OPENAI_KEY = `sk-${"k".repeat(20)}`;
const AWS_KEY = `AKIA${"1234567890ABCDEF"}`;
const BEARER = `Bearer ${"t".repeat(16)}`;
const PASSWORD_LINE = `password = "${"p".repeat(12)}"`;
const PEM_BLOCK = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "MIIEpAIBAAKCAQEA",
  "-----END RSA PRIVATE KEY-----",
].join("\n");
const CRED_URL = "https://alice:hunter2@example.com/repo";

test("redactString masks a GitHub token and reports the rule", () => {
  const result = redactString(`token ${GH_TOKEN} end`);
  assert.deepEqual(result.appliedRules, ["github-token"]);
  assert.ok(result.text.includes("[REDACTED:github-token]"));
  assert.ok(!result.text.includes(GH_TOKEN));
});

test("redactString masks an sk- style API key", () => {
  const result = redactString(`key ${OPENAI_KEY} end`);
  assert.deepEqual(result.appliedRules, ["openai-key"]);
  assert.ok(!result.text.includes(OPENAI_KEY));
});

test("redactString masks an AWS access key id", () => {
  const result = redactString(`id ${AWS_KEY} end`);
  assert.deepEqual(result.appliedRules, ["aws-access-key"]);
  assert.ok(!result.text.includes(AWS_KEY));
});

test("redactString masks bearer tokens", () => {
  const result = redactString(`Authorization: ${BEARER}`);
  assert.deepEqual(result.appliedRules, ["bearer-token"]);
  assert.ok(result.text.includes("[REDACTED:bearer-token]"));
  assert.ok(!result.text.includes("t".repeat(16)));
});

test("redactString masks password assignments", () => {
  const result = redactString(PASSWORD_LINE);
  assert.deepEqual(result.appliedRules, ["credential-assignment"]);
  assert.ok(result.text.includes("[REDACTED:credential-assignment]"));
  assert.ok(!result.text.includes("p".repeat(12)));
});

test("redactString masks private key blocks across lines", () => {
  const result = redactString(PEM_BLOCK);
  assert.deepEqual(result.appliedRules, ["private-key-block"]);
  assert.ok(result.text.includes("[REDACTED:private-key-block]"));
  assert.ok(!result.text.includes("BEGIN RSA PRIVATE KEY"));
});

test("redactString masks credentials embedded in https URLs", () => {
  const result = redactString(CRED_URL);
  assert.deepEqual(result.appliedRules, ["url-credentials"]);
  assert.ok(result.text.includes("[REDACTED:url-credentials]"));
  assert.ok(!result.text.includes("alice:hunter2@"));
});

test("redactDeep handles nested objects and arrays with the union of rules", () => {
  const input = {
    meta: { note: "clean value" },
    list: [GH_TOKEN, PASSWORD_LINE],
  };
  const { value, appliedRules } = redactDeep(input);
  assert.deepEqual(appliedRules, ["credential-assignment", "github-token"]);
  assert.equal(value.meta.note, "clean value");
  assert.ok(value.list[0]?.includes("[REDACTED:github-token]"));
  assert.ok(value.list[1]?.includes("[REDACTED:credential-assignment]"));
  assert.ok(!JSON.stringify(value).includes(GH_TOKEN));
});

test("containsLikelySecret detects tokens and passes clean text", () => {
  assert.equal(containsLikelySecret(`leak ${GH_TOKEN}`), true);
  assert.equal(containsLikelySecret("plain text with no secrets"), false);
});

test("redacted output keeps markers and drops every original secret", () => {
  const combined = [GH_TOKEN, OPENAI_KEY, AWS_KEY, BEARER, PEM_BLOCK, CRED_URL].join("\n");
  const result = redactString(combined);
  assert.ok(result.text.includes("[REDACTED:"));
  for (const secret of [GH_TOKEN, OPENAI_KEY, AWS_KEY, CRED_URL]) {
    assert.ok(!result.text.includes(secret));
  }
});
