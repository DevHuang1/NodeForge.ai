import { SectionHeader } from "./SectionHeader";

interface NodeInfo {
  n: number;
  name: string;
  color: string;
  colorName: string;
  role: string;
  input: string;
  output: string;
  prevents: string;
  steps: string[];
  artifact: string;
}

const NODES: NodeInfo[] = [
  {
    n: 1,
    name: "Human Input",
    color: "#1e7a50",
    colorName: "Green",
    role: "Capture the raw task without prematurely rewriting it.",
    input: "User bug report, feature request, or code-change request",
    output: "Raw task record with an immutable request ID",
    prevents: "Losing the user's original intent through early paraphrasing",
    steps: ["Capture raw request exactly", "Record known metadata only", "List unresolved items"],
    artifact: "Raw Task Record",
  },
  {
    n: 2,
    name: "Query Expansion",
    color: "#2f5bd0",
    colorName: "Blue",
    role: "Convert ambiguity into an explicit specification.",
    input: "Raw task record",
    output:
      "System specification with assumptions, constraints, acceptance criteria, threat model, clarification questions",
    prevents: "Hallucinated requirements, hidden assumptions, incomplete scope",
    steps: ["Define scope + contracts", "Assumptions + acceptance criteria", "Edge cases + threat model"],
    artifact: "Explicit System Specification",
  },
  {
    n: 3,
    name: "Execution & Verification",
    color: "#6b3fc4",
    colorName: "Purple",
    role: "Generate an implementation and actively challenge it with tests.",
    input: "Explicit system specification",
    output: "Code patch, test cases, edge-case matrix, verification notes",
    prevents: "Syntax errors, untested branches, happy-path-only solutions",
    steps: ["Generate minimal implementation", "Build independent test matrix", "Map tests to criteria"],
    artifact: "Code + Test Matrix",
  },
  {
    n: 4,
    name: "Output Sanitization",
    color: "#b0760a",
    colorName: "Gold",
    role: "Make the response safe, clean, and traceable before delivery.",
    input: "Code patch, tests, verification notes, security rules",
    output: "Final code, test output, security findings, limitations, requirement-to-test trace",
    prevents: "Secret leakage, unsafe APIs, injection, confusing formatting, unsupported claims",
    steps: ["Syntax + completeness", "Security + secret scan", "Traceability + honesty"],
    artifact: "Sanitized Response",
  },
];

function Arrow() {
  return (
    <svg
      width="26"
      height="20"
      viewBox="0 0 26 20"
      className="mt-1 shrink-0 text-border"
      fill="none"
    >
      <line x1="0" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 10 L11 4.5 M18 10 L11 15.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StepList({ steps, color }: { steps: string[]; color: string }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {steps.map((s) => (
        <li key={s} className="flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="h-1 w-1 rounded-full" style={{ background: color }} />
          {s}
        </li>
      ))}
    </ul>
  );
}

export function ArchitectureFlow() {
  const selected = 2;

  return (
    <section id="architecture" className="border-y border-border bg-card/40">
      <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-10 sm:py-28">
        <SectionHeader
          eyebrow="Architecture"
          accent="#2f5bd0"
          title="Four nodes, one traceable chain"
          description="Each stage produces an explicit artifact that becomes the context for the next node, creating a chain from the human request to the final answer. When the quality gate fails, feedback returns only to the responsible node."
        />

        <div className="mt-16 overflow-x-auto pb-4">
          <div className="flex min-w-[1200px] items-stretch gap-5">
            {/* Start */}
            <div className="flex w-56 shrink-0 flex-col justify-center">
              <div className="rounded-2xl border border-node1/30 bg-node1/5 p-5 text-center">
                <p className="text-xs font-medium text-foreground">Human Input</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  raw task / bug description
                </p>
              </div>
            </div>
            <Arrow />

            {NODES.map((node) => (
              <div key={node.n} className="flex items-center gap-4">
                <div className="flex w-64 shrink-0 flex-col rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-sm">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold text-white"
                      style={{ background: node.color }}
                    >
                      {node.n}
                    </span>
                    <span className="text-sm font-medium leading-tight text-foreground">
                      {node.name}
                    </span>
                  </span>
                  <StepList steps={node.steps} color={node.color} />
                  <span
                    className="mt-4 w-fit rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: `${node.color}14`, color: node.color }}
                  >
                    {node.artifact}
                  </span>
                </div>
                <Arrow />
              </div>
            ))}

            {/* Quality gate */}
            <div className="flex w-48 shrink-0 flex-col items-center justify-center gap-3">
              <div className="flex h-24 w-24 rotate-45 items-center justify-center rounded-2xl border-2 border-gate/60 bg-gate/5">
                <span className="-rotate-45 text-center text-[10px] font-semibold leading-tight text-gate">
                  Pass
                  <br />
                  quality
                  <br />
                  gates?
                </span>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gate">
                Gate
              </span>
            </div>
            <Arrow />

            {/* Final */}
            <div className="flex w-56 shrink-0 flex-col justify-center">
              <div className="rounded-2xl border border-final/30 bg-final/5 p-5 text-center">
                <p className="text-xs font-medium text-foreground">Final response</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  clean code + tests + review report
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Revision controller */}
        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-dashed border-rev/50 bg-card p-7 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rev">
              Revision controller
            </p>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A failed gate routes targeted feedback to the responsible stage —
              never a blind restart.
            </p>
          </div>
          <div className="flex flex-1 flex-wrap gap-2.5 sm:justify-end">
            {[
              { label: "missing requirements", target: "Node 2", color: "#2f5bd0" },
              { label: "code / test defects", target: "Node 3", color: "#6b3fc4" },
              { label: "security / formatting", target: "Node 4", color: "#b0760a" },
            ].map((r) => (
              <span
                key={r.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs text-muted-foreground"
              >
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="text-rev">
                  <path d="M2 5 L14 5 M14 5 L9 1 M14 5 L9 9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
                </svg>
                {r.label}
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ background: r.color }}
                >
                  {r.target}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Detail panel — Node 2 as the example */}
        <div className="mt-12 grid gap-8 rounded-3xl border border-border bg-card p-8 sm:p-10 lg:grid-cols-[1fr_1.1fr] xl:p-12">
          <div>
            <div className="flex items-center gap-4">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold text-white"
                style={{ background: NODES[selected].color }}
              >
                {selected + 1}
              </span>
              <div>
                <h3 className="font-heading text-xl tracking-tight text-foreground">
                  {NODES[selected].name}
                </h3>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {NODES[selected].colorName} responsibility
                </p>
              </div>
            </div>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {NODES[selected].role}
            </p>
            <div className="mt-6 space-y-4 text-sm">
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Receives
                </p>
                <p className="mt-1.5 text-foreground">{NODES[selected].input}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Produces
                </p>
                <p className="mt-1.5 text-foreground">{NODES[selected].output}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Main failure prevented
                </p>
                <p className="mt-1.5 text-foreground">{NODES[selected].prevents}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-border bg-background p-7">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Node {selected + 1} — {NODES[selected].name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The demo below runs this node against a live model. Select a test
              case and press{" "}
              <span className="font-medium text-foreground">Run Pipeline</span>{" "}
              to watch each artifact generated in sequence — then challenge the
              result with the quality gate&apos;s targeted revision loop.
            </p>
            <div className="mt-auto pt-6">
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: NODES[selected].color }}
              >
                Try node {selected + 1} live
                <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}