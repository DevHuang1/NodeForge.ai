import { runNode2, runNode3, runNode4 } from "@/lib/pipeline";
import { LLMNotConfiguredError } from "@/lib/llm";
import { TEST_CASES } from "@/lib/test-cases";
import type { RunNodeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: RunNodeRequest;
  try {
    body = (await request.json()) as RunNodeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawRequest =
    TEST_CASES.find((t) => t.id === body.requestId)?.rawRequest ?? body.rawRequest;
  if (!rawRequest) {
    return Response.json({ error: "Unknown test case." }, { status: 400 });
  }

  if (!body.artifacts?.node1 && body.node !== 2) {
    return Response.json(
      { error: "Node 1 artifact is required before this node can run." },
      { status: 400 }
    );
  }
  if (body.node >= 3 && !body.artifacts?.node2) {
    return Response.json(
      { error: "Node 2 artifact is required before Node 3 can run." },
      { status: 400 }
    );
  }
  if (body.node >= 4 && !body.artifacts?.node3) {
    return Response.json(
      { error: "Node 3 artifact is required before Node 4 can run." },
      { status: 400 }
    );
  }

  const requestId = `${body.requestIdPrefix}-${body.requestId}`;
  const temperature = Number(body.temperature ?? 0.3);
  const overrides = body.promptOverrides ?? {};

  try {
    if (body.node === 2) {
      const { artifact, usage } = await runNode2(
        requestId,
        body.artifacts.node1!,
        body.feedback ?? [],
        temperature,
        overrides.node2,
        body.model,
        body.provider
      );
      return Response.json({ node: 2, artifact, usage });
    }
    if (body.node === 3) {
      const { artifact, usage } = await runNode3(
        requestId,
        body.artifacts.node1!,
        body.artifacts.node2!,
        body.feedback ?? [],
        temperature,
        body.injectDefect,
        overrides.node3,
        body.model,
        body.provider
      );
      return Response.json({ node: 3, artifact, usage });
    }
    const { artifact, usage } = await runNode4(
      requestId,
      body.artifacts.node1!,
      body.artifacts.node2!,
      body.artifacts.node3!,
      body.feedback ?? [],
      temperature,
      overrides.node4,
      body.model,
      body.provider
    );
    return Response.json({ node: 4, artifact, usage });
  } catch (err) {
    if (err instanceof LLMNotConfiguredError) {
      return Response.json(
        { error: err.message, code: "LLM_NOT_CONFIGURED" },
        { status: 400 }
      );
    }
    console.error(`[pipeline/run] node ${body.node} failed`, err);
    return Response.json(
      { error: (err as Error).message || "Unexpected pipeline error." },
      { status: 500 }
    );
  }
}