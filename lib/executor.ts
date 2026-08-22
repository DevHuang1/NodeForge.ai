import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import type {
  Node3Artifact,
  PullRequestFile,
  RepositoryContext,
  TestExecutionItem,
  TestExecutionSummary,
  VerificationStatus,
} from "./types";

export type ExecutorBackend = "offline" | "local" | "sandbox";

export const EXECUTOR_BACKEND: ExecutorBackend =
  (process.env.NODEFORGE_EXECUTOR as ExecutorBackend) ?? "offline";

export const EXECUTION_POLICY = {
  timeoutMs: Number(process.env.NODEFORGE_EXEC_TIMEOUT_MS ?? 30_000),
  memoryMb: Number(process.env.NODEFORGE_EXEC_MEM_MB ?? 512),
  cpuCount: Number(process.env.NODEFORGE_EXEC_CPU ?? 1),
  filesystem: "isolated-temp-dir",
  network: "denied-by-default",
  allowList: ["pytest", "go test", "npm test"],
};

export interface CommandSafety {
  safe: boolean;
  reason?: string;
}

const FORBIDDEN_TOKENS = [
  /rm\s+-rf/i,
  />\s*\/dev\/sda/i,
  /mkfs/i,
  /chmod\s+777/i,
  /curl\s+[^|]+\|\s*(sh|bash)/i,
  /wget\s+[^|]+\|\s*(sh|bash)/i,
  /sudo/i,
  /:(){/i,
  /dd\s+if=.*of=\/dev/i,
  /\bgit\s+push\b/i,
  /\bbitcoin|monero|wallet/i,
];

export function checkCommandSafety(command: string): CommandSafety {
  if (!command.trim()) return { safe: false, reason: "Empty test command." };
  for (const re of FORBIDDEN_TOKENS) {
    if (re.test(command)) {
      return { safe: false, reason: `Command blocked: matched "${re.source}".` };
    }
  }
  const cmd = command.trim();
  const leading = cmd.split(/\s+/)[0];
  if (!EXECUTION_POLICY.allowList.some((ok) => cmd === ok || cmd.startsWith(`${ok} `))) {
    return {
      safe: false,
      reason: `Command "${leading}" is not on the allow-list (${EXECUTION_POLICY.allowList.join(", ")}).`,
    };
  }
  return { safe: true };
}

export function resolveTestCommand(context: RepositoryContext | null): string {
  if (!context?.testCommand) return "";
  const safe = checkCommandSafety(context.testCommand);
  return safe.safe ? context.testCommand : "";
}

export interface ExecutorRequest {
  artifact: Node3Artifact;
  context: RepositoryContext | null;
  files?: PullRequestFile[];
}

export interface ExecutorResponse {
  summary: TestExecutionSummary;
  blocked: boolean;
  blockedReason?: string;
}

function offlineItem(
  t: Node3Artifact["tests"][number],
  status: VerificationStatus,
  note: string
): TestExecutionItem {
  return {
    id: t.id,
    name: t.name,
    maps_to: t.maps_to,
    verification_status: status,
    exit_code: null,
    duration_ms: 0,
    stdout: "",
    stderr: note,
    failure_reason: status === "not_executed" ? note : "",
    observed_result: t.observed_result ?? "not_available",
  };
}

export function offlineRun(request: ExecutorRequest): ExecutorResponse {
  const tests = request.artifact.tests ?? [];
  const notes: string[] = [
    "Offline executor: no sandbox configured. Tests were NOT executed.",
    "Test statuses reflect the model's honest self-report (proposed/static_check), never 'executed'.",
    "Configure NODEFORGE_EXECUTOR=local or NODEFORGE_EXECUTOR=sandbox with a real backend to enable execution.",
  ];
  const items: TestExecutionItem[] = tests.map((t) =>
    offlineItem(t, t.verification_status === "executed" ? "not_executed" : t.verification_status, "not executed (offline executor)")
  );
  const executed = items.filter((i) => i.verification_status === "executed").length;
  const passed = items.filter(
    (i) => i.verification_status === "executed" && !i.failure_reason
  ).length;
  const failed = items.filter((i) => i.failure_reason && i.verification_status === "executed").length;
  const blocked = items.filter((i) => i.verification_status === "blocked").length;
  const not_executed = items.filter(
    (i) => i.verification_status === "not_executed" || i.verification_status === "proposed"
  ).length;

  return {
    summary: {
      status: "offline_sample",
      tested: executed,
      passed,
      failed,
      blocked,
      not_executed,
      duration_ms: 0,
      items,
      notes,
      sandbox: "offline-sample-fixture",
    },
    blocked: false,
  };
}

export function sandboxUnavailableRun(request: ExecutorRequest): ExecutorResponse {
  const tests = request.artifact.tests ?? [];
  const cmd = request.context?.testCommand;
  const safety = cmd ? checkCommandSafety(cmd) : { safe: false, reason: "no test command" };
  const items = tests.map((t) =>
    offlineItem(
      t,
      "blocked",
      safety.safe
        ? `Execution blocked: no sandbox backend configured (policy: ${EXECUTION_POLICY.timeoutMs}ms timeout, network denied).`
        : `Execution blocked: ${safety.reason}`
    )
  );
  return {
    summary: {
      status: "blocked",
      tested: 0,
      passed: 0,
      failed: 0,
      blocked: items.length,
      not_executed: 0,
      duration_ms: 0,
      items,
      notes: [
        `NODEFORGE_EXECUTOR=${EXECUTOR_BACKEND} requested but no runnable backend is configured for this request.`,
        cmd ? `Configured test command: ${cmd}` : "No safe test command detected for this repository.",
      ],
      sandbox: "unavailable",
    },
    blocked: true,
    blockedReason: safety.safe
      ? "No runnable execution backend configured; refusing to execute in the application process."
      : safety.reason,
  };
}

// ── Local guarded backend ─────────────────────────────────────────────────

export function snakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface PytestParse {
  collected: number;
  passed: number;
  failed: number;
  errors: number;
  passedNames: string[];
  failedNames: string[];
}

export function parsePytestOutput(output: string): PytestParse {
  const lines = output.split("\n");
  const passedNames: string[] = [];
  const failedNames: string[] = [];
  for (const line of lines) {
    const verbose = line.match(/::([A-Za-z0-9_]+)\s+(PASSED|FAILED|ERROR|XPASS|XFAIL)/);
    if (verbose) {
      if (verbose[2] === "PASSED" || verbose[2] === "XPASS") passedNames.push(verbose[1]);
      else failedNames.push(verbose[1]);
      continue;
    }
    const short = line.match(/FAILED [^\s:]+::([A-Za-z0-9_]+)\s*-/);
    if (short) {
      failedNames.push(short[1]);
    }
  }
  const passed = output.match(/(\d+) passed/);
  const failed = output.match(/(\d+) failed/);
  const errors = output.match(/(\d+) error/);
  const collectedMatch = output.match(/collected (\d+) items?/);
  return {
    collected: collectedMatch
      ? Number(collectedMatch[1])
      : (passed ? Number(passed[1]) : 0) + (failed ? Number(failed[1]) : 0) + (errors ? Number(errors[1]) : 0) || passedNames.length + failedNames.length,
    passed: passed ? Number(passed[1]) : passedNames.length,
    failed: failed ? Number(failed[1]) : failedNames.length,
    errors: errors ? Number(errors[1]) : 0,
    passedNames,
    failedNames,
  };
}

function commandToArgv(command: string): string[] {
  const parts = command.trim().split(/\s+/);
  if (parts[0] === "pytest") {
    const flags = parts.slice(1).filter((a) => a !== "-q" && a !== "--quiet");
    return ["python3", "-m", "pytest", "-v", ...flags];
  }
  return parts;
}

async function materialize(
  files: PullRequestFile[],
  implFiles: Node3Artifact["implementation"]["files"]
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodeforge-exec-"));
  const writeAll = async (list: Array<{ path: string; content: string }>) => {
    for (const f of list) {
      if (!f.path || f.content == null) continue;
      const p = safeJoin(dir, f.path);
      if (!p) continue;
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, f.content, "utf8");
    }
  };
  await writeAll(
    files.filter((f) => f.status !== "removed" && !f.binary && f.content).map((f) => ({ path: f.path, content: f.content }))
  );
  await writeAll(implFiles);
  return dir;
}

/**
 * Resolve `relPath` inside `dir`, rejecting anything that escapes it
 * (absolute paths, `..` segments, symlink-free containment check happens at
 * the join level — model- or repo-supplied paths are untrusted input).
 * Returns null when the path would land outside `dir`.
 */
export function safeJoin(dir: string, relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string;
  durationMs: number;
}

function runCommand(
  argv: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number
): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = "";
    let err = "";
    let spawned = false;
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: env as NodeJS.ProcessEnv,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
    child.stdout.on("data", (d) => {
      if (out.length < 200_000) out += String(d);
    });
    child.stderr.on("data", (d) => {
      if (err.length < 200_000) err += String(d);
    });
    child.on("error", (e) => {
      spawned = true;
      resolve({
        code: null,
        stdout: out,
        stderr: err + e.message,
        timedOut: false,
        spawnError: e.message,
        durationMs: Date.now() - started,
      });
    });
    child.on("close", (code, signal) => {
      if (spawned) return;
      resolve({
        code,
        stdout: out,
        stderr: err,
        timedOut: signal === "SIGKILL" || signal === "SIGTERM",
        spawnError: "",
        durationMs: Date.now() - started,
      });
    });
  });
}

function itemStatus(t: Node3Artifact["tests"][number], parsed: PytestParse): {
  status: VerificationStatus;
  failure: string;
  observed: string;
} {
  const snake = snakeCase(t.name);
  const words = snake.split("_").filter((w) => w.length > 2);
  const score = (names: string[]) => {
    let best = 0;
    for (const n of names) {
      const nw = n.split("_").filter((w) => w.length > 2);
      const shared = nw.filter((w) => words.includes(w)).length;
      const contained = n.includes(snake) || snake.includes(n) ? 100 : 0;
      best = Math.max(best, shared + contained);
    }
    return best;
  };
  const failedScore = score(parsed.failedNames);
  const passedScore = score(parsed.passedNames);
  if (failedScore > passedScore) {
    return { status: "executed", failure: "Test failed in sandbox.", observed: "failed" };
  }
  if (passedScore > 0) {
    return { status: "executed", failure: "", observed: "passed" };
  }
  return { status: "executed", failure: "", observed: "executed (aggregate)" };
}

export async function localRun(request: ExecutorRequest): Promise<ExecutorResponse> {
  const cmd = resolveTestCommand(request.context);
  if (!cmd) return sandboxUnavailableRun(request);
  const files = request.files ?? [];
  const implFiles = request.artifact.implementation?.files ?? [];
  if (!implFiles.length && !files.length) {
    return sandboxUnavailableRun(request);
  }

  const tests = request.artifact.tests ?? [];
  let dir: string | null = null;
  try {
    dir = await materialize(files, implFiles);
  } catch (err) {
    return {
      summary: {
        status: "blocked",
        tested: 0,
        passed: 0,
        failed: 0,
        blocked: tests.length || 1,
        not_executed: 0,
        duration_ms: 0,
        items: tests.map((t) => offlineItem(t, "blocked", "Could not materialize the sandbox files.")),
        notes: [`Could not materialize the sandbox directory: ${(err as Error).message}`],
        sandbox: "local-guarded-tempdir",
      },
      blocked: true,
      blockedReason: "Sandbox materialization failed.",
    };
  }

  try {
    const argv = commandToArgv(cmd);
    const env = { PATH: process.env.PATH ?? "", LANG: "C.UTF-8" };
    const res = await runCommand(argv, dir, env, EXECUTION_POLICY.timeoutMs);
    const output = `${res.stdout}\n${res.stderr}`;
    const toolchainMissing = /No module named\s+'?[A-Za-z_]+'?|ModuleNotFoundError|not (recognized|found)|command not found|ENOENT/i.test(
      output + res.spawnError
    );
    const parsed = parsePytestOutput(output);
    const runBlocked = Boolean(res.spawnError || toolchainMissing);

    const items: TestExecutionItem[] = tests.map((t) => {
      const mapped = itemStatus(t, parsed);
      return {
        id: t.id,
        name: t.name,
        maps_to: t.maps_to,
        verification_status: runBlocked ? "blocked" : mapped.status,
        exit_code: res.code,
        duration_ms: 0,
        stdout: runBlocked ? "" : res.stdout.slice(0, 4000),
        stderr: runBlocked ? "tests were not executed (toolchain unavailable)" : res.stderr.slice(0, 4000),
        failure_reason: runBlocked
          ? "tests were not executed (toolchain unavailable)"
          : mapped.failure,
        observed_result: runBlocked ? "not_available" : mapped.observed,
      };
    });

    const status: TestExecutionSummary["status"] = runBlocked
      ? "blocked"
      : res.timedOut
        ? "failed"
        : parsed.failed + parsed.errors > 0
          ? "failed"
          : res.code === 0 && parsed.collected > 0
            ? "ok"
            : "partial";

    const failedCount = runBlocked
      ? 0
      : res.timedOut
        ? items.length
        : parsed.failed + parsed.errors;
    const notes = [
      `Executed \`${argv.join(" ")}\` in an isolated temp dir with a ${EXECUTION_POLICY.timeoutMs}ms timeout.`,
      runBlocked
        ? `Toolchain unavailable in this environment (${res.spawnError || "pytest/python3 not found"}); tests were NOT executed.`
        : `pytest result: ${parsed.passed} passed, ${parsed.failed} failed, ${parsed.errors} errors (${parsed.collected} collected).`,
      res.timedOut ? `Command timed out after ${EXECUTION_POLICY.timeoutMs}ms and was killed.` : "",
      "Network is denied by policy (not enforced at the OS level in this backend).",
    ].filter(Boolean);

    return {
      summary: {
        status,
        tested: parsed.collected,
        passed: res.spawnError ? 0 : parsed.passed,
        failed: failedCount,
        blocked: runBlocked ? items.length : 0,
        not_executed: 0,
        duration_ms: res.durationMs,
        items,
        notes,
        sandbox: "local-guarded-tempdir",
      },
      blocked: runBlocked,
      blockedReason: runBlocked
        ? "The test toolchain is not available in this environment; tests were not executed."
        : undefined,
    };
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runExecutor(request: ExecutorRequest): Promise<ExecutorResponse> {
  const cmd = resolveTestCommand(request.context);
  if (!cmd) return sandboxUnavailableRun(request);
  if (EXECUTOR_BACKEND === "local") return localRun(request);
  if (EXECUTOR_BACKEND === "sandbox") return sandboxUnavailableRun(request);
  return offlineRun(request);
}

export function summarizeExecutor(response: ExecutorResponse): string {
  const s = response.summary;
  const rows = s.items.map(
    (i) => `- ${i.id} (${i.name}): ${i.verification_status}${i.failure_reason ? ` — ${i.failure_reason}` : ""}`
  );
  return [
    `## Test execution (${s.sandbox})`,
    "",
    `Status: ${s.status} · tested ${s.tested} · passed ${s.passed} · failed ${s.failed} · blocked ${s.blocked} · not executed ${s.not_executed}`,
    "",
    ...rows,
    "",
  ].join("\n");
}