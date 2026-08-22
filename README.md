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

This monorepo contains two deliverables built on the same evidence-first engine:

| | What it is | Where |
| --- | --- | --- |
| **Web app** | Interactive 4-node review pipeline with inspectable artifacts, quality gate, scorecards, and PR review UI | `app/`, `components/`, `lib/` |
| **CLI package** | [`@sitt15/cli`](packages/cli/README.md) — scriptable `nodeforge` command for scanning, guarded test execution, reviews, SARIF/JSON reports, and CI gating | `packages/cli/` |

---

## Built with

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radixui&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![pytest](https://img.shields.io/badge/pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)
![Pyodide](https://img.shields.io/badge/Pyodide-1E444D?style=for-the-badge)
![Mermaid](https://img.shields.io/badge/Mermaid-FF3670?style=for-the-badge&logo=mermaid&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-8A2BE2?style=for-the-badge&logo=openrouter&logoColor=white)
![Featherless](https://img.shields.io/badge/Featherless-3E63DD?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)
[![npm](https://img.shields.io/npm/v/@sitt15/cli?style=for-the-badge&logo=npm&label=npm%20@sitt15/cli&color=CB3837)](https://www.npmjs.com/package/@sitt15/cli)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## Install

The NodeForge CLI ships as the npm package **[`@sitt15/cli`](https://www.npmjs.com/package/@sitt15/cli)** (binary: `nodeforge`).

**Requirements:** Node.js ≥ 18.17 (no other toolchain needed for scan/report; `test` needs the target project's own runner, e.g. pytest/go/npm).

```bash
# Install globally
npm install -g @sitt15/cli

# Or run without installing
npx @sitt15/cli --help
```

Verify the installation:

```bash
nodeforge --version
```

macOS / Linux one-liner (bootstraps Node via nvm if missing):

```bash
curl -fsSL https://raw.githubusercontent.com/DevHuang1/NodeForge.ai/main/install.sh | sh
```

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/DevHuang1/NodeForge.ai.git
cd NodeForge.ai
npm run cli -- --help   # builds packages/cli, then runs it from source
```

Or link your local build globally:

```bash
npm ci --prefix packages/cli
npm run build --prefix packages/cli
npm link --prefix packages/cli
nodeforge --version
```

</details>

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

## Use cases

**Pre-merge PR review for teams.** Point NodeForge at a repo/PR (or paste a
fine-grained PAT) and get findings from two independent sources — deterministic
security rules plus the model — each with file/line, evidence, severity, and a
required action. Reviewers approve, dismiss, request revision, or assign each
finding; a proposed patch can be approved or rejected; everything lands in
history with an audit trail.

**CI quality gate.** Run `nodeforge review .` in your workflow and gate merges
on exit codes: `0` verified, `1` findings or failing tests, `3` blocked
verification. Emit `--sarif` to feed GitHub code scanning, or `--json` for
custom policy checks. See the [CLI's CI example](packages/cli/README.md#ci-usage).

**Security audit before release.** `nodeforge scan .` flags hard-coded secrets,
shell injection, unsafe subprocess use, unsafe deserialization, suspicious
network activity, and unsafe filesystem access — fully deterministic, no LLM,
no network, no execution. Safe to run on untrusted code.

**Honest test verification.** `nodeforge test .` detects the runner from
manifests/lockfiles (`pytest`, `go test`, `vitest`, `jest`, npm/pnpm/yarn test)
and executes it argv-only in an isolated temp dir with a hard timeout. Every
suite reports `passed`, `failed`, `blocked`, or `not_executed` — it never
claims a run that didn't happen.

**Auditable evidence trail.** Every run persists structured artifacts
(`run.json`, `findings.json`, `tests.json`, `evidence.json`,
`audit.jsonl`) under `.nodeforge/runs/<run-id>/`. Export terminal, JSON,
Markdown, or SARIF reports for compliance review; replay the exact event
sequence with `nodeforge audit latest`.

**Model & prompt evaluation.** The web app runs a baseline single-prompt path
and the 4-node pipeline on the *same raw request* for a side-by-side scorecard,
and can run the full pipeline against a second model ID — useful for measuring
whether structured pipelines actually beat one big prompt.

**Prompt-engineering research and teaching.** Every node's system prompt is
visible, editable, and persisted; every intermediate artifact is inspectable as
source, diff, or raw JSON. A concrete workbench for studying context refinement,
targeted revision loops, and schema-constrained LLM output.

**Offline demos and onboarding.** No API key? The web app runs offline with
sample artifacts and a bundled sample PR (`acme/notes-search#42`); the CLI's
deterministic stages need no provider at all.

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
| `NODEFORGE_EXECUTOR` | Test backend: `offline` (default, never claims execution), `local` (guarded real run in a temp dir; needs the toolchain), or `sandbox` (reserved) |
| `NODEFORGE_DATA_DIR` | Review-run/audit persistence dir (default `./.data`) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Per-IP fixed-window limit on expensive endpoints (`/api/pipeline/run`, `/api/baseline`, `POST /api/reviews`); defaults 60s / 10 |

A `GITHUB_TOKEN` env var enables real PR retrieval for every user. Judges can
also paste their own fine-grained PAT ("Contents: Read") into the PR Review
token field — it is used per-request, server-side only, and never stored.

With `NODEFORGE_EXECUTOR=local`, the review's test step runs the allow-listed
test command (`pytest` / `go test` / `npm test`) in an isolated temp dir with a
hard timeout and reports genuine pass/fail. Only the repository-context detected
command is ever run — never the model's raw output — and if the toolchain is
missing it honestly reports `blocked` / not executed.

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
npm run cli        # build packages/cli, then run the nodeforge CLI (precli auto-builds)
```

### CLI quickstart

Install once (see [Install](#install)), then:

```bash
nodeforge init          # scaffold .nodeforge/config.json with safe defaults
nodeforge scan .        # deterministic security scan
nodeforge test .        # guarded test execution with honest statuses
nodeforge review .      # full pipeline: context → scan → tests → synthesis
nodeforge report latest --format sarif   # SARIF 2.1.0 for code scanning
```

Full command reference, configuration, exit codes, and security model:
[`packages/cli/README.md`](packages/cli/README.md).

## Deployment

The project deploys as-is on **Vercel** (static `/` page + serverless API
routes). `npm run build` passes clean. Set the same environment variables in the
Vercel dashboard — the API keys are server-only; nothing is committed.

## Repository layout

```
app/            App Router routes: pages + API routes (/api/config, /api/baseline, /api/pipeline/run, /api/reviews, /api/findings/..., /api/evaluation, /api/history)
components/     UI: PipelineDemo, NodeCard, QualityGate, Scorecard, ReviewPanel, PromptLibrary, MermaidSection, ...
lib/            Core logic: prompts, pipeline orchestration, LLM abstraction, repository context, security rules, executor, persistence, audit, evaluation
packages/cli/   @sitt15/cli — the nodeforge command: scanners, guarded executor, reporters (terminal/json/markdown/sarif), storage, audit
tests/          Unit tests (node:test)
remotion/       Demo video scenes (Remotion)
```

## License

[MIT](LICENSE) © DevHuang1. The CLI package [`@sitt15/cli`](packages/cli/LICENSE) is also MIT-licensed; its published tarball carries the same license file.