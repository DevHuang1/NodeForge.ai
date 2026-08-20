"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getConfig, runBaseline, runNode } from "@/lib/client-api";
import { buildNode1, makeRequestId } from "@/lib/client";
import { TEST_CASES } from "@/lib/test-cases";
import { loadPromptOverrides } from "@/lib/prompt-store";
import { getSampleRun, sampleBaseline } from "@/lib/samples";
import { exportJsonReport, exportMarkdownReport } from "@/lib/report";
import type {
  ApiConfig,
  PipelineArtifacts,
  PromptOverrides,
  RevisionFeedback,
  RouteTarget,
  UsageInfo,
} from "@/lib/types";
import { NodeCard } from "./NodeCard";
import { QualityGate } from "./QualityGate";
import { BaselinePanel } from "./BaselinePanel";
import { Scorecard } from "./Scorecard";
import { SectionHeader } from "./SectionHeader";
import { RevisionTimeline } from "./RevisionTimeline";
import { HumanReviewPanel, type ReviewDecision } from "./HumanReviewPanel";
import { ModelComparePanel } from "./ModelComparePanel";

const NODE_DEFS = [
  {
    n: 1 as const,
    name: "Human Input",
    color: "#2e8b57",
    artifact: "Raw Task Record",
    role: "Capture the raw request exactly; never resolve ambiguity silently.",
  },
  {
    n: 2 as const,
    name: "Query Expansion",
    color: "#2f6bff",
    artifact: "Explicit System Specification",
    role: "Turn ambiguity into assumptions, criteria, edge cases, threat model.",
  },
  {
    n: 3 as const,
    name: "Execution & Verification",
    color: "#7546c9",
    artifact: "Code + Test Matrix",
    role: "Generate the smallest implementation plus independent tests.",
  },
  {
    n: 4 as const,
    name: "Output Sanitization",
    color: "#c98a00",
    artifact: "Sanitized Response",
    role: "Final gate: syntax, security, traceability, honesty.",
  },
];

const TARGET_RANK: Record<string, number> = {
  node_2: 2,
  node_3: 3,
  node_4: 4,
};

interface CustomCase {
  id: string;
  title: string;
  rawRequest: string;
  challenge: string;
  accent: string;
}

const CUSTOM_CASE: CustomCase = {
  id: "custom",
  title: "Custom request",
  rawRequest: "",
  challenge: "Paste any coding request and run it through the four nodes.",
  accent: "#0e7f86",
};

function buildCustomCase(raw: string): CustomCase {
  return { ...CUSTOM_CASE, rawRequest: raw };
}

export function PipelineDemo() {
  const [caseIdx, setCaseIdx] = useState(0);
  const [customRequest, setCustomRequest] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [temperature, setTemperature] = useState(0.3);
  const [injectDefect, setInjectDefect] = useState(false);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [artifacts, setArtifacts] = useState<PipelineArtifacts>({});
  const artifactsRef = useRef<PipelineArtifacts>({});
  const [previous, setPrevious] = useState<Record<number, unknown>>({});
  const [usage, setUsage] = useState<Record<string, UsageInfo | undefined>>({});
  const [revisions, setRevisions] = useState<RevisionFeedback[]>([]);
  const revisionsRef = useRef<RevisionFeedback[]>([]);
  const [activeNode, setActiveNode] = useState<1 | 2 | 3 | 4 | null>(null);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanReview, setHumanReview] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [promptOverrides, setPromptOverrides] = useState<PromptOverrides>({});
  const [compareModel, setCompareModel] = useState("");
  const [priority, setPriority] = useState<"o" | "f">("o");
  const [compareArtifacts, setCompareArtifacts] = useState<PipelineArtifacts | null>(null);
  const [compareUsage, setCompareUsage] = useState<Record<string, UsageInfo | undefined>>({});
  const [compareBusy, setCompareBusy] = useState(false);
  const [scores, setScores] = useState<{ baseline: number[]; pipeline: number[] } | undefined>(undefined);

  const isCustom = caseIdx === TEST_CASES.length;
  const testCase = isCustom ? buildCustomCase(customRequest) : TEST_CASES[caseIdx];
  const requestIdPrefixRef = useRef<string | null>(null);
  const getRequestIdPrefix = useCallback(() => {
    if (!requestIdPrefixRef.current) {
      requestIdPrefixRef.current = `nf-${Date.now().toString(36)}`;
    }
    return requestIdPrefixRef.current;
  }, []);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    // Hydrate prompt overrides from localStorage after mount (client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side hydration from external storage
    setPromptOverrides(loadPromptOverrides());
    setPriority(localStorage.getItem("nodeforge-priority") === "f" ? "f" : "o");
  }, []);

  const setPriorityPersisted = useCallback((p: "o" | "f") => {
    setPriority(p);
    localStorage.setItem("nodeforge-priority", p);
  }, []);

  const activeModel = useMemo(() => {
    if (!config?.configured || !config.providers.length) return undefined;
    const wanted = priority === "f" ? "Featherless" : "OpenRouter";
    const found = config.providers.find((p) => p.name === wanted);
    return found?.model ?? config.providers[0].model;
  }, [config, priority]);

  const activeProvider = useMemo(() => {
    if (!config?.configured || !config.providers.length) return undefined;
    const wanted = priority === "f" ? "Featherless" : "OpenRouter";
    return config.providers.some((p) => p.name === wanted) ? wanted : config.providers[0].name;
  }, [config, priority]);

  const running =
    activeNode !== null || baselineBusy || runningAll || compareBusy;

  const setNodeArtifact = useCallback(
    (n: 1 | 2 | 3 | 4, artifact: unknown) => {
      const next: PipelineArtifacts = { ...artifactsRef.current };
      const key = `node${n}` as keyof PipelineArtifacts;
      if (next[key]) {
        setPrevious((p) => ({ ...p, [n]: next[key] }));
      }
      (next as Record<string, unknown>)[`node${n}`] = artifact;
      if (n < 4) delete (next as Record<string, unknown>).node4;
      if (n < 3) delete (next as Record<string, unknown>).node3;
      artifactsRef.current = next;
      setArtifacts(next);
    },
    []
  );

  const recordUsage = useCallback(
    (key: string, u: UsageInfo | undefined) => {
      if (u) setUsage((prev) => ({ ...prev, [key]: u }));
    },
    []
  );

  const runNodeStep = useCallback(
    async (n: 1 | 2 | 3 | 4, model?: string): Promise<boolean> => {
      const prefix = getRequestIdPrefix();
      if (n === 1) {
        setActiveNode(1);
        setNodeArtifact(1, buildNode1(makeRequestId(prefix, testCase.id), testCase.rawRequest));
        await new Promise((r) => setTimeout(r, 350));
        setActiveNode(null);
        return true;
      }
      setActiveNode(n);
      try {
        const current = artifactsRef.current;
        const res = await runNode({
          node: n,
          requestId: testCase.id,
          rawRequest: testCase.rawRequest,
          requestIdPrefix: prefix,
          artifacts: {
            node1: current.node1,
            node2: current.node2,
            node3: current.node3,
          },
          feedback: revisionsRef.current,
          temperature,
          injectDefect,
          promptOverrides,
          model: model ?? activeModel,
          provider: activeProvider,
        });
        setNodeArtifact(n, res.artifact);
        recordUsage(`node${n}`, res.usage);
        setError(null);
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      } finally {
        setActiveNode(null);
      }
    },
    [activeModel, activeProvider, getRequestIdPrefix, injectDefect, promptOverrides, recordUsage, setNodeArtifact, temperature, testCase]
  );

  const runSample = useCallback(
    (run: { node2: unknown; node3: unknown; node4: unknown }) => {
      setArtifacts({});
      artifactsRef.current = {};
      setPrevious({});
      setRevisions([]);
      revisionsRef.current = [];
      setNodeArtifact(1, buildNode1(makeRequestId(getRequestIdPrefix(), testCase.id), testCase.rawRequest));
      setNodeArtifact(2, run.node2);
      setNodeArtifact(3, run.node3);
      setNodeArtifact(4, run.node4);
    },
    [getRequestIdPrefix, setNodeArtifact, testCase.id, testCase.rawRequest]
  );

  const runAll = useCallback(async () => {
    setError(null);
    setHumanReview("none");
    setCompareArtifacts(null);
    setRunningAll(true);
    setArtifacts({});
    artifactsRef.current = {};
    setPrevious({});
    try {
      if (offlineMode) {
        const sample = getSampleRun(testCase.id);
        if (!sample) {
          setError("No offline sample exists for a custom request. Disable offline mode to run live.");
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
        runSample(sample);
        setArtifacts({ baseline: sample.baseline });
        artifactsRef.current = { baseline: sample.baseline };
        return;
      }
      if (!config?.configured) {
        setError("No LLM provider is configured. Enable offline mode to explore without an API key.");
        return;
      }
      await runNodeStep(1);
      const ok2 = await runNodeStep(2);
      if (!ok2) return;
      const ok3 = await runNodeStep(3);
      if (!ok3) return;
      await runNodeStep(4);
    } finally {
      setRunningAll(false);
    }
  }, [config, offlineMode, runNodeStep, runSample, testCase.id]);

  const runBaselineStep = useCallback(async () => {
    setError(null);
    setBaselineBusy(true);
    try {
      if (offlineMode) {
        await new Promise((r) => setTimeout(r, 300));
        const b = sampleBaseline(testCase.id);
        setArtifacts((prev) => ({ ...prev, baseline: b }));
        return;
      }
      if (!config?.configured) {
        setError("No LLM provider is configured. Enable offline mode to explore without an API key.");
        return;
      }
      const result = await runBaseline({
        requestId: testCase.id,
        rawRequest: testCase.rawRequest,
        requestIdPrefix: getRequestIdPrefix(),
        temperature,
        promptOverride: promptOverrides.baseline,
        model: activeModel,
        provider: activeProvider,
      });
      setArtifacts((prev) => ({ ...prev, baseline: result }));
      recordUsage("baseline", result.usage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBaselineBusy(false);
    }
  }, [activeModel, activeProvider, config, getRequestIdPrefix, offlineMode, promptOverrides.baseline, recordUsage, temperature, testCase.id, testCase.rawRequest]);

  const runComparison = useCallback(async () => {
    if (!compareModel.trim()) return;
    setError(null);
    setCompareBusy(true);
    setCompareArtifacts(null);
    setCompareUsage({});
    try {
      const prefix = getRequestIdPrefix();
      const cState: PipelineArtifacts = {};
      const cUsage: Record<string, UsageInfo | undefined> = {};

      setActiveNode(1);
      const node1 = buildNode1(makeRequestId(prefix, testCase.id), testCase.rawRequest);
      cState.node1 = node1;
      await new Promise((r) => setTimeout(r, 300));
      setActiveNode(null);

      const runOne = async (n: 2 | 3 | 4) => {
        setActiveNode(n);
        try {
          const res = await runNode({
            node: n,
            requestId: testCase.id,
            rawRequest: testCase.rawRequest,
            requestIdPrefix: prefix,
            artifacts: { node1, node2: cState.node2, node3: cState.node3 },
            feedback: [],
            temperature,
            injectDefect,
            promptOverrides,
            model: compareModel.trim(),
          });
          (cState as Record<string, unknown>)[`node${n}`] = res.artifact;
          if (res.usage) cUsage[`node${n}`] = res.usage;
        } finally {
          setActiveNode(null);
        }
      };

      await runOne(2);
      await runOne(3);
      await runOne(4);
      setCompareArtifacts({ ...cState });
      setCompareUsage(cUsage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCompareBusy(false);
    }
  }, [compareModel, getRequestIdPrefix, injectDefect, promptOverrides, temperature, testCase.id, testCase.rawRequest]);

  const reset = useCallback(() => {
    setArtifacts({});
    artifactsRef.current = {};
    setPrevious({});
    setUsage({});
    setRevisions([]);
    revisionsRef.current = [];
    setError(null);
    setHumanReview("none");
    setCompareArtifacts(null);
    setCompareUsage({});
  }, []);

  const applyFeedback = useCallback(
    async (items: RevisionFeedback[], target: RouteTarget) => {
      const nextRevisions = [...revisionsRef.current, ...items];
      setRevisions(nextRevisions);
      revisionsRef.current = nextRevisions;
      setError(null);

      const firstTarget = TARGET_RANK[target] ?? 3;
      const next: PipelineArtifacts = { ...artifactsRef.current };
      if (firstTarget <= 4) delete (next as Record<string, unknown>).node4;
      if (firstTarget <= 3) delete (next as Record<string, unknown>).node3;
      if (firstTarget <= 2) delete (next as Record<string, unknown>).node2;
      artifactsRef.current = next;
      setArtifacts(next);

      for (let n = firstTarget; n <= 4; n++) {
        await runNodeStep(n as 1 | 2 | 3 | 4);
      }
    },
    [runNodeStep]
  );

  const sendToRoute = useCallback(
    async (target: RouteTarget) => {
      if (target === "human_review") {
        setHumanReview("pending");
        return;
      }
      const n4 = artifacts.node4;
      if (!n4) return;
      const findings = n4.findings.filter(
        (f) => f.recommended_route === target
      );
      if (!findings.length) return;

      const newItems: RevisionFeedback[] = findings
        .filter((f) => !revisions.some((r) => r.finding_id === f.id))
        .map((f) => ({
          source: "node4",
          target,
          finding_id: f.id,
          description: f.description,
          severity: f.severity,
          correction: f.required_correction,
          applied_at: new Date().toISOString(),
        }));
      if (!newItems.length) return;
      await applyFeedback(newItems, target);
    },
    [applyFeedback, artifacts.node4, revisions]
  );

  const handleReviewDecision = useCallback(
    async (decision: ReviewDecision) => {
      if (decision.action === "approve") {
        setHumanReview("approved");
        return;
      }
      if (decision.action === "reject") {
        setHumanReview("rejected");
        return;
      }
      if (decision.action === "request_changes" && decision.target) {
        setHumanReview("none");
        const items: RevisionFeedback[] = [
          {
            source: "human_review",
            target: decision.target,
            finding_id: `HR-${Date.now().toString(36)}`,
            description: decision.note || "Human reviewer requested changes.",
            severity: "medium",
            correction: decision.note || "Address the reviewer's note.",
            applied_at: new Date().toISOString(),
          },
        ];
        await applyFeedback(items, decision.target);
      }
    },
    [applyFeedback]
  );

  const switchCase = (idx: number) => {
    setCaseIdx(idx);
    reset();
  };

  const exportReport = (format: "md" | "json") => {
    const input = {
      caseId: testCase.id,
      rawRequest: testCase.rawRequest,
      artifacts,
      revisions,
      usage,
      scores,
      generatedAt: new Date().toISOString(),
    };
    if (format === "md") exportMarkdownReport(input);
    else exportJsonReport(input);
  };

  const effectiveUsage = isCustom
    ? usage
    : usage;
  const effectiveArtifacts = artifacts;

  return (
    <section id="demo" className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-10 sm:py-28">
        <div className="mb-8">
          <SectionHeader
            eyebrow="Live Demo"
            accent="#6b3fc4"
            title="Run the pipeline against a real model"
            description="Pick one of the three evaluation cases or paste a custom request. The same raw request goes through the four nodes and a single-prompt baseline; each node runs a live model call and produces an inspectable artifact. Node 4 is the quality gate — when it finds a defect, route targeted feedback back to the responsible node."
          />
        </div>

        {config && !config.configured && (
          <div className="mb-6 rounded-xl border border-node4/60 bg-node4/10 p-4 text-sm">
            <p className="font-semibold text-node4">
              No API key configured yet.
            </p>
            <p className="mt-1 text-muted-foreground">
              Copy{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.example</code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.local</code>{" "}
              and set{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">OPENROUTER_API_KEY</code>{" "}
              (primary) or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">FEATHERLESS_API_KEY</code>{" "}
              (fallback). Configured providers run in order with automatic
              fallback; restart the server afterwards. You can also enable{" "}
              <span className="font-medium text-foreground">offline mode</span>{" "}
              below to explore sample artifacts without an API key.
            </p>
          </div>
        )}

        {config?.configured && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-final/50 bg-final/10 px-4 py-3 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-final" />
            {config.providers.length === 1 ? (
              <span>
                Model configured:{" "}
                <span className="font-mono text-foreground">
                  {config.providers[0].model}
                </span>{" "}
                · {config.providers[0].name}
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                Providers:
                {config.providers.map((p, i) => {
                  const isActive =
                    (priority === "f" && p.name === "Featherless") ||
                    (priority === "o" && p.name === "OpenRouter") ||
                    (priority !== "f" && priority !== "o" && i === 0);
                  return (
                    <span
                      key={p.name}
                      className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${
                        isActive
                          ? "bg-final/20 text-final"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {isActive ? "★ " : `${i + 1}. `}
                      {p.name} — {p.model}
                      {isActive && <span className="ml-1 font-sans">(primary)</span>}
                    </span>
                  );
                })}
              </span>
            )}
            {config.providers.some((p) => p.name === "OpenRouter") &&
              config.providers.some((p) => p.name === "Featherless") && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-1">
                  <span className="pl-1.5 text-muted-foreground">Primary:</span>
                  {(
                    [
                      ["o", "OpenRouter"],
                      ["f", "Featherless"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPriorityPersisted(val)}
                      className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                        priority === val
                          ? "bg-final text-white"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            <span className="text-muted-foreground/70">· temperature {temperature.toFixed(1)}</span>
            {Object.keys(usage).length > 0 && (
              <span className="text-muted-foreground/70">
                · {Object.values(usage).reduce((a, u) => a + (u ? u.input_tokens + u.output_tokens : 0), 0)} tokens used
              </span>
            )}
          </div>
        )}

        {/* Case selector */}
        <div className="mt-10 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {TEST_CASES.map((tc, idx) => (
            <button
              key={tc.id}
              type="button"
              onClick={() => switchCase(idx)}
              className={`rounded-xl border p-5 text-left transition-all ${
                caseIdx === idx
                  ? "border-border bg-muted"
                  : "border-border bg-card hover:border-input"
              }`}
              style={
                caseIdx === idx
                  ? { boxShadow: `0 0 0 1px ${tc.accent}44` }
                  : undefined
              }
            >
              <span className="flex items-center justify-between">
                <span className="text-sm font-semibold">{tc.title}</span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: tc.accent }}
                />
              </span>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
                {tc.challenge}
              </p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => switchCase(TEST_CASES.length)}
            className={`rounded-xl border p-5 text-left transition-all ${
              isCustom ? "border-border bg-muted" : "border-border bg-card hover:border-input"
            }`}
            style={isCustom ? { boxShadow: `0 0 0 1px #0e7f8644` } : undefined}
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-semibold">Custom request</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0e7f86" }} />
            </span>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
              Paste any coding request and run it through the four nodes.
            </p>
          </button>
        </div>

        {isCustom && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <label className="text-xs font-semibold text-muted-foreground">
              Your request
            </label>
            <textarea
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              rows={3}
              placeholder="e.g. Write a Python function that validates an email address."
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-input"
            />
          </div>
        )}

        {/* Controls */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">Temp</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-32 accent-node2"
              aria-label="Temperature"
            />
            <span className="font-mono text-xs text-foreground">
              {temperature.toFixed(1)}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={offlineMode}
              onChange={(e) => setOfflineMode(e.target.checked)}
              className="accent-node2"
            />
            Offline mode (sample artifacts, no API)
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={injectDefect}
              onChange={(e) => setInjectDefect(e.target.checked)}
              className="accent-gate"
            />
            Inject a deliberate defect into Node 3 (demo the revision loop)
          </label>

          <div className="ml-auto flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={runAll}
              disabled={running || (isCustom && !customRequest.trim())}
              className="rounded-lg bg-node2 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2559e0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningAll ? "Running pipeline…" : "Run Pipeline"}
            </button>
            <button
              type="button"
              onClick={runBaselineStep}
              disabled={running || (isCustom && !customRequest.trim())}
              className="rounded-lg border border-border bg-muted px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {baselineBusy ? "Running baseline…" : "Run Baseline"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="rounded-lg border border-border bg-muted px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => exportReport("md")}
              disabled={!Object.keys(artifacts).length}
              title="Download a markdown run report"
              className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export .md
            </button>
            <button
              type="button"
              onClick={() => exportReport("json")}
              disabled={!Object.keys(artifacts).length}
              title="Download the full run as JSON"
              className="rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export .json
            </button>
          </div>
        </div>

        {config?.configured && !offlineMode && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-node3/40 bg-node3/5 px-4 py-3 text-xs text-muted-foreground">
            <span className="font-medium text-node3">Model comparison:</span>
            <input
              value={compareModel}
              onChange={(e) => setCompareModel(e.target.value)}
              placeholder={`e.g. ${activeModel ?? config.providers[0]?.model ?? "openrouter/free"}`}
              className="w-64 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground outline-none focus:border-input"
            />
            <button
              type="button"
              onClick={runComparison}
              disabled={running || !compareModel.trim()}
              className="rounded-lg bg-node3 px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {compareBusy ? "Running comparison…" : "Run comparison"}
            </button>
            <span className="text-muted-foreground/70">
              Runs the full pipeline again against the given model ID.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-gate/60 bg-gate/10 p-5 text-sm text-foreground">
            <span className="font-semibold text-gate">Error:</span> {error}
          </div>
        )}

        {/* Raw request */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Identical input for both workflows
          </p>
          <p className="mt-2.5 font-mono text-sm text-foreground">
            &ldquo;{testCase.rawRequest}&rdquo;
          </p>
        </div>

        {/* Pipeline board */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {NODE_DEFS.map((def) => {
            const artifact = effectiveArtifacts[`node${def.n}`];
            const prev = previous[def.n];
            const hasPrev =
              def.n === 1 ? true : Boolean(effectiveArtifacts[`node${def.n - 1}` as keyof PipelineArtifacts]);
            const state = artifact
              ? "done"
              : activeNode === def.n
                ? "running"
                : "pending";
            return (
              <NodeCard
                key={def.n}
                node={def}
                state={state}
                artifact={artifact}
                previous={prev}
                usage={effectiveUsage[`node${def.n}`]}
                canRun={hasPrev}
                disabled={running}
                onRun={() => void runNodeStep(def.n)}
                revisionCount={
                  revisions.filter((r) => r.target === `node_${def.n}`).length
                }
              />
            );
          })}
        </div>

        <RevisionTimeline revisions={revisions} />

        <QualityGate
          artifact={effectiveArtifacts.node4}
          onRoute={(t) => void sendToRoute(t)}
          rerunning={running}
          totalRevisions={revisions.length}
        />

        {humanReview === "pending" && (
          <div className="mt-4">
            <HumanReviewPanel
              onDecision={(d) => void handleReviewDecision(d)}
              disabled={running}
            />
          </div>
        )}
        {humanReview === "approved" && (
          <div className="mt-4 rounded-xl border border-final/70 bg-final/10 p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-final">Approved by human review.</span>{" "}
            The run is finalized as the auditable answer.
          </div>
        )}
        {humanReview === "rejected" && (
          <div className="mt-4 rounded-xl border border-gate/70 bg-gate/10 p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-gate">Run rejected.</span>{" "}
            Press <span className="text-foreground">Reset</span> to start a fresh
            pass or request changes to revise it.
          </div>
        )}

        {compareArtifacts && (
          <ModelComparePanel
            primary={artifacts}
            secondary={compareArtifacts}
            primaryUsage={usage}
            secondaryUsage={compareUsage}
          />
        )}

        <div className="mt-8">
          <BaselinePanel
            result={effectiveArtifacts.baseline}
            usage={usage.baseline}
            running={baselineBusy}
            disabled={running}
            onRun={() => void runBaselineStep()}
          />
        </div>

        {/* Scorecard */}
        <div id="scorecard" className="mt-20 scroll-mt-20">
          <Scorecard
            caseId={testCase.id}
            artifacts={effectiveArtifacts}
            onScoresChange={setScores}
          />
        </div>
      </div>
    </section>
  );
}