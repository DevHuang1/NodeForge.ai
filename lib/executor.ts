import type {
  Node3Artifact,
  RepositoryContext,
  TestExecutionItem,
  TestExecutionSummary,
  VerificationStatus,
} from "./types";

export type ExecutorBackend = "offline" | "sandbox";

export const EXECUTOR_BACKEND: ExecutorBackend =
  (process.env.NODEFORGE_EXECUTOR as ExecutorBackend) ?? "offline";

export const EXECUTION_POLICY = {
  timeoutMs: Number(process.env.NODEFORGE_EXEC_TIMEOUT_MS ?? 30_000),
  memoryMb: Number(process.env.NODEFORGE_EXEC_MEM_MB ?? 512),
  cpuCount: Number(process.env.NODEFORGE_EXEC_CPU ?? 1),
  filesystem: "isolated-temp-dir",
  network: "denied",
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
    "Configure NODEFORGE_EXECUTOR=sandbox with a real sandbox to enable execution.",
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
        ? `Execution blocked: sandbox backend not configured (policy: ${EXECUTION_POLICY.timeoutMs}ms timeout, ${EXECUTION_POLICY.memoryMb}MB memory, network denied).`
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
        `NODEFORGE_EXECUTOR=sandbox requested but no sandbox backend is configured.`,
        cmd ? `Configured test command: ${cmd}` : "No safe test command detected for this repository.",
      ],
      sandbox: "unavailable",
    },
    blocked: true,
    blockedReason: safety.safe
      ? "Sandbox backend not configured; refusing to execute in the application process."
      : safety.reason,
  };
}

export function runExecutor(request: ExecutorRequest): ExecutorResponse {
  const cmd = resolveTestCommand(request.context);
  if (!cmd) {
    return sandboxUnavailableRun(request);
  }
  if (EXECUTOR_BACKEND === "sandbox") {
    return sandboxUnavailableRun(request);
  }
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