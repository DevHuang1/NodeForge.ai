import { runBaseline } from "@/lib/pipeline";
import { LLMNotConfiguredError } from "@/lib/llm";
import { checkRateLimit } from "@/lib/rate-limit";
import { TEST_CASES } from "@/lib/test-cases";
import type { BaselineRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "baseline");
  if (limited) return limited;

  let body: BaselineRequest;
  try {
    body = (await request.json()) as BaselineRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawRequest =
    TEST_CASES.find((t) => t.id === body.requestId)?.rawRequest ?? body.rawRequest;
  if (!rawRequest) {
    return Response.json({ error: "Unknown test case." }, { status: 400 });
  }

  const requestId = `${body.requestIdPrefix}-${body.requestId}`;
  try {
    const { result, usage } = await runBaseline(
      requestId,
      rawRequest,
      Number(body.temperature ?? 0.3),
      body.promptOverride,
      body.model,
      body.provider
    );
    return Response.json({ ...result, usage });
  } catch (err) {
    if (err instanceof LLMNotConfiguredError) {
      return Response.json(
        { error: err.message, code: "LLM_NOT_CONFIGURED" },
        { status: 400 }
      );
    }
    console.error("[baseline] failed", err);
    return Response.json(
      { error: (err as Error).message || "Unexpected baseline error." },
      { status: 500 }
    );
  }
}