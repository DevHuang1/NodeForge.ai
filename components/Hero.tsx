"use client";

import { motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const NODES = [
  { n: 1, name: "Human Input", color: "#1e7a50", desc: "Preserve the request exactly as entered" },
  { n: 2, name: "Query Expansion", color: "#2f5bd0", desc: "Turn ambiguity into an explicit specification" },
  { n: 3, name: "Execution & Verification", color: "#6b3fc4", desc: "Code plus independent, mapped tests" },
  { n: 4, name: "Output Sanitization", color: "#b0760a", desc: "Syntax, security and traceability gate" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(720px 320px at 15% -5%, rgba(47,91,208,0.10), transparent 60%), radial-gradient(720px 340px at 90% 5%, rgba(107,63,196,0.08), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[1400px] px-6 pb-24 pt-20 sm:px-10 sm:pb-32 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-4xl"
        >
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground">
            Track 2 · ML Prompt Engineering · Interactive submission
          </p>
          <h1 className="font-heading text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Agentic code review,
            <br />
            <span className="italic text-muted-foreground">without the guesswork.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            One prompt cannot be analyst, engineer, tester and security reviewer
            at once. NodeForge splits those jobs across four nodes — each
            producing an inspectable artifact — so a single ambiguous request
            becomes a verified, sanitized, auditable answer.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Thesis:</span>{" "}
            structured context refinement creates inspectable intermediate
            contracts, targeted correction, and evidence that a final answer has
            been checked against requirements and risks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#demo">
                Run the pipeline live
                <ArrowDown />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#architecture">Explore the architecture</a>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15, ease: "easeOut" }}
          className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {NODES.map((node, i) => (
            <motion.div
              key={node.n}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
              className="group rounded-2xl border border-border bg-card p-7 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
                  style={{ background: node.color }}
                >
                  {node.n}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {node.name}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {node.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}