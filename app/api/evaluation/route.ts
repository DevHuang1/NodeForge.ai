import { listReviewRuns, getReviewRun } from "@/lib/persistence";
import { evaluateRun, buildReviewReport, summarizeRunList } from "@/lib/evaluation";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listReviewRuns({ limit: 100 });
  const metrics = [];
  for (const summary of runs) {
    const run = await getReviewRun(summary.id);
    if (run) metrics.push({ runId: run.id, metrics: evaluateRun(run) });
  }
  return Response.json({
    runs: summarizeRunList(runs),
    metrics,
    summary: {
      total: runs.length,
      withOfflineFallback: runs.filter((r) => r.offline).length,
      withModelFindings: runs.filter((r) => r.findingsCount > 0).length,
    },
  });
}

export async function POST(request: Request) {
  let body: { runId?: string } = {};
  try {
    body = (await request.json()) as { runId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.runId) {
    return Response.json({ error: "runId is required." }, { status: 400 });
  }
  const run = await getReviewRun(body.runId);
  if (!run) {
    return Response.json({ error: "Review run not found." }, { status: 404 });
  }
  const report = buildReviewReport(run);
  return Response.json({ report, metrics: evaluateRun(run) });
}