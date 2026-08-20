"use client";

import { useState } from "react";
import type { Node4Artifact, RouteTarget } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { JsonView } from "./JsonView";

const GATE_STYLES: Record<string, { color: string; label: string; icon: "pass" | "rev" }> = {
  pass: { color: "#0e7f86", label: "Pass", icon: "pass" },
  pass_with_limitations: { color: "#b0760a", label: "Pass with limitations", icon: "rev" },
  needs_revision: { color: "#c43d3d", label: "Needs revision", icon: "rev" },
  blocked_for_human_review: { color: "#6b7280", label: "Blocked for human review", icon: "rev" },
};

const ROUTE_LABELS: Record<RouteTarget, string> = {
  node_2: "Node 2 · Query Expansion",
  node_3: "Node 3 · Execution & Verification",
  node_4: "Node 4 · Output Sanitization",
  human_review: "Human review",
};

const SEV_COLORS: Record<string, string> = {
  low: "#0e7f86",
  medium: "#b0760a",
  high: "#c2410c",
  critical: "#c43d3d",
};

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEV_COLORS[severity] ?? SEV_COLORS.medium;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${color}1a`, color }}
    >
      {severity}
    </span>
  );
}

export function QualityGate({
  artifact,
  onRoute,
  rerunning,
  totalRevisions,
}: {
  artifact: Node4Artifact | undefined;
  onRoute: (target: RouteTarget) => void;
  rerunning: boolean;
  totalRevisions: number;
}) {
  const [open, setOpen] = useState(false);
  if (!artifact) return null;
  const gate = GATE_STYLES[artifact.quality_gate] ?? GATE_STYLES.pass;
  const routes = Array.from(
    new Set(artifact.findings.map((f) => f.recommended_route))
  );

  return (
    <Card className="mt-12 [--card-spacing:--spacing(8)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-xl">Quality gate — Node 4 verdict</CardTitle>
          {totalRevisions > 0 && (
            <Badge variant="secondary" className="h-6 px-3">
              {totalRevisions} revision{totalRevisions > 1 ? "s" : ""} applied
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        <div
          className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: `${gate.color}14`, color: gate.color }}
        >
          {gate.icon === "pass" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {gate.label}
        </div>

        {artifact.findings.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Findings
            </p>
            <div className="mt-4 space-y-4">
              {artifact.findings.map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-border bg-background p-6"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {f.id}
                    </span>
                    <SeverityBadge severity={f.severity} />
                    <Badge variant="outline">{f.category}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      route: {ROUTE_LABELS[f.recommended_route]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    {f.description}
                  </p>
                  {f.evidence && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Evidence:</span>{" "}
                      {f.evidence}
                    </p>
                  )}
                  {f.required_correction && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Required correction:
                      </span>{" "}
                      {f.required_correction}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {routes.map((r) => (
                <Button
                  key={r}
                  type="button"
                  onClick={() => onRoute(r)}
                  disabled={rerunning || r === "human_review"}
                  variant={r === "human_review" ? "secondary" : "destructive"}
                  size="lg"
                >
                  {rerunning
                    ? "Rerunning…"
                    : r === "human_review"
                      ? "Flag for human review"
                      : `Send findings to ${ROUTE_LABELS[r]} → rerun`}
                </Button>
              ))}
            </div>
            {artifact.quality_gate === "needs_revision" && (
              <p className="mt-4 text-sm text-muted-foreground">
                Targeted correction path: feedback returns only to the
                responsible node instead of regenerating the entire response.
              </p>
            )}
          </div>
        )}

        {artifact.traceability.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Requirement → test traceability
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Criterion</th>
                    <th className="px-6 py-3 font-medium">Implementation</th>
                    <th className="px-6 py-3 font-medium">Tests</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {artifact.traceability.map((t) => (
                    <tr key={t.criterion_id} className="border-b border-border/60 last:border-0">
                      <td className="px-6 py-3 font-mono text-xs text-foreground">
                        {t.criterion_id}
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">
                        {t.implementation_reference === "missing"
                          ? "missing"
                          : t.implementation_reference}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                        {t.test_ids.join(", ") || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={t.status === "supported" ? "secondary" : "outline"}
                          className={
                            t.status === "supported"
                              ? "bg-final/10 text-final"
                              : t.status === "partial"
                                ? "bg-node4/10 text-node4"
                                : "bg-gate/10 text-gate"
                          }
                        >
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Sanitized final response
          </p>
          <div className="mt-4 space-y-4 rounded-2xl border border-border bg-background p-6 sm:p-8">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {artifact.final_response?.summary}
            </p>
            {artifact.final_response?.code_or_patch && (
              <pre className="overflow-x-auto rounded-xl bg-muted/50 p-5 font-mono text-xs leading-relaxed text-foreground">
                {artifact.final_response.code_or_patch}
              </pre>
            )}
            {artifact.final_response?.tests_and_status?.length > 0 && (
              <ul className="space-y-1.5">
                {artifact.final_response.tests_and_status.map((t, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    <span className="mr-2 text-final">▸</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {artifact.final_response?.security_notes?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gate">
                  Security notes
                </p>
                <ul className="mt-2 space-y-1.5">
                  {artifact.final_response.security_notes.map((n, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      <span className="mr-2 text-gate">!</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {artifact.final_response?.limitations?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-node4">
                  Limitations
                </p>
                <ul className="mt-2 space-y-1.5">
                  {artifact.final_response.limitations.map((n, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      <span className="mr-2 text-node4">·</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {artifact.redactions.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Redacted:</span>{" "}
                {artifact.redactions.join(", ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {open ? "Hide full Node 4 JSON" : "View full Node 4 JSON"}
          </button>
          {open && (
            <div className="mt-3">
              <JsonView data={artifact} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}