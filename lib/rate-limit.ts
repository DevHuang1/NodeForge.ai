interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 10);

// Per-isolate in-memory buckets. Serverless instances each keep their own
// counters — good enough to blunt abuse of expensive LLM endpoints without
// external infrastructure.
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Best-effort client IP behind Vercel/proxy headers; falls back to "anonymous". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("fly-client-ip")?.trim() ||
    "anonymous"
  );
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - bucket.count,
    retryAfterSec: 0,
  };
}

/**
 * Apply a fixed-window per-IP limit. Returns a 429 Response when the caller
 * is over budget, or null when the request may proceed.
 */
export function checkRateLimit(request: Request, scope: string): Response | null {
  const result = rateLimit(`${scope}:${clientIp(request)}`);
  if (result.allowed) return null;
  return Response.json(
    {
      error: `Too many requests. Limit is ${MAX_REQUESTS} per ${Math.round(WINDOW_MS / 1000)}s — try again shortly.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
