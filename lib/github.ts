import type { PullRequest, PullRequestFile } from "./types";
import { isBinaryFile, isIgnoredPath } from "./repository-context";
import { getSamplePr, SAMPLE_PR_LIST } from "./sample-pr";

const API = "https://api.github.com";
const MAX_FILES = Number(process.env.GITHUB_MAX_FILES ?? 30);
const MAX_CONTENT_BYTES = 512 * 1024;

export function hasGitHubCredentials(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export interface GitHubConfig {
  enabled: boolean;
  tokenSet: boolean;
  maxFiles: number;
}

export function getGitHubConfig(): GitHubConfig {
  return {
    enabled: hasGitHubCredentials(),
    tokenSet: hasGitHubCredentials(),
    maxFiles: MAX_FILES,
  };
}

interface GitHubError extends Error {
  status: number;
}

function ghError(message: string, status: number): GitHubError {
  const err = new Error(message) as GitHubError;
  err.status = status;
  return err;
}

async function gh<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github.v3+json, application/vnd.github.v3.diff",
      Authorization: `Bearer ${token}`,
      "User-Agent": "NodeForge.ai",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw ghError(`GitHub request failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }
  if (res.headers.get("content-type")?.includes("application/vnd.github.v3.diff")) {
    return (await res.text()) as T;
  }
  return (await res.json()) as T;
}

interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  additions: number;
  deletions: number;
}

interface GhFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

interface GhContent {
  content?: string;
  encoding?: string;
}

export interface PullRequestLite {
  number: number;
  title: string;
  state: string;
  headSha: string;
  headRef: string;
  baseRef: string;
}

export async function listPullRequests(owner: string, repo: string): Promise<PullRequestLite[]> {
  const items = await gh<GhPull[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=30`);
  return items.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    headSha: p.head.sha,
    headRef: p.head.ref,
    baseRef: p.base.ref,
  }));
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const data = await gh<GhContent>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`
    );
    if (!data.content) return null;
    const buf = Buffer.from(data.content, "base64");
    if (buf.length > MAX_CONTENT_BYTES) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequest> {
  const meta = await gh<GhPull>(`/repos/${owner}/${repo}/pulls/${number}`);
  const files = await gh<GhFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);

  const changed: PullRequestFile[] = [];
  for (const f of files.slice(0, MAX_FILES)) {
    if (isIgnoredPath(f.filename)) continue;
    let content = "";
    if (f.status !== "removed") {
      const raw = await fetchFileContent(owner, repo, f.filename, meta.head.sha);
      if (raw !== null) content = raw;
    }
    const binary = isBinaryFile(f.filename, content || f.patch || "");
    changed.push({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      content,
      unifiedDiff: f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : "",
      lines: content ? content.split("\n") : [],
      binary,
    });
  }

  return {
    owner,
    repo,
    number: meta.number,
    title: meta.title,
    body: meta.body ?? "",
    baseSha: meta.base.sha,
    headSha: meta.head.sha,
    baseRef: meta.base.ref,
    headRef: meta.head.ref,
    url: meta.html_url,
    files: changed,
    totalAdditions: meta.additions,
    totalDeletions: meta.deletions,
  };
}

export interface PrSource {
  mode: "github" | "offline";
  reason?: string;
}

export function resolvePr(
  owner?: string,
  repo?: string,
  number?: number
): { pr: PullRequest | null; source: PrSource } {
  if (
    owner &&
    repo &&
    number &&
    (owner.toLowerCase() === "acme" && repo.toLowerCase() === "notes-search" && number === 42)
  ) {
    return { pr: getSamplePr(owner, repo, number), source: { mode: "offline" } };
  }
  if (hasGitHubCredentials() && owner && repo && number) {
    return { pr: null, source: { mode: "github" } };
  }
  return {
    pr: null,
    source: { mode: "offline", reason: "No GitHub token configured and not the sample PR." },
  };
}

export function getOfflinePr(): PullRequest | null {
  return getSamplePr();
}

export function getOfflinePrList(): typeof SAMPLE_PR_LIST {
  return SAMPLE_PR_LIST;
}