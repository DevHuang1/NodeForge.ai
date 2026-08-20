import { getOfflinePr } from "@/lib/github";
import { createReviewRun } from "@/lib/review-pipeline";
import { listReviewRuns } from "@/lib/persistence";
import type { ReviewRunOptions } from "@/lib/review-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

interface CreateBody {
  owner?: string;
  repo?: string;
  number?: number;
  options?: ReviewRunOptions;
}

export async function GET() {
  const runs = await listReviewRuns();
  return Response.json({ runs });
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.owner || !body.repo || !body.number) {
    return Response.json(
      { error: "owner, repo and number are required." },
      { status: 400 }
    );
  }

  const pr = getOfflinePr();
  if (!pr || pr.owner !== body.owner || pr.repo !== body.repo || pr.number !== body.number) {
    return Response.json(
      {
        error:
          "Only the bundled sample repository (acme/notes-search#42) is available without a GITHUB_TOKEN.",
      },
      { status: 400 }
    );
  }

  const options = body.options ?? {};
  if (options.offline === undefined) options.offline = true;

  try {
    const run = await createReviewRun(pr, options);
    return Response.json({ run });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message || "Review run failed." },
      { status: 500 }
    );
  }
}