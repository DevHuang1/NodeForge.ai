import type { ProviderInfo } from "./types";

export interface ProviderConfig extends ProviderInfo {
  apiKey: string;
  appName?: string;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface LLMConfig {
  configured: boolean;
  providers: ProviderConfig[];
  priority: "o" | "f";
  defaultTemperature: number;
  maxTokens: number;
}

function cleanUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getProviders(): ProviderConfig[] {
  const list: ProviderConfig[] = [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const appName = process.env.NEXT_PUBLIC_SITE_NAME || "NodeForge.ai";

  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    list.push({
      name: "OpenRouter",
      apiKey: orKey,
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      siteUrl,
      appName,
    });
  }

  const flKey = process.env.FEATHERLESS_API_KEY;
  if (flKey) {
    list.push({
      name: "Featherless",
      apiKey: flKey,
      baseUrl: process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
      model:
        process.env.FEATHERLESS_MODEL ||
        "unsloth/Llama-3.3-70B-Instruct",
      siteUrl,
      appName,
    });
  }

  const oaiKey = process.env.OPENAI_API_KEY;
  if (oaiKey) {
    list.push({
      name: "OpenAI",
      apiKey: oaiKey,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
    });
  }

  // Reorder by priority flag: "f" puts Featherless first, "o" puts OpenRouter first.
  const priority = (process.env.LLM_PROVIDER_PRIORITY || "o").trim().toLowerCase();
  if (priority === "f") {
    const byName = (name: string) => list.find((p) => p.name === name);
    const fl = byName("Featherless");
    const or = byName("OpenRouter");
    const rest = list.filter((p) => p.name !== "Featherless" && p.name !== "OpenRouter");
    return [fl, or, ...rest].filter((p): p is ProviderConfig => Boolean(p));
  }
  return list;
}

export function getLLMConfig(): LLMConfig {
  const providers = getProviders();
  return {
    configured: providers.length > 0,
    providers,
    priority: (process.env.LLM_PROVIDER_PRIORITY || "o").trim().toLowerCase() as "o" | "f",
    defaultTemperature: Number(process.env.LLM_TEMPERATURE || 0.3),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 8192),
  };
}

export class LLMNotConfiguredError extends Error {
  constructor() {
    super(
      "No LLM provider is configured. Add OPENROUTER_API_KEY or FEATHERLESS_API_KEY to a local .env.local file to enable live model calls."
    );
    this.name = "LLMNotConfiguredError";
  }
}

interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  json?: boolean;
  model?: string;
  provider?: string;
}

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as Error & { status?: number }).status;
  if (status !== undefined && status !== 0) {
    return RETRYABLE_STATUS.has(status);
  }
  return /terminated|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|aborted|empty response|timeout|json|no json object/i.test(
    err.message
  );
}

async function requestProvider(
  provider: ProviderConfig,
  options: ChatOptions,
  maxTokens: number
): Promise<{ content: string; model: string; usage?: { input_tokens: number; output_tokens: number } }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
  };
  if (provider.siteUrl) headers["HTTP-Referer"] = provider.siteUrl;
  if (provider.appName) headers["X-Title"] = provider.appName;

  const body: Record<string, unknown> = {
    model: options.model ?? provider.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    temperature: clamp(options.temperature ?? getLLMConfig().defaultTemperature, 0, 1),
    max_tokens: maxTokens,
  };

  async function send(withJsonMode: boolean): Promise<Response> {
    const b = { ...body };
    if (withJsonMode) b.response_format = { type: "json_object" };
    return fetch(`${cleanUrl(provider.baseUrl)}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(240_000),
    });
  }

  let res = await send(Boolean(options.json));
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    res = await send(false);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `${provider.name} request failed (${res.status}): ${detail.slice(0, 500)}`
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error(`${provider.name} returned an empty response.`);
    (err as Error & { status?: number }).status = 0;
    throw err;
  }
  const usage =
    data.usage && (data.usage.prompt_tokens || data.usage.completion_tokens)
      ? {
          input_tokens: data.usage.prompt_tokens ?? 0,
          output_tokens: data.usage.completion_tokens ?? 0,
        }
      : {
          input_tokens: Math.round(options.system.length / 4 + options.user.length / 4),
          output_tokens: Math.round(content.length / 4),
        };
  return {
    content,
    model: options.model ?? provider.model,
    usage,
  };
}

/** Extract a JSON object from model output that may include prose or markdown fences. */
export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  if (start === -1) {
    const err = new Error("No JSON object found in model output.");
    (err as Error & { status?: number }).status = 0;
    throw err;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < withoutFences.length; i++) {
    const ch = withoutFences[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(withoutFences.slice(start, i + 1));
      }
    }
  }
  if (depth > 0) {
    const candidate = withoutFences.slice(start) + "}".repeat(depth);
    try {
      return JSON.parse(candidate);
    } catch {
      const err = new Error(
        "Unbalanced JSON in model output (likely truncated)."
      );
      (err as Error & { status?: number }).status = 0;
      throw err;
    }
  }
  const err = new Error("Unbalanced JSON in model output.");
  (err as Error & { status?: number }).status = 0;
  throw err;
}

/**
 * Run a chat completion against the configured providers, in order, falling
 * back to the next provider when one fails. Coerces the result into a JSON
 * object when `json` is true.
 */
export async function chatCompletion(
  options: ChatOptions & { json: true }
): Promise<ChatResult & { json: unknown }>;
export async function chatCompletion(
  options: ChatOptions & { json?: false }
): Promise<ChatResult>;
export async function chatCompletion(
  options: ChatOptions
): Promise<ChatResult & { json?: unknown }> {
  const config = getLLMConfig();
  const providers = config.providers;
  if (!providers.length) {
    throw new LLMNotConfiguredError();
  }

  // If a specific provider is requested, try it first. The model override is
  // only honored for that provider — fallback providers use their own model so
  // a model ID from one host is never sent to another.
  const requestedProvider = options.provider?.trim();
  const ordered = requestedProvider
    ? [
        ...providers.filter((p) => p.name === requestedProvider),
        ...providers.filter((p) => p.name !== requestedProvider),
      ]
    : providers;

  const errors: string[] = [];
  for (const provider of ordered) {
    let lastError: unknown;
    const effectiveOptions: ChatOptions =
      requestedProvider && provider.name !== requestedProvider
        ? { ...options, model: undefined }
        : options;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await requestProvider(
          provider,
          effectiveOptions,
          config.maxTokens
        );
        if (options.json) {
          try {
            return {
              content: result.content,
              provider: provider.name,
              model: result.model,
              usage: result.usage,
              json: extractJson(result.content),
            };
          } catch (err) {
            lastError = err;
            if (attempt === MAX_ATTEMPTS || !isRetryableError(err)) break;
            await sleep(attempt * 1000);
            continue;
          }
        }
        return {
          content: result.content,
          provider: provider.name,
          model: result.model,
          usage: result.usage,
        };
      } catch (err) {
        lastError = err;
        if (attempt === MAX_ATTEMPTS || !isRetryableError(err)) break;
        await sleep(attempt * 1000);
      }
    }
    errors.push(`${provider.name}: ${(lastError as Error).message}`);
  }
  throw new Error(`All LLM providers failed.\n${errors.join("\n")}`);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}