import { promises as fs } from "fs";
import path from "path";
import type { AuditEvent, ReviewRun, ReviewRunSummary } from "./types";

interface StoreData {
  runs: Record<string, ReviewRun>;
  audit: AuditEvent[];
}

function emptyStore(): StoreData {
  return { runs: {}, audit: [] };
}

const DATA_DIR = process.env.NODEFORGE_DATA_DIR || path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

let memory: StoreData | null = null;
let cache: StoreData | null = null;
let useFile = true;
let writeQueue: Promise<void> = Promise.resolve();

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<StoreData> {
  if (cache) return cache;
  if (useFile) {
    try {
      const raw = await fs.readFile(STORE_FILE, "utf8");
      cache = JSON.parse(raw) as StoreData;
      return cache;
    } catch {
      useFile = false;
      memory = emptyStore();
      return memory;
    }
  }
  if (!memory) memory = emptyStore();
  return memory;
}

async function persist(data: StoreData): Promise<void> {
  if (!useFile) return;
  const task = (async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
      await fs.rename(tmp, STORE_FILE);
    } catch {
      useFile = false;
      memory = data;
    }
  })();
  writeQueue = writeQueue.then(() => task);
  await writeQueue;
}

export async function saveReviewRun(run: ReviewRun): Promise<void> {
  const data = await load();
  data.runs[run.id] = run;
  cache = data;
  await persist(data);
}

export async function getReviewRun(id: string): Promise<ReviewRun | null> {
  const data = await load();
  return data.runs[id] ?? null;
}

export interface RunFilters {
  repo?: string;
  prNumber?: string;
  status?: string;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function summarize(run: ReviewRun): ReviewRunSummary {
  const severity = run.deterministicFindings.concat(run.modelFindings);
  return {
    id: run.id,
    owner: run.owner,
    repo: run.repo,
    prNumber: run.prNumber,
    title: run.title,
    status: run.status,
    currentStage: run.currentStage,
    headSha: run.headSha,
    findingsCount: severity.length,
    offline: run.offline,
    provider: run.provider,
    durationMs: run.durationMs,
    createdAt: run.createdAt,
  };
}

export async function listReviewRuns(filters: RunFilters = {}): Promise<ReviewRunSummary[]> {
  const data = await load();
  let runs = Object.values(data.runs);
  if (filters.repo) {
    runs = runs.filter((r) => r.repo.toLowerCase().includes((filters.repo ?? "").toLowerCase()));
  }
  if (filters.prNumber) runs = runs.filter((r) => String(r.prNumber) === filters.prNumber);
  if (filters.status) runs = runs.filter((r) => r.status === filters.status);
  if (filters.severity) {
    runs = runs.filter((r) =>
      r.deterministicFindings.concat(r.modelFindings).some((f) => f.severity === filters.severity)
    );
  }
  if (filters.dateFrom) runs = runs.filter((r) => r.createdAt >= (filters.dateFrom ?? ""));
  if (filters.dateTo) runs = runs.filter((r) => r.createdAt <= (filters.dateTo ?? ""));
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs.slice(0, filters.limit ?? 50).map(summarize);
}

export async function deleteReviewRun(id: string): Promise<void> {
  const data = await load();
  delete data.runs[id];
  cache = data;
  await persist(data);
}

export async function appendAuditEvent(event: Omit<AuditEvent, "id" | "at">): Promise<AuditEvent> {
  const data = await load();
  const full: AuditEvent = { ...event, id: uid(), at: new Date().toISOString() };
  data.audit.push(full);
  if (data.audit.length > 5000) data.audit = data.audit.slice(-5000);
  cache = data;
  await persist(data);
  return full;
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const data = await load();
  return data.audit.slice(-limit).reverse();
}

export function newRunId(): string {
  return `run-${uid()}`;
}

export async function resetStore(): Promise<void> {
  cache = null;
  memory = emptyStore();
}