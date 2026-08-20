import { buildNode1Artifact, runNode2, runNode3, runNode4 } from "./pipeline";
import { getLLMConfig, LLMNotConfiguredError } from "./llm";
import { runDeterministicChecks } from "./security-rules";
import { runExecutor } from "./executor";
import { selectContext } from "./repository-context";
import { offlineNode2, offlineNode3, offlineNode4 } from "./offline-review-sample";
import { newRunId, saveReviewRun, getReviewRun } from "./persistence";
import { recordAudit, recordRunCreated } from "./audit";
import type {
  Node3Artifact,
  Node4Artifact,
  PatchProposal,
  PipelineArtifacts,
  PromptOverrides,
  PullRequest,
  ReviewFinding,
  ReviewRun,
  ReviewStage,
  UsageInfo,
} from "./types";

export interface ReviewRunOptions {
  offline?: boolean;
  temperature?: number;
  promptOverrides?: PromptOverrides;
  model?: string;
  provider?: string;
}

export const REVIEW_POLICY_VERSION = "1.0.0";
export const REVIEW_PROMPT_VERSION = "1.0.0";

function buildPrPrompt(pr: PullRequest): string {
  const files = pr.files
    .map(
      (f) =>
        `- ${f.path} (${f.status}; +${f.additions} -${f.deletions}${f.binary ? "; binary" : ""})`
    )
    .join("\n");
  return [
    `PR: ${pr.title}`,
    `Repo: ${pr.owner}/${pr.repo}#${pr.number}`,
    `Base ${pr.baseRef} (${pr.baseSha.slice(0, 7)}) -> Head ${pr.headRef} (${pr.headSha.slice(0, 7)})`,
    `URL: ${pr.url}`,
    "",
    `Changed files:\n${files}`,
    "",
    `Body:\n${pr.body || "(none)"}`,
  ].join("\n");
}

function mapNode4Findings(
  node4: Node4Artifact | undefined,
  node3: Node3Artifact | undefined
): ReviewFinding[] {
  if (!node4?.findings?.length) return [];
  const implPath = node3?.implementation?.files?.[0]?.path ?? "";
  return node4.findings.map((f) => {
    const ref = node4.traceability?.find((t) => t.criterion_id)?.implementation_reference ?? "";
    const filePath = ref.split(":")[0] || implPath;
    return {
      id: f.id,
      category: f.category,
      severity: f.severity,
      description: f.description,
      evidence: f.evidence,
      file_path: filePath,
      confidence: f.severity === "high" ? "high" : "medium",
      recommended_action: f.required_correction,
      source: "model",
      recommended_route: f.recommended_route,
    };
  });
}

function buildPatch(pr: PullRequest, node3: Node3Artifact | undefined): PatchProposal | null {
  if (!node3?.implementation?.files?.length) return null;
  const files = node3.implementation.files;
  const diffs = files.map((f) => {
    const lines = f.content.replace(/\n$/, "").split("\n");
    return [
      `diff --git a/${f.path} b/${f.path}`,
      `new file mode 100644`,
      `--- /dev/null`,
      `+++ b/${f.path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((l) => `+${l}`),
    ].join("\n");
  });
  return {
    description: `Proposed safe implementation for ${pr.owner}/${pr.repo}#${pr.number}.`,
    diff: diffs.join("\n\n"),
    files: files.map((f) => ({ path: f.path, status: "modified", content: f.content })),
    approved: false,
  };
}

function toUsage(
  u: { input_tokens: number; output_tokens: number } | undefined,
  provider: string | null,
  model: string | null
): UsageInfo | undefined {
  if (!u) return undefined;
  return { provider: provider ?? undefined, model: model ?? undefined, input_tokens: u.input_tokens, output_tokens: u.output_tokens };
}

export async function createReviewRun(
  pr: PullRequest,
  options: ReviewRunOptions = {}
): Promise<ReviewRun> {
  const id = newRunId();
  const startedAt = Date.now();
  const stageLog: ReviewRun["stageLog"] = [];
  const mark = (stage: ReviewStage, detail?: string) =>
    stageLog.push({ stage, at: new Date().toISOString(), detail });

  mark("context");
  const context = selectContext(pr);

  const usage: Record<string, UsageInfo | undefined> = {};
  let provider: string | null = null;
  let model: string | null = null;
  const retryCount = 0;
  const errors: string[] = [];
  let offline = options.offline ?? !getLLMConfig().configured;
  const artifacts: PipelineArtifacts = {};
  let fallbackUsed = false;

  mark("expand");
  artifacts.node1 = buildNode1Artifact(id, buildPrPrompt(pr));

  if (!offline) {
    try {
      const temperature = Number(options.temperature ?? 0.3);
      const n2 = await runNode2(
        id,
        artifacts.node1,
        [],
        temperature,
        options.promptOverrides?.node2,
        options.model,
        options.provider
      );
      artifacts.node2 = n2.artifact;
      usage.node2 = toUsage(n2.usage, n2.provider, n2.model);
      provider = n2.provider ?? provider;
      model = n2.model ?? model;

      mark("analyze");
      const n3 = await runNode3(
        id,
        artifacts.node1,
        artifacts.node2,
        [],
        temperature,
        false,
        options.promptOverrides?.node3,
        options.model,
        options.provider
      );
      artifacts.node3 = n3.artifact;
      usage.node3 = toUsage(n3.usage, n3.provider, n3.model);
      provider = n3.provider ?? provider;
      model = n3.model ?? model;

      const n4 = await runNode4(
        id,
        artifacts.node1,
        artifacts.node2,
        artifacts.node3,
        [],
        temperature,
        options.promptOverrides?.node4,
        options.model,
        options.provider
      );
      artifacts.node4 = n4.artifact;
      usage.node4 = toUsage(n4.usage, n4.provider, n4.model);
      provider = n4.provider ?? provider;
      model = n4.model ?? model;
    } catch (err) {
      const message =
        err instanceof LLMNotConfiguredError
          ? "LLM not configured; using offline sample artifacts."
          : (err as Error).message || "Live review failed.";
      errors.push(message);
      offline = true;
      fallbackUsed = true;
      mark("error", message);
    }
  }

  if (offline || !artifacts.node2) {
    artifacts.node2 = offlineNode2({
      repo: `${pr.owner}/${pr.repo}`,
      title: pr.title,
      body: pr.body,
    });
    artifacts.node3 = offlineNode3(context);
    artifacts.node4 = offlineNode4();
    offline = true;
  }

  mark("security");
  const deterministicFindings = runDeterministicChecks(pr.files);

  mark("execute");
  const execResponse = runExecutor({
    artifact: artifacts.node3!,
    context,
  });
  const testResult = execResponse.summary;

  mark("synthesize");
  const patch = buildPatch(pr, artifacts.node3);

  mark("done");
  const modelFindings = mapNode4Findings(artifacts.node4, artifacts.node3);

  const run: ReviewRun = {
    id,
    owner: pr.owner,
    repo: pr.repo,
    prNumber: pr.number,
    title: pr.title,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    status: errors.length && !fallbackUsed ? "error" : "done",
    currentStage: "done",
    stageLog,
    context,
    artifacts,
    deterministicFindings,
    modelFindings,
    testResult,
    patch,
    decisions: [],
    provider,
    model,
    usage,
    durationMs: Date.now() - startedAt,
    retryCount,
    promptVersion: REVIEW_PROMPT_VERSION,
    policyVersion: REVIEW_POLICY_VERSION,
    offline,
    errors,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveReviewRun(run);
  await recordRunCreated(run.id, {
    owner: run.owner,
    repo: run.repo,
    prNumber: run.prNumber,
    offline: run.offline,
  }).catch(() => {});
  return run;
}

export async function reloadReviewRun(id: string): Promise<ReviewRun | null> {
  const run = await getReviewRun(id);
  if (!run) return null;
  await recordAudit({
    actor: "system",
    action: "run.reload",
    entity: "review_run",
    entityId: run.id,
  });
  return run;
}