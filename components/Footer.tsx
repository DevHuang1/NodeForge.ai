const MANIFEST = [
  ["agentic_pipeline_detailed.mmd", "Editable Mermaid source (detailed architecture)"],
  ["agentic_pipeline_detailed.png", "Rendered PNG flowchart for submission"],
  ["pipeline_documentation.md", "Architecture, contracts, revision policy, evaluation"],
  ["prompts/node_1_human_input.md", "Node 1 system prompt"],
  ["prompts/node_2_query_expansion.md", "Node 2 system prompt + spec schema"],
  ["prompts/node_3_execution_verification.md", "Node 3 system prompt + test-matrix schema"],
  ["prompts/node_4_output_sanitization.md", "Node 4 system prompt + quality-gate policy"],
  ["prompts/baseline_single_prompt.md", "Exact baseline control condition"],
  ["evaluation/test_cases.yaml", "Fixed inputs and expected evidence"],
  ["evaluation/comparison_report.md", "Side-by-side outputs and scorecard"],
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Responsible-use note
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              This workflow improves structure and reviewability; it does not
              replace execution in an appropriate sandbox, human review for
              high-risk changes, or a formal security assessment. The demo labels
              executed tests, proposed tests, and static checks honestly, and no
              secrets or private data should appear in prompts, screenshots, or
              public artifacts.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Thesis:</span>{" "}
              prompt
              engineering becomes more reliable when context is refined through
              explicit, inspectable stages.
            </p>
            <p className="mt-6 text-xs text-muted-foreground/70">
              Track 2 — ML Prompt Engineering · Author: Manus AI · Interactive
              demo built with Next.js
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Recommended artifact bundle
            </h3>
            <ul className="mt-4 space-y-2.5">
              {MANIFEST.map(([file, desc]) => (
                <li key={file} className="flex gap-2 text-xs">
                  <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                    {file}
                  </code>
                  <span className="text-muted-foreground/70">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}