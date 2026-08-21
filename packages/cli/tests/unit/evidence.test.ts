import { test } from "node:test";
import assert from "node:assert/strict";
import { EvidenceCollector } from "../../src/evidence/evidence.js";
import { sha256Hex } from "../../src/utils/misc.js";

test("collector assigns sequential evidence ids", () => {
  const collector = new EvidenceCollector();
  const first = collector.add({ kind: "stdout", content: "hello" });
  const second = collector.add({ kind: "stderr", content: "world" });
  assert.equal(first.id, "ev-001");
  assert.equal(second.id, "ev-002");
  assert.deepEqual(collector.ids(), ["ev-001", "ev-002"]);
});

test("content hashes are stable sha256 digests", () => {
  const collector = new EvidenceCollector();
  const record = collector.add({ kind: "metadata", content: "stable content" });
  assert.equal(record.contentHash, sha256Hex("stable content"));
  assert.equal(sha256Hex("stable content"), sha256Hex("stable content"));
  assert.notEqual(sha256Hex("stable content"), sha256Hex("stable content "));
});

test("excerptBytes bounds the stored excerpt but not byteLength", () => {
  const collector = new EvidenceCollector();
  const content = "y".repeat(1000);
  const record = collector.add({ kind: "stdout", content, excerptBytes: 50 });
  assert.equal(record.byteLength, 1000);
  assert.equal(record.excerpt?.length, 50);
  assert.ok(content.startsWith(record.excerpt ?? ""));
});

test("addArtifact stores via the sink and registers an artifact record", async () => {
  const collector = new EvidenceCollector();
  const sinkCalls: Array<[string, string]> = [];
  const sink = async (name: string, content: string): Promise<string> => {
    sinkCalls.push([name, content]);
    return name;
  };
  const { evidence, artifact } = await collector.addArtifact(sink, "test-log.txt", "log body");
  assert.deepEqual(sinkCalls, [["test-log.txt", "log body"]]);
  assert.equal(evidence.uri, "artifacts/test-log.txt");
  assert.ok(artifact);
  assert.equal(artifact.name, "test-log.txt");
  assert.equal(artifact.kind, "log");
  assert.ok(artifact.id.startsWith("art-"));
  assert.equal(artifact.contentHash, sha256Hex("log body"));
});

test("redactionApplied is true only when a secret pattern matched", () => {
  const collector = new EvidenceCollector();
  const dirty = collector.add({ kind: "stdout", content: `token ghp_${"x".repeat(30)}` });
  assert.equal(dirty.redactionApplied, true);
  assert.ok(dirty.redactionRules.includes("github-token"));
  assert.ok(dirty.excerpt?.includes("[REDACTED:github-token]"));

  const clean = collector.add({ kind: "stdout", content: "nothing sensitive here" });
  assert.equal(clean.redactionApplied, false);
  assert.deepEqual(clean.redactionRules, []);
});
