"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { JsonView } from "./JsonView";
import type {
  FindingDecisionAction,
  ReviewFinding,
  ReviewRun,
  ReviewRunSummary,
} from "@/lib/types";

type Phase = "idle" | "loading" | "running" | "done" | "error";

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-gate text-white",
  high: "bg-gate text-white",
  medium: "bg-node4 text-white",
  low: "bg-rev text-white",
};

function sample() {
  return { owner: "acme", repo: "notes-search", number: 42 };
}

export function ReviewPanel() {
  const [owner, setOwner] = useState("acme");
  const [repo, setRepo] = useState("notes-search");
  const [number, setNumber] = useState(42);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [runs, setRuns] = useState<ReviewRunSummary[]>([]);
  const [showJson, setShowJson] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [gitHubConfigured, setGitHubConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews");
      if (res.ok) {
        const data = (await res.json()) as { runs: ReviewRunSummary[] };
        setRuns(data.runs);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Initial data load on mount; async setState is intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshHistory();
    fetch("/api/repositories")
      .then((r) => r.json())
      .then((d) => setGitHubConfigured(Boolean(d.gitHubConfigured)))
      .catch(() => setGitHubConfigured(null));
  }, [refreshHistory]);

  async function runReview() {
    setPhase("running");
    setError(null);
    setRun(null);
    setReport(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: owner.trim() || "acme",
          repo: repo.trim() || "notes-search",
          number: Number(number) || 42,
          token: token.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Review run failed.");
        setPhase("error");
        return;
      }
      setRun(data.run as ReviewRun);
      setPhase("done");
      await refreshHistory();
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function loadRun(id: string) {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load run.");
        setPhase("error");
        return;
      }
      setRun(data.run as ReviewRun);
      setReport(null);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function decide(finding: ReviewFinding, action: FindingDecisionAction) {
    if (!run) return;
    const res = await fetch(`/api/findings/${finding.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.id, findingId: finding.id, action }),
    });
    const data = await res.json();
    if (res.ok) setRun(data.run as ReviewRun);
  }

  async function patchDecision(approved: boolean) {
    if (!run) return;
    const res = await fetch(`/api/reviews/${run.id}/patch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    const data = await res.json();
    if (res.ok && data.patch) {
      setRun({ ...run, patch: data.patch });
    }
  }

  async function exportReport() {
    if (!run) return;
    const res = await fetch("/api/evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.id }),
    });
    const data = await res.json();
    if (res.ok) setReport(data.report as string);
  }

  async function removeRun(id: string) {
    await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    await refreshHistory();
  }

  const findings = run
    ? [...run.deterministicFindings, ...run.modelFindings]
    : [];

  return (
    <section id="review" className="scroll-mt-24 py-24">
      <div className="mx-auto max-w-[1400px] px-6 sm:px-10">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-node4">
            Repository-aware
          </p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pull request review
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Ingests the changed files plus surrounding context, runs the same
            four-node pipeline, then layers deterministic security checks and an
            honest (never exaggerated) test execution report on top. Works fully
            offline with the bundled sample PR.
          </p>
        </div>

        <Card className="mt-10 [--card-spacing:--spacing(8)]">
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner
                </label>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="h-10 w-40 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-node4"
                  placeholder="acme"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Repo
                </label>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="h-10 w-48 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-node4"
                  placeholder="notes-search"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  PR number
                </label>
                <input
                  value={String(number)}
                  onChange={(e) => setNumber(Number(e.target.value) || 0)}
                  className="h-10 w-24 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-node4"
                />
              </div>
              <div className="flex min-w-[300px] flex-1 flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  GitHub token (optional — for real PRs)
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:border-node4"
                  placeholder="paste a fine-grained PAT · ghp_…"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={runReview}
                  disabled={phase === "running" || !number}
                  size="lg"
                >
                  {phase === "running" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldAlert className="mr-2 h-4 w-4" />
                  )}
                  {phase === "running" ? "Running…" : "Run review"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    const s = sample();
                    setOwner(s.owner);
                    setRepo(s.repo);
                    setNumber(s.number);
                    setToken("");
                  }}
                >
                  Load sample PR
                </Button>
              </div>
            </div>

            {!token.trim() && gitHubConfigured === false && (
              <p className="mt-4 text-[11px] text-muted-foreground">
                No GitHub token set — only the bundled sample PR
                (acme/notes-search#42) is available. Add a fine-grained PAT with
                “Contents: Read” to review a real pull request. It is sent to our
                server per request, used only to fetch from GitHub, and never
                stored.
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="mt-6 border-gate/40 bg-gate/5 [--card-spacing:--spacing(6)]">
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-gate">
                <XCircle className="h-4 w-4" /> {error}
              </p>
            </CardContent>
          </Card>
        )}

        {phase === "running" && (
          <Card className="mt-8 [--card-spacing:--spacing(8)]">
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running context ingestion → spec → implementation → gate →
                security scan…
              </p>
            </CardContent>
          </Card>
        )}

        {phase === "loading" && (
          <Card className="mt-8 [--card-spacing:--spacing(8)]">
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
              </p>
            </CardContent>
          </Card>
        )}

        {run && (
          <>
            <RunHeader run={run} onExport={exportReport} />

            <Card className="mt-6 [--card-spacing:--spacing(8)]">
              <CardContent>
                <h3 className="text-sm font-semibold text-foreground">
                  Pipeline stages
                </h3>
                <ol className="mt-4 space-y-2">
                  {run.stageLog.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-xs text-muted-foreground"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-node1/10 text-[10px] font-semibold text-node1">
                        {i + 1}
                      </span>
                      <span className="font-medium capitalize">{s.stage}</span>
                      {s.detail && (
                        <span className="truncate text-muted-foreground/70">
                          {s.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            {run.context && (
              <Card className="mt-6 [--card-spacing:--spacing(8)]">
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground">
                    Repository context
                  </h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {run.context.summary}
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-1.5 pr-4">File</th>
                          <th className="py-1.5 pr-4">Reason</th>
                          <th className="py-1.5 pr-4">Size</th>
                          <th className="py-1.5">Included</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.context.files.map((f) => (
                          <tr
                            key={f.path}
                            className="border-t border-border/60"
                          >
                            <td className="py-1.5 pr-4 font-mono">{f.path}</td>
                            <td className="py-1.5 pr-4 text-muted-foreground">{f.reason}</td>
                            <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                              {f.sizeBytes.toLocaleString()}
                            </td>
                            <td className="py-1.5">
                              {f.selected ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-node1" />
                              ) : (
                                <span className="text-muted-foreground">excluded</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mt-6 [--card-spacing:--spacing(8)]">
              <CardContent>
                <h3 className="text-sm font-semibold text-foreground">
                  Findings{" "}
                  <span className="text-muted-foreground">({findings.length})</span>
                </h3>
                {findings.length === 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    No findings.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {findings.map((f) => {
                      const decision = run.decisions.find(
                        (d) => d.findingId === f.id
                      );
                      return (
                        <div
                          key={f.id}
                          className="rounded-lg border border-border bg-muted/30 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SEVERITY_TONE[f.severity] ?? "bg-rev text-white"}`}
                            >
                              {f.severity}
                            </span>
                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {f.category}
                            </span>
                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {f.source}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {f.id} · {f.file_path}
                              {f.line_start ? `:${f.line_start}` : ""}
                            </span>
                            {decision && (
                              <span className="ml-auto rounded-full bg-node1/10 px-2.5 py-0.5 text-[10px] font-semibold text-node1">
                                {decision.action}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-[13px] leading-relaxed text-foreground">
                            {f.description}
                          </p>
                          {f.evidence && (
                            <pre className="mt-2 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
                              {f.evidence}
                            </pre>
                          )}
                          {f.recommended_action && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">Action: </span>
                              {f.recommended_action}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[
                              ["approve", "Approve"],
                              ["dismiss", "Dismiss"],
                              ["request_revision", "Request revision"],
                              ["assign", "Assign"],
                            ].map(([a, label]) => (
                              <Button
                                key={a}
                                variant="outline"
                                size="sm"
                                disabled={Boolean(decision)}
                                onClick={() =>
                                  decide(f, a as FindingDecisionAction)
                                }
                              >
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {run.testResult && (
              <Card className="mt-6 [--card-spacing:--spacing(8)]">
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground">
                    Test execution
                  </h3>
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {[
                      ["status", run.testResult.status.replace(/_/g, " ")],
                      ["passed", String(run.testResult.passed)],
                      ["failed", String(run.testResult.failed)],
                      ["blocked", String(run.testResult.blocked)],
                      ["not run", String(run.testResult.not_executed)],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center"
                      >
                        <div className="text-sm font-semibold text-foreground">{v}</div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {k}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Sandbox: <span className="font-mono">{run.testResult.sandbox}</span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {run.testResult.notes.map((n, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        {n}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 space-y-2">
                    {run.testResult.items.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-foreground">
                          {t.id} · {t.name}
                        </span>
                        <span className="text-muted-foreground">
                          {t.verification_status.replace(/_/g, " ")}
                          {t.failure_reason ? ` — ${t.failure_reason}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {run.patch && (
              <Card className="mt-6 [--card-spacing:--spacing(8)]">
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Patch proposal
                    </h3>
                    {run.patch.approved ? (
                      <span className="rounded-full bg-node1/10 px-2.5 py-0.5 text-[10px] font-semibold text-node1">
                        Approved by {run.patch.approvedBy}
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => patchDecision(false)}
                        >
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => patchDecision(true)}>
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {run.patch.description}
                  </p>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-background p-4 font-mono text-[11px] leading-relaxed text-foreground">
                    {run.patch.diff}
                  </pre>
                </CardContent>
              </Card>
            )}

            {report && (
              <Card className="mt-6 [--card-spacing:--spacing(8)]">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Report
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(report);
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-4 text-[11px] leading-relaxed text-muted-foreground">
                    {report}
                  </pre>
                </CardContent>
              </Card>
            )}

            <Card className="mt-6 [--card-spacing:--spacing(8)]">
              <CardContent>
                <button
                  type="button"
                  onClick={() => setShowJson((s) => !s)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showJson ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {showJson ? "Hide run JSON" : "View run JSON"}
                </button>
                {showJson && (
                  <div className="mt-4">
                    <JsonView data={run} />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card className="mt-8 [--card-spacing:--spacing(8)]">
          <CardContent>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                History{" "}
                <span className="text-muted-foreground">({runs.length})</span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshHistory}
                aria-label="Refresh history"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {runs.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                No review runs yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => loadRun(r.id)}
                    >
                      <span className="font-mono text-muted-foreground">
                        {r.owner}/{r.repo}#{r.prNumber}
                      </span>
                      <span className="truncate text-foreground">{r.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${r.offline ? "bg-rev/20 text-rev" : "bg-node1/10 text-node1"}`}
                      >
                        {r.offline ? "offline" : "live"}
                      </span>
                    </button>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {r.findingsCount} findings
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRun(r.id)}
                      aria-label="Delete run"
                      className="shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function RunHeader({
  run,
  onExport,
}: {
  run: ReviewRun;
  onExport: () => void;
}) {
  return (
    <Card className="mt-8 [--card-spacing:--spacing(8)]">
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted-foreground">
              {run.owner}/{run.repo}#{run.prNumber}
            </p>
            <h3 className="mt-1 truncate font-heading text-xl font-semibold text-foreground">
              {run.title}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {run.offline ? "Offline sample mode" : "Live review"} ·{" "}
              {run.provider ?? "n/a"} · {run.model ?? "n/a"} ·{" "}
              {run.durationMs} ms · {run.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                run.status === "error" ? "bg-gate text-white" : "bg-node1/10 text-node1"
              }`}
            >
              {run.status}
            </span>
            <Button variant="outline" size="sm" onClick={onExport}>
              Export report
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}