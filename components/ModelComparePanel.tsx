"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PipelineArtifacts, UsageInfo } from "@/lib/types";

function nodeSummary(artifacts: PipelineArtifacts, key: "node2" | "node3" | "node4") {
  const a = artifacts[key] as Record<string, unknown> | undefined;
  if (!a) return "—";
  if (key === "node2") return String(a.status ?? "—");
  if (key === "node3") return String(a.status ?? "—");
  return String((a as { quality_gate?: string }).quality_gate ?? "—");
}

function gateVerdict(artifacts: PipelineArtifacts) {
  const n4 = artifacts.node4;
  if (!n4) return "—";
  return n4.quality_gate;
}

export function ModelComparePanel({
  primary,
  secondary,
  primaryUsage,
  secondaryUsage,
}: {
  primary: PipelineArtifacts;
  secondary: PipelineArtifacts;
  primaryUsage: Record<string, UsageInfo | undefined>;
  secondaryUsage: Record<string, UsageInfo | undefined>;
}) {
  const [open, setOpen] = useState(true);

  const rows = [
    ["Node 2 status", "node2"],
    ["Node 3 status", "node3"],
    ["Gate verdict", "node4"],
  ] as const;

  return (
    <div className="mt-8 rounded-2xl border border-node3/40 bg-node3/5 p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-node3">
          Model comparison
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-node3" /> : <ChevronRight className="h-4 w-4 text-node3" />}
      </button>
      {open && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Metric</th>
                <th className="px-4 py-2.5 font-medium">Primary run</th>
                <th className="px-4 py-2.5 font-medium">Comparison run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key]) => (
                <tr key={key} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{label}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {nodeSummary(primary, key)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {nodeSummary(secondary, key)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 text-foreground">Findings</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {primary.node4?.findings.length ?? 0}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {secondary.node4?.findings.length ?? 0}
                </td>
              </tr>
              <tr className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 text-foreground">Gate</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {gateVerdict(primary)}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {gateVerdict(secondary)}
                </td>
              </tr>
              <tr className="last:border-0">
                <td className="px-4 py-2.5 text-foreground">Tokens (in/out)</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {sumTokens(primaryUsage)}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {sumTokens(secondaryUsage)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sumTokens(usage: Record<string, UsageInfo | undefined>): string {
  let inTok = 0;
  let outTok = 0;
  for (const u of Object.values(usage)) {
    if (u) {
      inTok += u.input_tokens;
      outTok += u.output_tokens;
    }
  }
  return `${inTok} / ${outTok}`;
}