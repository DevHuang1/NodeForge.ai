# NodeForge.ai

**Agentic code review, without the guesswork.**

One prompt cannot be analyst, engineer, tester, and security reviewer at once.
NodeForge splits those jobs across four specialized nodes — each producing an
inspectable artifact — so a single ambiguous request becomes a verified,
sanitized, auditable answer.

**Thesis:** structured context refinement creates inspectable intermediate
contracts, targeted correction, and evidence that a final answer has been
checked against requirements and risks.

> Submitted to **Reverie Hacks 2026** · Track 2 · ML Prompt Engineering ·
> Interactive submission · [Live demo](https://nodeforge-ai.vercel.app)

---

## The problem

Single-prompt LLM coding workflows are a black box. They:

- guess at ambiguous requirements instead of surfacing them,
- claim tests pass that were never executed,
- leak secrets or use unsafe APIs without review,
- and give you no way to trace a final answer back to the request.

## The solution

NodeForge turns one big prompt into a **chain of four expert nodes**, each with
its own system prompt, output schema, and failure behavior. Every stage emits an
explicit artifact that becomes the context for the next.

| Node | Name | Job | Artifact |
| --- | --- | --- | --- |
| 1 | Human Input | Preserve the raw request exactly; never resolve ambiguity silently | Raw Task Record |
| 2 | Query Expansion | Turn ambiguity into assumptions, acceptance criteria, edge cases, threat model | Explicit System Specification |
| 3 | Execution & Verification | Smallest implementation + independent, requirement-mapped tests | Code + Test Matrix |
| 4 | Output Sanitization | Syntax, security, traceability, honesty gate | Sanitized Response |

Two things make it more than a chain of prompts:

- **Quality gate + targeted revision loop.** When Node 4 finds a defect, feedback
  is routed *only* to the node responsible for it (missing requirements → Node 2,
  code/test defects → Node 3, security/formatting → Node 4), never a blind restart.
- **Evidence, not vibes.** Every acceptance criterion maps to implementation and
  tests; executed checks are distinguished from static checks and proposed tests;
  and a baseline (single-prompt) run runs on the *same raw request* for a
  side-by-side scorecard comparison.

## Features

- **Live pipeline** against real models (OpenRouter / Featherless / OpenAI with
  automatic fallback), or **offline mode** with sample artifacts — no API key needed.
- **Four inspectable artifacts** per run, each validated against its JSON schema
  and viewable as source, diff (across revisions), or raw JSON.
- **In-browser test execution** (Pyodide) for Node 3 artifacts.
- **Quality gate** with severity-tagged findings and one-click targeted routing.
- **Baseline vs. pipeline scorecard** comparing the same request through both paths.
- **Model comparison** — run the full pipeline against a second model ID.
- **Editable prompt library** — every node's system prompt is visible, editable,
  and persisted; the live demo picks up your changes.
- **Editable Mermaid diagram** of the architecture (copy / download `.mmd` / PNG).
- **Exportable run reports** (Markdown or JSON).
- **Repository-aware pull-request review.** Select a repo/PR, ingest changed
  files plus surrounding context under a token budget, run the four-node
  pipeline, then layer deterministic security checks (secrets, shell injection,
  unsafe deserialization, injection, prompt injection, dependency/license
  policy) over the diff. Findings are reviewable inline with approve/dismiss/
  request-revision/assign decisions, a patch proposal can be approved or
  rejected, and every run persists to history with audit events and evaluation
  metrics. Works fully offline with the bundled sample PR
  (`acme/notes-search#42`); with a `GITHUB_TOKEN` it fetches real PRs.
- **Honest test reporting.** No sandbox is configured today, so the review's
  test step labels every test `proposed` / `not executed` and never claims a
  run — the executor refuses anything not on its allow-list (`pytest`,
  `go test`, `npm test`) and blocks shell pipelines, `rm -rf`, etc.
- Dark mode, human-review panel, and revision timeline.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The demo works immediately in offline mode; to run
live model calls, configure a provider (below).

### Configuration

Copy `.env.example` to `.env.local` and set at least one provider key:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Primary provider key |
| `FEATHERLESS_API_KEY` | Fallback provider key |
| `OPENROUTER_MODEL` / `FEATHERLESS_MODEL` | Provider model IDs |
| `OPENROUTER_BASE_URL` / `FEATHERLESS_BASE_URL` | Optional endpoint overrides |
| `OPENAI_API_KEY` / `LLM_MODEL` | Optional OpenAI provider |
| `LLM_PROVIDER_PRIORITY` | `o` (OpenRouter first) or `f` (Featherless first) |
| `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` | Sampling defaults |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_NAME` | Provider attribution headers |
| `GITHUB_TOKEN` | Enables live PR retrieval; unset ⇒ offline sample only |
| `GITHUB_MAX_FILES` | Cap on changed files fetched per PR (default 30) |

A `GITHUB_TOKEN` env var enables real PR retrieval for every user. Judges can
also paste their own fine-grained PAT ("Contents: Read") into the PR Review
token field — it is used per-request, server-side only, and never stored.
| `NODEFORGE_EXECUTOR` | Test backend (`offline` today; never claims execution) |
| `NODEFORGE_DATA_DIR` | Review-run/audit persistence dir (default `./.data`) |

Providers are tried in order with automatic fallback on failure.

Review runs and audit events are persisted to `./.data/store.json` (git-ignored).
On Vercel's read-only serverless filesystem they fall back to in-memory storage
for the lifetime of the function instance.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # production server
npm run lint       # eslint
npm test           # node:test unit suite (lib + API logic, offline only)
```

## Deployment

The project deploys as-is on **Vercel** (static `/` page + serverless API
routes). `npm run build` passes clean. Set the same environment variables in the
Vercel dashboard — the API keys are server-only; nothing is committed.

## Repository layout

```
app/          App Router routes: pages + API routes (/api/config, /api/baseline, /api/pipeline/run, /api/reviews, /api/findings/..., /api/evaluation, /api/history)
components/   UI: PipelineDemo, NodeCard, QualityGate, Scorecard, ReviewPanel, PromptLibrary, MermaidSection, ...
lib/          Core logic: prompts, pipeline orchestration, LLM abstraction, repository context, security rules, executor, persistence, audit, evaluation
tests/        Unit tests (node:test)
```