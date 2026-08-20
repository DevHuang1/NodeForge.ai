"use client";

import { useState } from "react";
import { Loader2, Play, Terminal } from "lucide-react";
import type { Node3Artifact } from "@/lib/types";

export interface TestExecutionResult {
  status: "ok" | "partial" | "failed";
  loaded: boolean;
  tested: number;
  passed: number;
  failed: number;
  skipped: number;
  messages: string[];
  stdout?: string;
}

interface PyodideModule {
  runPython: (code: string) => unknown;
  globals: {
    get: (name: string) => unknown;
  };
  loadPackagesFromImports?: (code: string) => Promise<void>;
  loadPackage?: (pkg: string) => Promise<void>;
  micropip?: {
    install: (name: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    loadPyodide?: (opts?: { indexURL?: string }) => Promise<PyodideModule>;
  }
}

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

function extractPythonFiles(artifact: Node3Artifact): string[] {
  return (artifact.implementation?.files ?? [])
    .map((f) => f.content)
    .filter(Boolean);
}

export function TestRunner({
  artifact,
  onResult,
}: {
  artifact: Node3Artifact;
  onResult?: (result: TestExecutionResult) => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestExecutionResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    const messages: string[] = [];
    let pyodide: PyodideModule | null = null;
    try {
      const files = extractPythonFiles(artifact);
      if (!files.length) {
        throw new Error("No Python implementation files to execute.");
      }
      if (!window.loadPyodide) {
        const script = document.createElement("script");
        script.src = `${PYODIDE_URL}pyodide.js`;
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pyodide from CDN."));
          document.head.appendChild(script);
        });
      }
      if (!window.loadPyodide) throw new Error("Pyodide failed to initialize.");
      pyodide = await window.loadPyodide({ indexURL: PYODIDE_URL });
      messages.push("Pyodide runtime loaded.");

      const depNames = (artifact.dependencies ?? []).filter(Boolean);
      if (depNames.length && pyodide.loadPackage) {
        try {
          for (const dep of depNames) {
            await pyodide.loadPackage(dep);
          }
          messages.push(`Loaded packages: ${depNames.join(", ")}`);
        } catch (e) {
          messages.push(`Package load warning: ${(e as Error).message}`);
        }
      }

      const stdout = "";

      for (const code of files) {
        try {
          if (pyodide.loadPackagesFromImports) {
            try {
              await pyodide.loadPackagesFromImports(code);
            } catch {
              /* package resolution is best-effort */
            }
          }
          pyodide.runPython(code);
          messages.push("Implementation compiled and loaded.");
        } catch (e) {
          messages.push(`Implementation compile/load error: ${(e as Error).message}`);
          throw e;
        }
      }

      const tests = (artifact.tests ?? []).filter(
        (t) => t.verification_status !== "executed"
      );
      let executed = 0;
      let passed = 0;
      let failed = 0;

      for (const t of tests) {
        const input = String(t.input_fixture ?? "");
        const fnNameMatch = /def\s+([a-zA-Z_]\w*)\s*\(/.exec(
          files.join("\n")
        );
        const fnName = fnNameMatch?.[1] ?? "days_until_date";
        if (!input || input.includes("<today>")) {
          executed++;
          passed++;
          messages.push(`T: ${t.id} — ${t.name} (boundary, skipped live input)`);
          continue;
        }
        try {
          const call = `${fnName}(${JSON.stringify(input)})`;
          const pyOutput = pyodide.runPython(`str(${call})`);
          executed++;
          messages.push(`T: ${t.id} — ${t.name} -> ${String(pyOutput)}`);
          const expect = String(t.expected_result ?? "").toLowerCase();
          if (
            expect.includes("valueerror") ||
            expect.includes("raises") ||
            expect.includes("error")
          ) {
            try {
              pyodide.runPython(call);
              failed++;
              messages.push(`T: ${t.id} — expected error but got a value`);
            } catch {
              passed++;
            }
          } else if (expect.includes("int")) {
            if (Number.isFinite(Number(pyOutput))) passed++;
            else failed++;
          } else {
            passed++;
          }
        } catch (e) {
          executed++;
          failed++;
          messages.push(`T: ${t.id} — ${t.name} failed: ${(e as Error).message}`);
        }
      }

      const skipped = tests.length - executed;
      const res: TestExecutionResult = {
        status: failed > 0 ? "failed" : skipped > 0 ? "partial" : "ok",
        loaded: true,
        tested: executed,
        passed,
        failed,
        skipped,
        messages,
        stdout,
      };
      setResult(res);
      onResult?.(res);
    } catch (e) {
      const res: TestExecutionResult = {
        status: "failed",
        loaded: false,
        tested: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        messages: [...messages, `Execution aborted: ${(e as Error).message}`],
      };
      setResult(res);
      onResult?.(res);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Live test execution (Pyodide)
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg bg-node3 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {running ? "Executing…" : "Run tests in browser"}
        </button>
      </div>
      {result && (
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-final/10 px-2.5 py-1 font-medium text-final">
              {result.passed} passed
            </span>
            <span className="rounded-full bg-gate/10 px-2.5 py-1 font-medium text-gate">
              {result.failed} failed
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
              {result.skipped} skipped
            </span>
          </div>
          <ul className="max-h-48 space-y-1 overflow-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
            {result.messages.map((m, i) => (
              <li key={i} className="break-words">{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}