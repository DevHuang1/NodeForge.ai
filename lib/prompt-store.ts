import type { PromptOverrides } from "./types";

const STORAGE_KEY = "nodeforge-prompt-overrides-v1";

export function loadPromptOverrides(): PromptOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return {
      node2: parsed.node2,
      node3: parsed.node3,
      node4: parsed.node4,
      baseline: parsed.baseline,
    };
  } catch {
    return {};
  }
}

export function savePromptOverrides(overrides: PromptOverrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

export function clearPromptOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}