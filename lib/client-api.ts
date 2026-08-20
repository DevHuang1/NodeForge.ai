import type {
  ApiConfig,
  BaselineRequest,
  BaselineResult,
  Node2Artifact,
  Node3Artifact,
  Node4Artifact,
  RunNodeRequest,
  UsageInfo,
} from "./types";

export interface RunNodeResponse {
  node: 2 | 3 | 4;
  artifact: Node2Artifact | Node3Artifact | Node4Artifact;
  usage?: UsageInfo;
}

export async function getConfig(): Promise<ApiConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load API config.");
  return res.json();
}

export async function runNode(body: RunNodeRequest): Promise<RunNodeResponse> {
  const res = await fetch("/api/pipeline/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as RunNodeResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  return data;
}

export async function runBaseline(
  body: BaselineRequest
): Promise<BaselineResult> {
  const res = await fetch("/api/baseline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as BaselineResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  return data;
}