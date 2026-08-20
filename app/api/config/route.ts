import { getLLMConfig } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET() {
  const config = getLLMConfig();
  const providers = config.providers.map((provider) => {
    const { apiKey, ...rest } = provider;
    void apiKey;
    return rest;
  });
  return Response.json(
    { ...config, providers },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}