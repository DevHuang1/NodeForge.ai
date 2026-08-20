import {
  getGitHubConfig,
  getOfflinePrList,
  hasGitHubCredentials,
} from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  const config = getGitHubConfig();
  return Response.json({
    gitHubConfigured: config.enabled,
    tokenSet: hasGitHubCredentials(),
    maxFiles: config.maxFiles,
    offlineSample: getOfflinePrList(),
  });
}