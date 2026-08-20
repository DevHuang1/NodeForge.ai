"use client";

import { useEffect, useState } from "react";
import { suggestScores } from "@/lib/client";
import type { PipelineArtifacts } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const SCORE_DIMENSIONS = [
  "Requirement clarity",
  "Verification",
  "Security",
  "Traceability",
] as const;

export interface CaseScores {
  baseline: (0 | 1 | 2)[];
  pipeline: (0 | 1 | 2)[];
}

function blank(): CaseScores {
  return {
    baseline: [0, 0, 0, 0],
    pipeline: [0, 0, 0, 0],
  };
}

const STORAGE_KEY = "nodeforge-scores-v1";

export function Scorecard({
  caseId,
  artifacts,
  onScoresChange,
}: {
  caseId: string;
  artifacts: PipelineArtifacts;
  onScoresChange?: (scores: { baseline: number[]; pipeline: number[] }) => void;
}) {
  const [scores, setScores] = useState<Record<string, CaseScores>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) setScores(JSON.parse(raw) as Record<string, CaseScores>);
      } catch {
        /* ignore corrupt storage */
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    } catch {
      /* ignore quota errors */
    }
  }, [hydrated, scores]);

  const current = scores[caseId] ?? blank();

  useEffect(() => {
    onScoresChange?.({
      baseline: current.baseline,
      pipeline: current.pipeline,
    });
  }, [current.baseline.join(","), current.pipeline.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function setDim(workflow: "baseline" | "pipeline", dim: number, value: 0 | 1 | 2) {
    setScores((prev) => {
      const entry = { ...(prev[caseId] ?? blank()) };
      entry[workflow][dim] = value;
      return { ...prev, [caseId]: entry };
    });
  }

  function applySuggestions() {
    const rows = suggestScores(artifacts);
    setScores((prev) => {
      const entry = { ...(prev[caseId] ?? blank()) };
      rows.forEach((row, i) => {
        entry.baseline[i] = row.baseline;
        entry.pipeline[i] = row.pipeline;
      });
      return { ...prev, [caseId]: entry };
    });
  }

  function reset() {
    setScores((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
  }

  const total = (row: number[]) => row.reduce((a, b) => a + b, 0);

  return (
    <Card className="[--card-spacing:--spacing(8)]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Evaluation scorecard</CardTitle>
            <CardDescription className="mt-1">
              Score each workflow 0–2 per dimension: 0 = missing or unsafe · 1 =
              partial · 2 = explicit and satisfactory. Use the suggest button as
              a starting point filled from the current run&apos;s artifacts.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={applySuggestions}>
              Suggest from artifacts
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pr-6 font-medium">Dimension</th>
                <th className="py-3 pr-6 font-medium">
                  A — Single prompt
                </th>
                <th className="py-3 font-medium">B — Four-node pipeline</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_DIMENSIONS.map((label, i) => (
                <tr key={label} className="border-b border-border/60">
                  <td className="py-4 pr-6 text-foreground">{label}</td>
                  {(["baseline", "pipeline"] as const).map((wf) => (
                    <td key={wf} className="py-4">
                      <div className="flex gap-2">
                        {([0, 1, 2] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setDim(wf, i, v)}
                            aria-label={`${label} ${wf} score ${v}`}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                              current[wf][i] === v
                                ? wf === "pipeline"
                                  ? "border-transparent bg-node2 text-white"
                                  : "border-transparent bg-foreground text-background"
                                : "border-border bg-background text-muted-foreground hover:border-input"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-4 pr-6 font-medium text-foreground">Total / 8</td>
                <td className="py-4 pr-6 font-medium text-muted-foreground">
                  {total(current.baseline)} / 8
                </td>
                <td className="py-4 font-medium text-node2">
                  {total(current.pipeline)} / 8
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          The score summarizes observed evidence from this run; it is not a
          claim of universal superiority.
        </p>
      </CardContent>
    </Card>
  );
}