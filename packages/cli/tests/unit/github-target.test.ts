import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseTarget, resolveRefTarget } from "../../src/context/repository.js";

test("parseTarget parses a GitHub pull request URL", () => {
  const target = parseTarget("https://github.com/acme/notes-search/pull/42", process.cwd());
  assert.equal(target.kind, "pull_request");
  assert.ok(target.kind === "pull_request");
  assert.equal(target.owner, "acme");
  assert.equal(target.repo, "notes-search");
  assert.equal(target.number, 42);
  assert.equal(target.url, "https://github.com/acme/notes-search/pull/42");
});

test("parseTarget handles trailing slashes and query strings", () => {
  for (const input of [
    "https://github.com/acme/notes-search/pull/42/",
    "https://github.com/acme/notes-search/pull/42?diff=unified",
    "https://github.com/acme/notes-search/pull/42#discussion_r1",
  ]) {
    const target = parseTarget(input, process.cwd());
    assert.equal(target.kind, "pull_request");
    if (target.kind === "pull_request") {
      assert.equal(target.owner, "acme");
      assert.equal(target.repo, "notes-search");
      assert.equal(target.number, 42);
    }
  }
});

test("parseTarget treats a filesystem path as a local target", () => {
  const cwd = process.cwd();
  const target = parseTarget("/tmp", cwd);
  assert.deepEqual(target, { kind: "local", path: path.resolve(cwd, "/tmp") });
});

test("resolveRefTarget returns null for a nonexistent name outside a git repo", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const result = await resolveRefTarget("no-such-ref-or-dir", dir);
  assert.equal(result, null);
});
