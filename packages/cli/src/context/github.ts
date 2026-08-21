/**
 * GitHub pull-request source provider.
 *
 * Credentials are read ONLY from environment variables (NODEFORGE_GITHUB_TOKEN
 * or GITHUB_TOKEN), are never written to disk or logs, and are stripped from
 * any persisted URL. PR bodies are intentionally not stored: they are
 * untrusted content and a common secret-leak vector.
 */

import type {
  FileSnapshot,
  PullRequestMeta,
  RepositorySnapshot,
  ReviewTarget,
  SourceProvider,
} from "../core/contracts.js";
import { ErrorCode, EngineError } from "../core/errors.js";
import type { ExecutionPolicy } from "../core/policy.js";
import { isIgnoredPath, looksBinaryByExtension, sniffBinary } from "./files.js";
import { sha256Hex } from "../utils/misc.js";

const API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONTENT_BYTES = 512 * 1024;

/** Resolve the token for this request; never persisted anywhere. */
export function resolveGitHubToken(): string | null {
  const direct = process.env.NODEFORGE_GITHUB_TOKEN?.trim();
  if (direct) return direct;
  const fallback = process.env.GITHUB_TOKEN?.trim();
  return fallback ? fallback : null;
}

export function hasGitHubCredentials(): boolean {
  return resolveGitHubToken() !== null;
}

interface GhPull {
  number: number;
  title: string | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
}

interface GhFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
}

interface GhContent {
  content?: string;
  encoding?: string;
}

async function ghJson<T>(pathName: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${pathName}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "nodeforge-cli",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new EngineError(
      ErrorCode.ProviderUnavailable,
      `GitHub API unreachable: ${(error as Error).message}`
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    if (response.status === 401 || response.status === 403) {
      throw new EngineError(
        ErrorCode.ProviderUnavailable,
        `GitHub rejected credentials (HTTP ${response.status}). Check NODEFORGE_GITHUB_TOKEN / GITHUB_TOKEN scope and expiry.`
      );
    }
    if (response.status === 404) {
      throw new EngineError(
        ErrorCode.InvalidTarget,
        `GitHub resource not found (HTTP 404)${detail ? `: ${detail}` : "."}`
      );
    }
    throw new EngineError(
      ErrorCode.ProviderUnavailable,
      `GitHub request failed (HTTP ${response.status}).`
    );
  }
  return (await response.json()) as T;
}

async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  token: string
): Promise<string | null> {
  try {
    const data = await ghJson<GhContent>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
      token
    );
    if (!data.content || data.encoding !== "base64") return null;
    const buf = Buffer.from(data.content, "base64");
    if (buf.length > MAX_CONTENT_BYTES) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

export class GitHubSourceProvider implements SourceProvider {
  id = "github";

  async load(
    target: Extract<ReviewTarget, { kind: "pull_request" }>,
    policy: ExecutionPolicy,
    signal: AbortSignal
  ): Promise<{ snapshot: RepositorySnapshot; cleanup: () => Promise<void> }> {
    const token = resolveGitHubToken();
    if (!token) {
      throw new EngineError(
        ErrorCode.ProviderUnavailable,
        "No GitHub credentials configured. Set NODEFORGE_GITHUB_TOKEN (or GITHUB_TOKEN); tokens are read per request and never stored."
      );
    }

    const meta = await ghJson<GhPull>(
      `/repos/${target.owner}/${target.repo}/pulls/${target.number}`,
      token
    );
    const ghFiles = await ghJson<GhFile[]>(
      `/repos/${target.owner}/${target.repo}/pulls/${target.number}/files?per_page=100`,
      token
    );

    signal.throwIfAborted();

    const notes: string[] = [];
    const truncated = ghFiles.length > policy.maxFiles;
    const bounded = truncated ? ghFiles.slice(0, policy.maxFiles) : ghFiles;
    if (truncated) {
      notes.push(`PR file list truncated at ${policy.maxFiles} of ${ghFiles.length} files.`);
    }

    const files: FileSnapshot[] = [];
    for (const f of bounded) {
      signal.throwIfAborted();
      if (isIgnoredPath(f.filename)) continue;
      if (f.status === "removed") {
        files.push({
          path: f.filename,
          sizeBytes: 0,
          contentHash: `removed:${sha256Hex(f.filename)}`,
          binary: true,
        });
        continue;
      }
      const raw = await fetchFileContent(target.owner, target.repo, f.filename, meta.head.sha, token);
      if (raw === null) {
        notes.push(`Content unavailable for ${f.filename}; scanned metadata only.`);
        files.push({
          path: f.filename,
          sizeBytes: -1,
          contentHash: `unavailable:${sha256Hex(f.filename)}`,
          binary: true,
        });
        continue;
      }
      const binary = looksBinaryByExtension(f.filename) || sniffBinary(raw.slice(0, 8192));
      files.push({
        path: f.filename,
        sizeBytes: Buffer.byteLength(raw, "utf8"),
        contentHash: sha256Hex(raw),
        binary,
        ...(binary ? {} : { content: raw }),
      });
    }

    const pullRequest: PullRequestMeta = {
      owner: target.owner,
      repo: target.repo,
      number: meta.number,
      title: meta.title ?? "",
      url: meta.html_url,
      headRef: meta.head.ref,
      baseRef: meta.base.ref,
      headSha: meta.head.sha,
      baseSha: meta.base.sha,
    };

    const snapshot: RepositorySnapshot = {
      root: null,
      ref: meta.head.ref,
      commitSha: meta.head.sha,
      remoteUrl: `https://github.com/${target.owner}/${target.repo}`,
      pullRequest,
      changedFiles: files,
      fileCount: files.length,
      truncated,
      notes,
    };
    return { snapshot, cleanup: async () => {} };
  }
}
