import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../../src/core/policy.js";
import { buildChildEnv, checkCommandAllowed } from "../../src/executors/sandbox.js";

test("checkCommandAllowed allows an allow-listed command", () => {
  const check = checkCommandAllowed(["npm", "test"], DEFAULT_POLICY);
  assert.equal(check.allowed, true);
  assert.equal(check.reason, "");
});

test("checkCommandAllowed rejects executables outside the allow-list", () => {
  const check = checkCommandAllowed(["curl", "https://example.com"], DEFAULT_POLICY);
  assert.equal(check.allowed, false);
  assert.ok(check.reason.includes("allow-list"));
  assert.ok(check.reason.includes("curl"));
});

test("checkCommandAllowed rejects shell metacharacters in argv", () => {
  const check = checkCommandAllowed(["npm", "-e", "a;b"], DEFAULT_POLICY);
  assert.equal(check.allowed, false);
  assert.ok(check.reason.includes("metacharacters"));
});

test("buildChildEnv drops proxies and unknown vars, keeps PATH", (t) => {
  process.env.HTTP_PROXY = "http://proxy:8080";
  process.env.HTTPS_PROXY = "https://proxy:8443";
  process.env.NODEFORGE_TEST_RANDOM_VAR = "leak";
  t.after(() => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NODEFORGE_TEST_RANDOM_VAR;
  });

  const env = buildChildEnv(DEFAULT_POLICY);
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.http_proxy, undefined);
  assert.equal(env.https_proxy, undefined);
  assert.equal(env.NODEFORGE_TEST_RANDOM_VAR, undefined);
  assert.equal(typeof env.PATH, "string");
  assert.ok((env.PATH ?? "").length > 0);
  assert.equal(typeof env.NODE_ENV, "string");
});
