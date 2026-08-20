"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { JsonView } from "./JsonView";

type Primitive = string | number | boolean | null;

interface DiffRow {
  path: string;
  kind: "changed" | "added" | "removed";
  before?: Primitive | string;
  after?: Primitive | string;
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === "object" && v !== null;
}

function prim(v: unknown): Primitive | string {
  if (isContainer(v)) return JSON.stringify(v);
  if (v === undefined) return "undefined";
  return v as Primitive;
}

function diffObjects(
  before: unknown,
  after: unknown,
  path: string,
  rows: DiffRow[]
): void {
  if (!isContainer(before) || !isContainer(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({ path, kind: "changed", before: prim(before), after: prim(after) });
    }
    return;
  }

  const beforeKeys = new Set(Object.keys(before as object));
  const afterKeys = new Set(Object.keys(after as object));

  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      rows.push({
        path: `${path}.${key}`,
        kind: "removed",
        before: prim((before as Record<string, unknown>)[key]),
      });
    } else {
      diffObjects(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        `${path}.${key}`,
        rows
      );
    }
  }

  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      rows.push({
        path: `${path}.${key}`,
        kind: "added",
        after: prim((after as Record<string, unknown>)[key]),
      });
    }
  }
}

const KIND_STYLES: Record<DiffRow["kind"], { label: string; cls: string }> = {
  changed: { label: "~", cls: "bg-node4/10 text-node4" },
  added: { label: "+", cls: "bg-final/10 text-final" },
  removed: { label: "−", cls: "bg-gate/10 text-gate" },
};

function truncate(s: string, max = 220): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const [open, setOpen] = useState(false);
  const rows: DiffRow[] = [];
  diffObjects(before, after, "$", rows);

  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Artifact diff
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {rows.length} change{rows.length === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border p-3">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No structural changes detected.</p>
          ) : (
            rows.map((row) => {
              const s = KIND_STYLES[row.kind];
              return (
                <div key={row.path} className="flex gap-2 text-xs">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${s.cls}`}
                  >
                    {s.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] text-muted-foreground">{row.path}</p>
                    {row.before !== undefined && (
                      <p className="text-muted-foreground/80">
                        <span className="text-gate">before:</span>{" "}
                        <span className="font-mono">{truncate(String(row.before))}</span>
                      </p>
                    )}
                    {row.after !== undefined && (
                      <p className="text-foreground/80">
                        <span className="text-final">after:</span>{" "}
                        <span className="font-mono">{truncate(String(row.after))}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div className="pt-2">
            <JsonView data={{ before, after }} />
          </div>
        </div>
      )}
    </div>
  );
}