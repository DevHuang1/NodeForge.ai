/**
 * Small shared utilities: clock, ids, atomic writes, PATH lookup, URL
 * credential stripping, and human-friendly formatting.
 */

import { promises as fs } from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";

// ── Clock ───────────────────────────────────────────────────────────────────

export interface Clock {
  now(): Date;
  /** Monotonic-ish milliseconds for durations. */
  monotonic(): number;
}

export const realClock: Clock = {
  now: () => new Date(),
  monotonic: () => Number(process.hrtime.bigint() / 1_000n) / 1000,
};

export function nowIso(clock: Clock = realClock): string {
  return clock.now().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export function shortHash(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

// ── Hashing ─────────────────────────────────────────────────────────────────

export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Canonical JSON with sorted object keys so equivalent objects hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

// ── Filesystem ──────────────────────────────────────────────────────────────

/** Write a file atomically: temp file in the same directory, then rename. */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${randomBytes(3).toString("hex")}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

export async function appendFileLine(filePath: string, line: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

/**
 * Resolve an executable name against PATH without spawning a process.
 * Returns the absolute path, or null when not found.
 */
export async function findExecutable(name: string): Promise<string | null> {
  if (name.includes(path.sep)) {
    try {
      await fs.access(name);
      return name;
    } catch {
      return null;
    }
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

// ── URLs and strings ────────────────────────────────────────────────────────

const CREDENTIAL_IN_URL = /(https?:\/\/)([^@\s/]+)@/g;

/** Strip user:password (and token) components from URLs before persisting. */
export function stripCredentialsFromUrl(url: string): string {
  return url.replace(CREDENTIAL_IN_URL, "$1");
}

export function truncate(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return { text, truncated: false };
  // Cut on a char boundary to avoid splitting UTF-8 sequences.
  let cut = maxBytes;
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut--;
  return { text: buf.subarray(0, cut).toString("utf8"), truncated: true };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}
