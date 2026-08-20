"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { JsonView } from "./JsonView";
import { DiffView } from "./DiffView";
import { TestRunner } from "./TestRunner";
import { validateArtifact, type ValidationIssue } from "@/lib/validation";
import type { Node3Artifact, UsageInfo } from "@/lib/types";

interface NodeDef {
  n: 1 | 2 | 3 | 4;
  name: string;
  color: string;
  artifact: string;
  role: string;
}

export type NodeState = "pending" | "running" | "done" | "error";

function UsageLine({ usage }: { usage?: UsageInfo }) {
  if (!usage) return null;
  return (
    <p className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
      <span className="truncate">{usage.model}</span>
      <span className="ml-2 shrink-0 font-mono">
        {usage.input_tokens}→{usage.output_tokens} tok
      </span>
    </p>
  );
}

function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-gate/40 bg-gate/5 px-3 py-2">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gate">
        <ShieldAlert className="h-3 w-3" />
        Schema validation — {issues.length} issue{issues.length > 1 ? "s" : ""}
      </p>
      <ul className="mt-1.5 space-y-1">
        {issues.slice(0, 4).map((v) => (
          <li key={v.path} className="text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-mono text-foreground">{v.path}</span>: {v.message}
          </li>
        ))}
        {issues.length > 4 && (
          <li className="text-[10px] text-muted-foreground">…and {issues.length - 4} more</li>
        )}
      </ul>
    </div>
  );
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "bg-gate text-white";
  if (
    s.includes("blocked") ||
    s.includes("revision") ||
    s.includes("limitation")
  )
    return "bg-node4 text-white";
  if (
    s.includes("ready") ||
    s.includes("pass") ||
    s.includes("captured") ||
    s.includes("complete")
  )
    return "bg-node1 text-white";
  return "bg-rev text-white";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`mt-6 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide ${statusTone(status)}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/50 px-2 py-3 text-center">
      <span className="text-xl font-semibold leading-none text-foreground">
        {value}
      </span>
      <span className="mt-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Summary({ node, artifact }: { node: NodeDef; artifact: unknown }) {
  const a = artifact as Record<string, unknown> | null;
  if (!a) return null;

  let status = "";
  const stats: Array<[string, string]> = [];

  if (node.n === 1) {
    status = String(a.status ?? "captured");
    const raw = String(a.raw_request ?? "");
    return (
      <>
        <StatusBadge status={status} />
        <p className="mt-5 rounded-xl border border-border bg-muted/50 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
          {raw.length > 96 ? `${raw.slice(0, 96)}…` : raw}
        </p>
      </>
    );
  }
  if (node.n === 2) {
    status = String(a.status ?? "");
    stats.push(["criteria", String(((a.acceptance_criteria as unknown[]) ?? []).length)]);
    stats.push(["edge cases", String(((a.edge_cases as unknown[]) ?? []).length)]);
    stats.push(["threat items", String(((a.threat_model as unknown[]) ?? []).length)]);
  }
  if (node.n === 3) {
    status = String(a.status ?? "");
    const files = ((a.implementation as Record<string, unknown> | undefined)
      ?.files as unknown[]) ?? [];
    stats.push(["files", String(files.length)]);
    stats.push(["tests", String(((a.tests as unknown[]) ?? []).length)]);
    stats.push(["criteria mapped", String(((a.criterion_mapping as unknown[]) ?? []).length)]);
  }
  if (node.n === 4) {
    status = String(a.quality_gate ?? "");
    stats.push(["findings", String(((a.findings as unknown[]) ?? []).length)]);
    stats.push(["trace rows", String(((a.traceability as unknown[]) ?? []).length)]);
    stats.push(["redactions", String(((a.redactions as unknown[]) ?? []).length)]);
  }

  return (
    <>
      <StatusBadge status={status} />
      <div className="mt-5 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>
    </>
  );
}

export function NodeCard({
  node,
  state,
  artifact,
  previous,
  usage,
  canRun,
  disabled,
  onRun,
  revisionCount,
}: {
  node: NodeDef;
  state: NodeState;
  artifact: unknown;
  previous?: unknown;
  usage?: UsageInfo;
  canRun: boolean;
  disabled: boolean;
  onRun: () => void;
  revisionCount: number;
}) {
  const [open, setOpen] = useState(false);
  const running = state === "running";
  const done = state === "done";
  const issues = done && artifact ? validateArtifact(node.n, artifact) : [];

  return (
    <Card
      className={`flex flex-col [--card-spacing:--spacing(10)] ${
        running ? "ring-2" : ""
      }`}
      style={
        running
          ? ({ boxShadow: `0 0 0 1px ${node.color}44, 0 12px 40px -18px ${node.color}66` } as React.CSSProperties)
          : undefined
      }
    >
      <CardContent className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-base font-semibold text-white"
              style={{ background: node.color }}
            >
              {node.n}
            </span>
            <span className="text-[15px] font-medium leading-snug text-foreground">
              {node.name}
            </span>
          </div>
          {running && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: node.color }} />
              running
            </span>
          )}
          {done && revisionCount > 0 && (
            <span className="rounded-full bg-node4/10 px-2 py-0.5 text-[10px] font-semibold text-node4">
              {revisionCount} revision{revisionCount > 1 ? "s" : ""}
            </span>
          )}
          {state === "error" && (
            <span className="text-[11px] font-medium text-gate">failed</span>
          )}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {node.role}
        </p>

        <span
          className="mt-8 w-fit rounded-md px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide"
          style={{ background: `${node.color}14`, color: node.color }}
        >
          {node.artifact}
        </span>

        {done && Boolean(artifact) && (
          <>
            <UsageLine usage={usage} />
            <Summary node={node} artifact={artifact} />
            <ValidationSummary issues={issues} />
            {previous && (
              <div className="mt-4">
                <DiffView before={previous} after={artifact} />
              </div>
            )}
            {node.n === 3 && (artifact as Node3Artifact)?.tests?.length > 0 && (
              <div className="mt-4">
                <TestRunner artifact={artifact as Node3Artifact} />
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {open ? "Hide artifact JSON" : "View artifact JSON"}
            </button>
            {open && (
              <div className="mt-4">
                <JsonView data={artifact} />
              </div>
            )}
          </>
        )}

        <div className="mt-auto pt-8">
          <Button
            type="button"
            onClick={onRun}
            disabled={!canRun || running || disabled}
            size="lg"
            className="w-full"
            style={canRun && !running && !disabled ? { background: node.color } : undefined}
          >
            {running
              ? "Running…"
              : done
                ? "Re-run node"
                : `Run node ${node.n}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}