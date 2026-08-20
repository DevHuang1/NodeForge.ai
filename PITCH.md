# NodeForge.ai — Devpost Pitch

## Elevator pitch

**NodeForge.ai is an agentic code-review pipeline that replaces the single-prompt
LLM black box with four specialized nodes — capture, expand, execute & verify,
sanitize — so a coding request comes out verified, sanitized, and traceable back
to the original requirement.**

## The problem

Ask an LLM to "write a function that parses a user-supplied date" and you get a
confident answer — with the date format guessed, tests unexecuted, and no record
of what was assumed. Single-prompt workflows silently resolve ambiguity, claim
verification that never happened, and can ship unsafe code with no audit trail.

## Our solution

We split one mega-prompt into four expert nodes, each with a strict system prompt
and output schema:

1. **Human Input** — preserve the request verbatim, never guess.
2. **Query Expansion** — surface assumptions, acceptance criteria, edge cases,
   and a threat model as an explicit specification.
3. **Execution & Verification** — smallest implementation plus independent tests,
   each mapped to a requirement and honestly labeled *executed* vs *proposed*.
4. **Output Sanitization** — the quality gate: syntax, security, traceability,
   and honesty before anything ships.

When the gate finds a defect, feedback is routed **only to the node responsible**
(missing requirements → Node 2, code/test defects → Node 3, security → Node 4) —
a targeted revision loop instead of a blind retry.

## Innovation

- **Targeted revision loop** — feedback routes to the responsible node, not a
  full restart. The whole system is designed around this.
- **Evidence, not vibes** — every acceptance criterion maps to implementation and
  tests; executed checks are never conflated with proposed ones; threats are
  modeled before code exists.
- **Self-comparing** — the same raw request runs through the pipeline *and* a
  single-prompt baseline, scored side by side, so the value is demonstrated, not
  claimed.
- **Fully inspectable and editable** — every node's system prompt and output
  schema is exposed in a live-editable prompt library; the Mermaid diagram is
  rendered from version-controllable source.

## How it works (tech)

- **Next.js 16** App Router + serverless API routes
- 4-node orchestration with JSON-schema-validated artifacts
- **Multi-provider LLM layer** (OpenRouter / Featherless / OpenAI) with automatic
  fallback — and a full **offline sample mode** so judges can explore without keys
- **In-browser test execution (Pyodide)** for verification evidence
- Baseline-vs-pipeline **scorecard**, model comparison, Markdown/JSON exports,
  dark mode

## What's in the demo

Run the pipeline live against a real model on three evaluation cases (input
validation, authorization boundary, secret/injection risk) or paste any custom
request. Watch four artifacts generate in sequence, challenge the result through
the quality gate, route a targeted revision, and read the final report.

**Live demo:** https://nodeforge-ai.vercel.app
**Repo:** https://github.com/DevHuang1/NodeForge.ai

## Team

Built solo/with a small team for **Reverie Hacks 2026** · Track 2 · ML Prompt
Engineering · Interactive submission.