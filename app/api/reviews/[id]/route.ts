import { getReviewRun, deleteReviewRun } from "@/lib/persistence";
import { evaluateRunWithRegression } from "@/lib/evaluation";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

interface Params {
  id: string;
}

export async function GET(_request: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const run = await getReviewRun(id);
  if (!run) {
    return Response.json({ error: "Review run not found." }, { status: 404 });
  }
  const evaluation = await evaluateRunWithRegression(run);
  return Response.json({ run, evaluation });
}

export async function DELETE(_request: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const run = await getReviewRun(id);
  if (!run) {
    return Response.json({ error: "Review run not found." }, { status: 404 });
  }
  await deleteReviewRun(id);
  await recordAudit({
    actor: "api",
    action: "run.reload",
    entity: "review_run",
    entityId: id,
    metadata: { deleted: true },
  });
  return Response.json({ ok: true });
}