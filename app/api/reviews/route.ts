import { getOfflinePr, getPullRequest } from "@/lib/github";
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
  token?: string;
}

export async function GET() {
  const runs = await listReviewRuns();
  return Response.json({ runs });
}

function isSample(owner: string, repo: string, number: number): boolean {
  return (
    owner.toLowerCase() === "acme" &&
    repo.toLowerCase() === "notes-search" &&
    number === 42
  );
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

  const owner = body.owner.trim();
  const repo = body.repo.trim();
  const number = Number(body.number);
  const token = typeof body.token === "string" && body.token.trim() ? body.token.trim() : undefined;

  const sample = isSample(owner, repo, number);

  let pr;
  if (sample) {
    pr = getOfflinePr();
  } else if (token) {
    try {
      pr = await getPullRequest(owner, repo, number, token);
    } catch (err) {
      const raw = (err as Error).message || "Failed to fetch the pull request.";
      const friendly = /fetch failed/i.test(raw)
        ? "Could not reach GitHub. Check that the token is valid (fine-grained PAT with 'Contents: Read') and that the repo/PR exist."
        : raw;
      return Response.json({ error: friendly }, { status: 502 });
    }
  }

  if (!pr) {
    return Response.json(
      {
        error: sample
          ? "The bundled sample pull request could not be loaded."
          : "No GitHub token provided. Add a GitHub token (fine-grained PAT with 'Contents: Read') to review a real pull request, or use the bundled sample (acme/notes-search#42).",
      },
      { status: 400 }
    );
  }

  const options = body.options ?? {};
  if (sample && options.offline === undefined) options.offline = true;

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