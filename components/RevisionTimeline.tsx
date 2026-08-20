"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { RevisionFeedback } from "@/lib/types";

const ROUTE_COLORS: Record<string, string> = {
  node_2: "#2f5bd0",
  node_3: "#6b3fc4",
  node_4: "#b0760a",
  human_review: "#6b7280",
};

const ROUTE_LABELS: Record<string, string> = {
  node_2: "Node 2 · Query Expansion",
  node_3: "Node 3 · Execution & Verification",
  node_4: "Node 4 · Output Sanitization",
  human_review: "Human review",
};

export function RevisionTimeline({ revisions }: { revisions: RevisionFeedback[] }) {
  const [open, setOpen] = useState(true);
  if (!revisions.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-rev/40 bg-rev/5 p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-rev">
          <RotateCcw className="h-3.5 w-3.5" />
          Revision timeline
          <span className="rounded-full bg-rev/10 px-2 py-0.5 font-mono text-[10px] text-rev">
            {revisions.length}
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-rev" /> : <ChevronRight className="h-4 w-4 text-rev" />}
      </button>
      {open && (
        <ol className="mt-4 space-y-3 border-l border-rev/30 pl-5">
          {revisions.map((r, i) => (
            <li key={`${r.finding_id}-${i}`} className="relative">
              <span
                className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background"
                style={{ background: ROUTE_COLORS[r.target] ?? "#6b7280" }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">{r.finding_id}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ background: ROUTE_COLORS[r.target] ?? "#6b7280" }}
                >
                  {ROUTE_LABELS[r.target]}
                </span>
                <span className="text-[10px] text-muted-foreground">{r.severity}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/70">
                  {new Date(r.applied_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
              {r.correction && (
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  <span className="font-medium text-foreground">Correction:</span> {r.correction}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}