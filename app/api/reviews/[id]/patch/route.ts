import { getReviewRun, saveReviewRun } from "@/lib/persistence";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

interface Params {
  id: string;
}

interface Body {
  approved?: boolean;
  by?: string;
}

export async function POST(request: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const run = await getReviewRun(id);
  if (!run) {
    return Response.json({ error: "Review run not found." }, { status: 404 });
  }
  if (!run.patch) {
    return Response.json({ error: "This run has no patch proposal." }, { status: 400 });
  }

  run.patch.approved = Boolean(body.approved);
  run.patch.approvedBy = body.by ?? "api";
  run.patch.approvedAt = new Date().toISOString();
  run.updatedAt = new Date().toISOString();
  await saveReviewRun(run);

  await recordAudit({
    actor: body.by ?? "api",
    action: body.approved ? "patch.approve" : "patch.reject",
    entity: "review_run",
    entityId: run.id,
  });

  return Response.json({ patch: run.patch });
}