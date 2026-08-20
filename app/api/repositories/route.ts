import {
  getGitHubConfig,
  hasGitHubCredentials,
  getOfflinePrList,
} from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = request.headers.get("x-github-token")?.trim() || undefined;
  const config = getGitHubConfig(token);
  return Response.json({
    gitHubConfigured: config.enabled,
    tokenSet: hasGitHubCredentials(token),
    maxFiles: config.maxFiles,
    offlineSample: getOfflinePrList(),
  });
}