import { getReviewRun, saveReviewRun } from "@/lib/persistence";
import { recordAudit } from "@/lib/audit";
import type { AuditAction, FindingDecisionAction } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  runId?: string;
  findingId?: string;
  action?: FindingDecisionAction;
  reason?: string;
  reviewer?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.runId || !body.findingId || !body.action) {
    return Response.json(
      { error: "runId, findingId and action are required." },
      { status: 400 }
    );
  }
  if (!["approve", "dismiss", "request_revision", "assign"].includes(body.action)) {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  const run = await getReviewRun(body.runId);
  if (!run) {
    return Response.json({ error: "Review run not found." }, { status: 404 });
  }

  const all = run.deterministicFindings.concat(run.modelFindings);
  const target = all.find((f) => f.id === body.findingId);
  if (!target) {
    return Response.json({ error: "Finding not found in this run." }, { status: 404 });
  }

  const existing = run.decisions.find((d) => d.findingId === body.findingId);
  const decision = {
    findingId: body.findingId,
    action: body.action,
    reason: body.reason ?? "",
    reviewer: body.reviewer ?? "api",
    at: new Date().toISOString(),
  };
  run.decisions = existing
    ? run.decisions.map((d) => (d.findingId === body.findingId ? decision : d))
    : [...run.decisions, decision];
  run.updatedAt = new Date().toISOString();
  await saveReviewRun(run);

await recordAudit({
    actor: body.reviewer ?? "api",
    action: `finding.${body.action}` as AuditAction,
    entity: "review_run",
    entityId: run.id,
    metadata: { findingId: body.findingId, reason: body.reason },
  });

  return Response.json({ decision, run });
}