"use client";

import { useEffect, useState } from "react";
import { NODE_PROMPTS, BASELINE_SYSTEM_PROMPT } from "@/lib/prompts";
import { loadPromptOverrides, savePromptOverrides } from "@/lib/prompt-store";
import type { PromptOverrides } from "@/lib/types";
import { JsonView } from "./JsonView";
import { SectionHeader } from "./SectionHeader";

interface PromptTab {
  id: string;
  key: keyof PromptOverrides;
  name: string;
  color: string;
  defaultPrompt: string;
  defaultSchema: string | null;
  validation: string;
  role: string;
}

const TABS: PromptTab[] = [
  ...NODE_PROMPTS.map((p) => ({
    id: `node${p.id}`,
    key: `node${p.id}` as keyof PromptOverrides,
    name: p.name,
    color: p.color,
    defaultPrompt: p.systemPrompt,
    defaultSchema: p.schema,
    validation: p.validation,
    role: p.role,
  })),
  {
    id: "baseline",
    key: "baseline",
    name: "Single-prompt baseline",
    color: "#0e7f86",
    defaultPrompt: BASELINE_SYSTEM_PROMPT,
    defaultSchema: null,
    validation:
      "Baseline runs in one shot; any assumption it makes should be stated explicitly.",
    role: "The control condition: one carefully written prompt, no intermediate artifacts.",
  },
];

export function PromptLibrary() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<PromptOverrides>(() => loadPromptOverrides());
  const [dirty, setDirty] = useState(false);
  const [storedOverrides, setStoredOverrides] = useState<PromptOverrides>({});

  useEffect(() => {
    // Hydrate overrides from localStorage after mount (client-only).
    const overrides = loadPromptOverrides();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side hydration from external storage
    setStoredOverrides(overrides);
    setDrafts(overrides);
  }, []);

  const tab = TABS[active];

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const effectivePrompt =
    storedOverrides[tab.key]?.trim() || tab.defaultPrompt;
  const isOverridden = Boolean(storedOverrides[tab.key]?.trim());
  const draftValue = drafts[tab.key] ?? "";

  function saveAll() {
    savePromptOverrides(drafts);
    setStoredOverrides(drafts);
    setDirty(false);
    setEditing(false);
  }

  function resetTab() {
    const next = { ...drafts };
    delete next[tab.key];
    setDrafts(next);
    setDirty(true);
  }

  return (
    <section id="prompts" className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-10 sm:py-28">
        <div className="mb-8">
          <SectionHeader
            eyebrow="Prompt Library"
            accent="#b0760a"
            title="Reusable node system prompts"
            description="These are the exact prompt contracts the live demo uses. Each node is a self-contained system prompt with an input contract, an output schema, and explicit failure behavior — reusable in any agentic setup. The demo feeds each node the previous node's artifact and appends quality-gate feedback during revisions. You can edit any prompt here and the live demo picks up your changes."
          />
        </div>

        {isOverridden && !editing && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-lg border border-node4/50 bg-node4/10 px-3 py-1.5 text-xs text-node4">
            Custom prompt active — the live demo uses your edited version.
          </p>
        )}

        <div className="flex flex-wrap gap-2.5">
          {TABS.map((p, idx) => {
            const activeOverride = Boolean(storedOverrides[p.key]?.trim());
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(idx)}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  active === idx
                    ? "border-border bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-input"
                }`}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                />
                {p.id === "baseline" ? "Baseline" : `Node ${p.id.replace("node", "")}`} · {p.name}
                {activeOverride && (
                  <span className="ml-1.5 rounded-full bg-node4/10 px-1.5 py-0.5 text-[9px] font-bold text-node4">
                    edited
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">
                  System prompt — {tab.id === "baseline" ? "Baseline" : `Node ${tab.id.replace("node", "")}`}: {tab.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tab.role}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={resetTab}
                      className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                    >
                      Restore default
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveAll}
                      disabled={!dirty}
                      className="rounded-lg bg-node2 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {dirty ? "Save changes" : "Saved"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => copy(effectivePrompt, "system")}
                      className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                    >
                      {copied === "system" ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setDirty(false);
                      }}
                      className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <textarea
                value={draftValue}
                onChange={(e) => {
                  setDrafts((d) => ({ ...d, [tab.key]: e.target.value }));
                  setDirty(true);
                }}
                rows={22}
                className="mt-4 w-full rounded-xl border border-border bg-[#0a0d13] p-4 font-mono text-xs leading-relaxed text-[#d4d7e0] outline-none focus:border-input"
              />
            ) : (
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-[#0a0d13] p-4 font-mono text-xs leading-relaxed text-[#d4d7e0]">
                {effectivePrompt}
              </pre>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {tab.defaultSchema ? "Output schema" : "Response contract"}
                </h3>
                {tab.defaultSchema && (
                  <button
                    type="button"
                    onClick={() => copy(tab.defaultSchema!, "schema")}
                    className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                  >
                    {copied === "schema" ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              <div className="mt-3">
                {tab.defaultSchema ? (
                  <JsonView
                    data={(() => {
                      try {
                        return JSON.parse(tab.defaultSchema!);
                      } catch {
                        return { note: "schema shown as text" };
                      }
                    })()}
                  />
                ) : (
                  <p className="rounded-xl bg-muted p-5 text-xs leading-relaxed text-muted-foreground">
                    {tab.defaultPrompt}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold">Node validation</h3>
              <p className="mt-3 rounded-xl bg-muted p-5 text-xs leading-relaxed text-muted-foreground">
                {tab.validation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}