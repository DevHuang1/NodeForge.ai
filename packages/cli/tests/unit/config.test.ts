import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig, loadConfigFromDir, validateConfig } from "../../src/config/config.js";

test("validateConfig(undefined) returns defaults with no issues", () => {
  const { config, issues } = validateConfig(undefined);
  assert.deepEqual(issues, []);
  assert.deepEqual(config, defaultConfig());
});

test("wrong-typed scan.maxFiles produces an issue at the exact path", () => {
  const { config, issues } = validateConfig({ scan: { maxFiles: "x" } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "scan.maxFiles");
  assert.equal(config.scan.maxFiles, defaultConfig().scan.maxFiles);
});

test("valid partial config merges onto defaults preserving unspecified fields", () => {
  const { config, issues } = validateConfig({
    scan: { maxFiles: 5 },
    tests: { enabled: false },
  });
  assert.deepEqual(issues, []);
  assert.equal(config.scan.maxFiles, 5);
  assert.equal(config.scan.maxFileBytes, defaultConfig().scan.maxFileBytes);
  assert.deepEqual(config.scan.excludeDirs, defaultConfig().scan.excludeDirs);
  assert.equal(config.tests.enabled, false);
  assert.equal(config.tests.network, "denied");
  assert.equal(config.storage.backend, "fs");
});

test("tests.network rejects unknown values", () => {
  const { issues } = validateConfig({ tests: { network: "open" } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "tests.network");
});

test("absolute storage.dir is rejected", () => {
  const { config, issues } = validateConfig({ storage: { dir: "/abs/runs" } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "storage.dir");
  assert.equal(config.storage.dir, defaultConfig().storage.dir);
});

test("empty tests.commandOverride array is rejected", () => {
  const { issues } = validateConfig({ tests: { commandOverride: [] } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "tests.commandOverride");
});

test("schemaVersion 2 is rejected", () => {
  const { issues } = validateConfig({ schemaVersion: 2 });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.path, "schemaVersion");
});

test("loadConfigFromDir picks up .nodeforge/config.json and walks up parents", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  await fs.promises.mkdir(path.join(root, ".nodeforge"), { recursive: true });
  await fs.promises.writeFile(
    path.join(root, ".nodeforge", "config.json"),
    JSON.stringify({ tests: { enabled: false } }),
    "utf8"
  );
  const nested = path.join(root, "a", "b", "c");
  await fs.promises.mkdir(nested, { recursive: true });
  const loaded = await loadConfigFromDir(nested);
  assert.deepEqual(loaded.issues, []);
  assert.equal(loaded.sourceDir, root);
  assert.equal(loaded.config.tests.enabled, false);
  assert.equal(loaded.config.tests.timeoutMs, defaultConfig().tests.timeoutMs);
});

test("loadConfigFromDir returns defaults with null sourceDir when no file exists", async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nf-test-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const loaded = await loadConfigFromDir(dir);
  assert.deepEqual(loaded.config, defaultConfig());
  assert.equal(loaded.sourceDir, null);
  assert.deepEqual(loaded.issues, []);
});
