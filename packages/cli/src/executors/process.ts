/**
 * Guarded child-process execution.
 *
 * Contract:
 * - argv only, never a shell (shell: false is explicit).
 * - Hard timeout kills the entire process group (POSIX) or the child (Windows).
 * - AbortSignal cancellation kills the child and reports `cancelled`.
 * - Output is captured up to policy.maxOutputBytes per stream, then truncated
 *   with an explicit flag.
 */

import { spawn } from "child_process";
import type { ExecutionPolicy } from "../core/policy.js";

export interface ProcessSpec {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  /** Non-empty when the process could not be spawned at all (e.g. ENOENT). */
  spawnError: string;
}

export function runProcess(
  spec: ProcessSpec,
  policy: ExecutionPolicy,
  signal?: AbortSignal
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = "";
    let err = "";
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const maxBytes = policy.maxOutputBytes;
    const append = (sink: "out" | "err", chunk: Buffer | string): void => {
      const text = String(chunk);
      const target = sink === "out" ? out : err;
      if (Buffer.byteLength(target, "utf8") >= maxBytes) {
        if (sink === "out") truncated = true;
        else truncated = true;
        return;
      }
      const remaining = maxBytes - Buffer.byteLength(target, "utf8");
      const bounded = Buffer.from(text, "utf8").subarray(0, remaining).toString("utf8");
      if (bounded.length < text.length) truncated = true;
      if (sink === "out") out += bounded;
      else err += bounded;
    };

    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killTree = (): void => {
      try {
        if (process.platform !== "win32") {
          process.kill(-child.pid!, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        child.kill("SIGKILL");
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, Math.max(1, spec.timeoutMs));

    const onAbort = (): void => {
      cancelled = true;
      killTree();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout!.on("data", (chunk: Buffer | string) => append("out", chunk));
    child.stderr!.on("data", (chunk: Buffer | string) => append("err", chunk));

    const settle = (result: Omit<ProcessResult, "durationMs" | "timedOut" | "cancelled" | "truncated">): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({
        ...result,
        timedOut,
        cancelled,
        truncated,
        durationMs: Date.now() - started,
      });
    };

    child.on("error", (error: Error) => {
      settle({
        exitCode: null,
        signal: null,
        stdout: out,
        stderr: err,
        spawnError: error.message,
      });
    });

    child.on("close", (code, terminatingSignal) => {
      settle({
        exitCode: code,
        signal: terminatingSignal ?? null,
        stdout: out,
        stderr: err,
        spawnError: "",
      });
    });
  });
}
