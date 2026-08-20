"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquarePlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RouteTarget } from "@/lib/types";

export interface ReviewDecision {
  action: "approve" | "request_changes" | "reject";
  target?: RouteTarget;
  note?: string;
}

export function HumanReviewPanel({
  onDecision,
  disabled,
}: {
  onDecision: (decision: ReviewDecision) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "request">("idle");
  const [target, setTarget] = useState<RouteTarget>("node_3");
  const [note, setNote] = useState("");

  function submit() {
    if (mode === "request") {
      onDecision({ action: "request_changes", target, note });
    }
    setMode("idle");
    setNote("");
  }

  return (
    <div className="rounded-2xl border border-rev/50 bg-rev/10 p-5">
      <p className="text-sm font-semibold text-foreground">
        Blocked for human review
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The quality gate routed this to a person. Approve as-is and finalize, or
        request changes back to a specific node with a note.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button
          type="button"
          onClick={() => onDecision({ action: "approve" })}
          disabled={disabled}
        >
          <CheckCircle2 />
          Approve as-is
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setMode("request")}
          disabled={disabled}
        >
          <MessageSquarePlus />
          Request changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onDecision({ action: "reject" })}
          disabled={disabled}
        >
          <XCircle />
          Reject run
        </Button>
      </div>

      {mode === "request" && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
          <div>
            <label className="text-xs font-medium text-foreground">
              Send changes to
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  ["node_2", "Node 2 · Query Expansion"],
                  ["node_3", "Node 3 · Execution & Verification"],
                  ["node_4", "Node 4 · Output Sanitization"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTarget(value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    target === value
                      ? "border-border bg-muted text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-input"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">
              Note for the node
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. The accepted date format must be YYYY-MM-DD, not ambiguous."
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-input"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="lg" onClick={submit} disabled={!note.trim()}>
              Route feedback to {target === "node_2" ? "Node 2" : target === "node_3" ? "Node 3" : "Node 4"}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}