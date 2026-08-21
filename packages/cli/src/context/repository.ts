/**
 * Target parsing and the local source provider.
 *
 * Accepts a local directory, a git ref (branch/tag/SHA) resolved against the
 * current repository, or defers GitHub PR URLs to the GitHub provider.
 * Refs are verified in an isolated temporary worktree so scanning never
 * mutates the user's checkout.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import type {
  FileSnapshot,
  RepositorySnapshot,
  ReviewTarget,
  SourceProvider,
} from "../core/contracts.js";
import { ErrorCode, EngineError } from "../core/errors.js";
import type { ExecutionPolicy } from "../core/policy.js";
import {
  isIgnoredPath,
  looksBinaryByExtension,
  sniffBinary,
} from "./files.js";
import { findExecutable, sha256Hex, stripCredentialsFromUrl } from "../utils/misc.js";

const GIT_TIMEOUT_MS = 30_000;

export function parseTarget(
  input: string,
  cwd: string
): ReviewTarget {
  const prMatch = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(
    input.trim()
  );
  if (prMatch) {
    return {
      kind: "pull_request",
      url: `https://github.com/${prMatch[1]}/${prMatch[2]}/pull/${prMatch[3]}`,
      owner: prMatch[1]!,
      repo: prMatch[2]!,
      number: Number(prMatch[3]),
    };
  }

  const candidate = path.resolve(cwd, input);
  return { kind: "local", path: candidate };
}

/**
 * If `input` is not an existing directory, treat it as a git ref inside
 * `cwd`. Returns null when it cannot be a ref either.
 */
export async function resolveRefTarget(input: string, cwd: string): Promise<ReviewTarget | null> {
  try {
    await fs.access(path.resolve(cwd, input));
    return null; // exists on disk; not a ref
  } catch {
    // fall through to ref check
  }
  try {
    await git(cwd, ["rev-parse", "--verify", `${input}^{commit}`]);
    return { kind: "local", path: path.resolve(cwd), ref: input };
  } catch {
    return null;
  }
}

interface GitResult {
  stdout: string;
}

function git(cwd: string, args: string[], signal?: AbortSignal): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, signal, maxBuffer: 64 * 1024 * 1024, shell: false },
      (error, stdout) => {
        if (error) {
          reject(new Error(`git ${args[0] ?? ""} failed: ${(error as Error).message.split("\n")[0]}`));
        } else {
          resolve({ stdout });
        }
      }
    );
  });
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(dir, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export class LocalSourceProvider implements SourceProvider {
  id = "local-git";

  async load(
    target: Extract<ReviewTarget, { kind: "local" }>,
    policy: ExecutionPolicy,
    signal: AbortSignal
  ): Promise<{ snapshot: RepositorySnapshot; cleanup: () => Promise<void> }> {
    let root = target.path;
    let worktreeDir: string | null = null;

    if (!(await isGitRepo(root))) {
      throw new EngineError(
        ErrorCode.InvalidTarget,
        `"${target.path}" is not inside a git working tree. nodeforge verifies git repositories.`
      );
    }

    if (target.ref) {
      worktreeDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodeforge-ref-"));
      try {
        await git(root, ["worktree", "add", "--detach", worktreeDir, target.ref], signal);
      } catch (error) {
        await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
        throw new EngineError(
          ErrorCode.InvalidTarget,
          `Could not create a worktree for ref "${target.ref}". Fetch the branch first. (${(error as Error).message})`
        );
      }
      root = worktreeDir;
    }

    const cleanup = async (): Promise<void> => {
      if (worktreeDir) {
        await git(target.path, ["worktree", "remove", "--force", worktreeDir]).catch(() => {});
        await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
      }
    };

    signal.throwIfAborted();

    const notes: string[] = [];
    const [commitSha, remoteRaw] = await Promise.all([
      git(root, ["rev-parse", "HEAD"], signal)
        .then((r) => r.stdout.trim())
        .catch(() => null),
      git(root, ["remote", "get-url", "origin"], signal)
        .then((r) => r.stdout.trim())
        .catch(() => null),
    ]);

    const listed = await git(
      root,
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      signal
    );
    const allPaths = listed.stdout
      .split("\u0000")
      .filter((p) => p.length > 0 && !isIgnoredPath(p));

    const truncated = allPaths.length > policy.maxFiles;
    const boundedPaths = truncated ? allPaths.slice(0, policy.maxFiles) : allPaths;
    if (truncated) {
      notes.push(
        `File list truncated at policy limit of ${policy.maxFiles} files (${allPaths.length} found).`
      );
    }

    const files: FileSnapshot[] = [];
    for (const rel of boundedPaths) {
      signal.throwIfAborted();
      const abs = path.join(root, rel);
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue; // deleted or broken symlink
      }
      if (!stat.isFile()) continue;

      const binary = looksBinaryByExtension(rel);
      if (stat.size > policy.maxFileBytes) {
        files.push({
          path: rel,
          sizeBytes: stat.size,
          contentHash: `oversize:${sha256Hex(rel)}`,
          binary: true,
        });
        continue;
      }
      let content: string | undefined;
      try {
        const buf = await fs.readFile(abs);
        const sample = buf.subarray(0, 8192).toString("utf8");
        const actuallyBinary = binary || sniffBinary(sample);
        content = actuallyBinary ? undefined : buf.toString("utf8");
        files.push({
          path: rel,
          sizeBytes: stat.size,
          contentHash: sha256Hex(buf),
          binary: actuallyBinary,
          ...(content !== undefined ? { content } : {}),
        });
      } catch {
        files.push({
          path: rel,
          sizeBytes: stat.size,
          contentHash: `unreadable:${sha256Hex(rel)}`,
          binary: true,
        });
      }
    }

    const snapshot: RepositorySnapshot = {
      root,
      ref: target.ref ?? null,
      commitSha,
      remoteUrl: remoteRaw ? stripCredentialsFromUrl(remoteRaw) : null,
      pullRequest: null,
      changedFiles: files,
      fileCount: files.length,
      truncated,
      notes,
    };
    void policy;
    return { snapshot, cleanup };
  }
}

/** Re-export for doctor command reuse. */
export { findExecutable, git as execGit, isGitRepo };
