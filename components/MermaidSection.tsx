"use client";

import { useEffect, useRef, useState } from "react";
import { MERMAID_DETAILED, MERMAID_SIMPLIFIED } from "@/lib/mermaid";
import { SectionHeader } from "./SectionHeader";

export function MermaidSection() {
  const [tab, setTab] = useState<"detailed" | "simplified">("detailed");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const source = tab === "detailed" ? MERMAID_DETAILED : MERMAID_SIMPLIFIED;

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      setError(null);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "#0b0e14",
            primaryColor: "#151a26",
            primaryTextColor: "#e7eaf2",
            primaryBorderColor: "#2e3850",
            lineColor: "#3b455e",
            secondaryColor: "#10141d",
            tertiaryColor: "#151a26",
          },
        });
        const { svg } = await mermaid.render(`mmd-${tab}`, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [tab, source]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function download() {
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "detailed" ? "agentic_pipeline_detailed.mmd" : "agentic_pipeline_simplified.mmd";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPng() {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      const svg = containerRef.current.querySelector("svg");
      if (!svg) throw new Error("Diagram not rendered yet.");
      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.decoding = "sync";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to rasterize SVG."));
        img.src = `data:image/svg+xml;base64,${svg64}`;
      });
      const rect = svg.getBoundingClientRect();
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable.");
      ctx.fillStyle = "#0b0e14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("PNG encoding failed.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = tab === "detailed" ? "agentic_pipeline_detailed.png" : "agentic_pipeline_simplified.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section id="flowchart" className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-10 sm:py-28">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <SectionHeader
              eyebrow="Flowchart"
              accent="#0e7f86"
              title="Editable diagram source"
              description="The flowchart is rendered live from editable Mermaid source — the spec of record for the submission. The rendered SVG is the visual; the source is reproducible and version-controllable."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-border bg-muted px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
            >
              {copied ? "Copied" : "Copy .mmd"}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-lg border border-border bg-muted px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
            >
              Download .mmd
            </button>
            <button
              type="button"
              onClick={() => void downloadPng()}
              disabled={exporting}
              className="rounded-lg bg-node2 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Rendering…" : "Download PNG"}
            </button>
          </div>
        </div>

        <div className="mb-5 flex gap-2.5">
          {(
            [
              ["detailed", "Detailed (submission)"],
              ["simplified", "Simplified"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                tab === key
                  ? "border-border bg-muted text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-input"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mermaid-scroll w-full overflow-x-auto rounded-2xl border border-border bg-card p-6">
          {error ? (
            <p className="p-4 text-sm text-gate">
              Could not render diagram: {error}
            </p>
          ) : (
            <div ref={containerRef} className="flex justify-center" />
          )}
        </div>

        <div className="mt-6 w-full rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Mermaid source ({tab})
          </p>
          <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-[#0a0d13] p-4 font-mono text-xs leading-relaxed text-[#b7c0d6]">
            {source}
          </pre>
        </div>

        <p className="mt-4 text-xs text-muted-foreground/70">
          Visual conventions: green = human input · blue = analysis · purple =
          generation · gold = sanitization · red = quality gate · teal = final
          response · gray dashed = targeted revision loop. Color never carries
          information alone; every group also has a text label.
        </p>
      </div>
    </section>
  );
}