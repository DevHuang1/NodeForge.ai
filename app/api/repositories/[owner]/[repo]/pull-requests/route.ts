import { listPullRequests, hasGitHubCredentials } from "@/lib/github";
import { getOfflinePrList } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  owner: string;
  repo: string;
}

export async function GET(request: Request, ctx: { params: Promise<Params> }) {
  const { owner, repo } = await ctx.params;
  const token = request.headers.get("x-github-token")?.trim() || undefined;

  if (
    owner.toLowerCase() === "acme" &&
    repo.toLowerCase() === "notes-search"
  ) {
    return Response.json({
      mode: "offline",
      pullRequests: getOfflinePrList(),
    });
  }

  if (!hasGitHubCredentials(token)) {
    return Response.json(
      {
        mode: "offline",
        pullRequests: [],
        error:
          "No GitHub token configured. Only the bundled sample repository (acme/notes-search) is available offline.",
      },
      { status: 400 }
    );
  }

  try {
    const pullRequests = await listPullRequests(owner, repo, token);
    return Response.json({ mode: "github", pullRequests });
  } catch (err) {
    return Response.json(
      { mode: "offline", pullRequests: [], error: (err as Error).message },
      { status: 502 }
    );
  }
}