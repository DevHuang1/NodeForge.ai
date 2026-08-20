import { listPullRequests, hasGitHubCredentials, getOfflinePrList } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  owner: string;
  repo: string;
}

export async function GET(_request: Request, ctx: { params: Promise<Params> }) {
  const { owner, repo } = await ctx.params;

  if (
    owner.toLowerCase() === "acme" &&
    repo.toLowerCase() === "notes-search"
  ) {
    return Response.json({
      mode: "offline",
      pullRequests: getOfflinePrList(),
    });
  }

  if (!hasGitHubCredentials()) {
    return Response.json(
      {
        mode: "offline",
        pullRequests: [],
        error:
          "No GITHUB_TOKEN configured. Only the bundled sample repository (acme/notes-search) is available offline.",
      },
      { status: 400 }
    );
  }

  try {
    const pullRequests = await listPullRequests(owner, repo);
    return Response.json({ mode: "github", pullRequests });
  } catch (err) {
    return Response.json(
      { mode: "offline", pullRequests: [], error: (err as Error).message },
      { status: 502 }
    );
  }
}