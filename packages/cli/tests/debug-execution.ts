import { promises as fs } from "node:fs";
import path from "node:path";
import {
  makeEngine,
  makeTempDir,
  writeShim,
  freshSignal,
  initGitRepo,
} from "./integration/helpers.js";

async function main() {
  const repo = await makeTempDir("debug-pass");
  const shimDir = await makeTempDir("shims-debug");
  await fs.writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({
      name: "shimmed",
      version: "1.0.0",
      scripts: { test: "npm run real-test" },
    }),
    "utf8",
  );
  await initGitRepo(repo);
  await writeShim(
    shimDir,
    "npm",
    'echo "Tests:       3 passed, 3 total"\nexit 0',
  );

  const harness = makeEngine({ repoDir: repo, shimDir });
  try {
    const run = await harness.engine.run({
      mode: "test",
      targetInput: repo,
      cwd: repo,
      config: harness.config,
      dryRun: false,
      signal: freshSignal(),
    });
    console.log("STATUS:", run.status);
    console.log("TEST SUMMARY:", JSON.stringify(run.testSummary, null, 2));
    console.log("STAGES:");
    for (const s of run.stages) {
      console.log(`  ${s.stage}: ${s.status} — ${s.reason}`);
    }
    console.log("CAPABILITIES:", JSON.stringify(run.capabilities, null, 2));
  } finally {
    harness.restorePath?.();
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(shimDir, { recursive: true, force: true });
  }
}

void main();
