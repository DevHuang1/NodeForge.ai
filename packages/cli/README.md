# @sitt15/cli

`nodeforge` is an evidence-first code verification CLI. It maps a repository's capabilities, runs deterministic security scanning, executes tests under a guarded, allow-listed harness, and synthesizes everything into a persisted, auditable run — so that every claim it makes is backed by evidence it actually collected.

**The honesty principle:** nodeforge never claims tests or checks passed unless they were actually executed successfully. `blocked` is not `failed`, and `unattempted` is not `passed`. When something could not be verified, nodeforge says exactly that — in the terminal, in reports, and in the audit trail.

```bash
npx nodeforge review https://github.com/example/project/pull/42 --json
```

## Install

One-line install (macOS / Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/example/nodeforge-ai/main/install.sh | sh
```

The script verifies Node.js >= 18.17, installs `@sitt15/cli` globally via npm, runs `nodeforge --version` to confirm, and prints next steps. If a global install fails due to permissions (EACCES), it automatically retries into a user prefix (`~/.nodeforge`) and prints the exact PATH line to append to your shell rc.

| Environment variable | Effect |
| --- | --- |
| `NODEFORGE_VERSION=0.2.0` | Pin a specific version instead of latest. |
| `NODEFORGE_PREFIX=~/.local` | Install into a custom prefix instead of globally. |
| `NODEFORGE_INSTALL_NODE=1` | Allow the script to bootstrap Node.js LTS via nvm when no suitable Node is found. |
| `NODEFORGE_SKIP_VERIFY=1` | Skip the post-install verification step. |

Prefer plain npm? Both of these are equivalent:

```bash
npm i -g @sitt15/cli   # install globally
npx @sitt15/cli --help # or run without installing
```

Requires Node.js >= 18.17.

> Note: host `install.sh` at the root of this repository so the `curl` URL resolves; update `example/nodeforge-ai` in the URL above (and inside the script header) once the repository location is final.

### Running from a local checkout

Until the package is published to npm, run it straight from this repository:

```bash
git clone <this-repo> && cd <this-repo>/packages/cli
npm install
npm run build

# invoke directly...
node bin/nodeforge.js --help

# ...or expose it globally as `nodeforge`
npm link          # undo later with: npm unlink -g @sitt15/cli
nodeforge --help
```

## Quickstart

```bash
# 1. Scaffold .nodeforge/config.json (+ JSON Schema) with safe defaults
nodeforge init

# 2. Deterministic security scan of a path
nodeforge scan .

# 3. Detect and run the project's test suite under the guarded executor
nodeforge test .

# 4. Full pipeline: context → capability map → scan → tests → (optional) analysis → synthesis
nodeforge review .
```

Review a GitHub pull request and emit machine-readable output:

```bash
npx nodeforge review https://github.com/example/project/pull/42 --json
```

Preview what a run *would* do without executing anything:

```bash
nodeforge review . --dry-run
```

## Step-by-step: your first verification run

This walkthrough verifies a small example project from scratch. Every step lists the command, what it does, and the exit code to expect.

**Step 0 — get a project to verify.** Any git repository works. To follow along exactly, create a tiny intentionally-flawed demo:

```bash
mkdir demo-app && cd demo-app
git init -q

cat > package.json <<'EOF'
{
  "name": "demo-app",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "node --test" }
}
EOF

mkdir -p src tests

cat > src/db.js <<'EOF'
const child_process = require("child_process");

const config = {
  password: "hunter2-prod-password",        // NF-SECRET: hard-coded credential
};

const ENDPOINT = "http://api.internal.example.com";  // NF-NET: cleartext HTTP

function runBackup(table) {
  // NF-SHELL: child_process.exec with template interpolation
  child_process.exec(`pg_dump ${table}`);
}

module.exports = { runBackup };
EOF

cat > tests/basic.test.js <<'EOF'
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("math still works", () => {
  assert.equal(1 + 1, 2);
});
EOF

git add -A && git commit -qm "demo app"
```

**Step 1 — `nodeforge init`: scaffold configuration.**

```bash
nodeforge init
```

Creates `.nodeforge/config.json` plus its JSON Schema, prints every setting with a one-line explanation. Safe defaults: LLM analysis off, network denied for tests, 30 s hard timeout.

Expected: exit `0`. Re-running without `--force` refuses to overwrite and exits `2`.

**Step 2 — `nodeforge doctor`: check your environment.**

```bash
nodeforge doctor
```

Verifies Node/git versions, which test runners are on PATH, config validity, storage writability, and whether tokens are present (presence only — values are never printed). Warnings here predict `blocked` results later: no `pytest` on PATH means Python suites will be blocked, not failed.

Expected: exit `0` (warnings don't fail the check).

**Step 3 — `nodeforge scan .`: deterministic security scan.**

```bash
nodeforge scan .
echo "exit code: $?"
```

Reads every source file under the limits (`scan.maxFiles`, `scan.maxFileBytes`) and flags the six rule categories — no execution, no network, fully deterministic. The demo's hard-coded password, interpolated `exec()`, and cleartext `http://` URL should all be flagged.

Expected output: findings listed per rule (`NF-SECRET`, `NF-SHELL`, …); **exit `1`** because findings were reported. A clean project exits `0`.

**Step 4 — `nodeforge test .`: guarded test execution.**

```bash
nodeforge test .
```

Detects the runner from manifests/lockfiles (here: `npm test`), then executes it argv-only — never through a shell — under a hard timeout with a minimal environment. Each discovered suite gets an honest status: `passed`, `failed`, `blocked`, or `not_executed`.

Expected: the single demo test passes; exit `0`. Break the assertion and it becomes `failed`/exit `1`; remove `node` from PATH-equivalent availability and it becomes `blocked`/exit `3` — never a false pass.

**Step 5 — `nodeforge review .`: the full pipeline.**

```bash
nodeforge review .
```

Runs everything in sequence: git context → capability map → deterministic scan → test discovery & execution → optional analysis (off by default) → synthesis → persistence. The synthesized status weighs both stages honestly: findings exist *and* tests passed, so the run completes as `completed_with_findings`.

Expected: **exit `1`** (findings reported). Everything is persisted under `.nodeforge/runs/<run-id>/`.

Useful variants:

```bash
nodeforge review . --dry-run      # plan only: stages + detected runner, persists nothing
nodeforge review main             # verify a git ref via a temporary detached worktree
nodeforge review https://github.com/owner/repo/pull/42   # PR review (needs GITHUB_TOKEN)
```

**Step 6 — read the evidence back.**

```bash
nodeforge report latest                        # human-readable terminal rendering
nodeforge report latest --format json > run.json
nodeforge report latest --format sarif > run.sarif   # SARIF 2.1.0 for GitHub/code-scanning tooling
nodeforge audit latest                         # timestamped, append-only trail of what happened
```

`report` renders any stored run by id or `latest`; `audit` shows the exact event sequence (`run.created`, `scan.completed`, `tests.completed`, `run.persisted`, …) that backs the report. Both honor `--json`.

**Where things live:** runs persist to `.nodeforge/runs/<run-id>/` (`run.json`, `findings.json`, `tests.json`, `evidence.json`, `stages.json`, `artifacts/`, `audit.jsonl`). Add `.nodeforge/` to `.gitignore`; it is local evidence, not source.

**Interpreting exit codes:** `0` verified · `1` findings/failures · `2` bad input/config · `3` blocked or unavailable (timeout, missing runtime, policy denial) · `4` internal error · `130` cancelled. Gate CI on these — see [CI usage](#ci-usage).

## Commands

### `nodeforge review <target>`

Runs the full verification pipeline: context → capability map → deterministic scan → test discovery/execution → optional LLM analysis → synthesis → persistence to `.nodeforge/runs/<run-id>/`.

`<target>` may be:

- a **local repo path** (e.g. `.`),
- a **git ref** — branch, tag, or SHA — resolved in the current repo via a temporary detached worktree,
- a **GitHub PR URL** (e.g. `https://github.com/owner/repo/pull/42`).

Flags: all [global flags](#global-flags).

### `nodeforge scan <path>`

Deterministic security scan only. Six rule categories:

| Rule ID | Category |
| --- | --- |
| `NF-SECRET` | Hard-coded secrets |
| `NF-SHELL` | Shell injection |
| `NF-SUBPROCESS` | Unsafe subprocess usage |
| `NF-DESER` | Unsafe deserialization |
| `NF-NET` | Suspicious network activity |
| `NF-FS` | Unsafe filesystem access |

### `nodeforge test <path>`

Detects the test runner from manifests and lockfiles (`vitest`, `jest`, `pytest`, `go test`, `npm`/`pnpm`/`yarn test`), then executes it via allow-listed argv — never through a shell — under a hard timeout. Prints an honest status for each suite:

- `passed` — executed and succeeded
- `failed` — executed and failed
- `blocked` — could not be executed (missing runtime, policy denial, …)
- `not_executed` — never attempted

### `nodeforge report <run-id|latest> [--format terminal|json|markdown|sarif]`

Renders a stored run. `--format` selects the output format; defaults to `terminal`.

### `nodeforge audit <run-id|latest> [--limit N]`

Prints the timestamped audit trail for a run. Honors the global `--json` flag.

### `nodeforge doctor [--connectivity]`

Environment health check: Node version, git availability, runner toolchains on PATH, config validity, storage writability, and GitHub token presence (reported as a boolean only — the token itself is never printed). With `--connectivity`, additionally probes provider connectivity.

### `nodeforge init [--force]`

Writes `.nodeforge/config.json` and `.nodeforge/config.schema.json` with safe defaults and explains every setting. `--force` overwrites an existing configuration.

## Global flags

| Flag | Description |
| --- | --- |
| `-v, --verbose` | Verbose output. |
| `-q, --quiet` | Suppress non-essential output. |
| `--no-color` | Disable colored output. Color auto-disables for non-TTY streams and when `NO_COLOR` is set; `FORCE_COLOR=1` forces it on. |
| `--json` | Emit JSON output. |
| `--markdown` | Emit Markdown output. |
| `--sarif` | Emit SARIF output. |
| `--timeout <ms>` | Per-command test timeout in milliseconds (default `30000`). |
| `--provider <openrouter\|openai\|featherless\|none>` | LLM analysis provider selection. |
| `--dry-run` | Show the planned stages and detected runner without executing tests or analysis, and without persisting anything. |

The format selectors (`--json`, `--markdown`, `--sarif`) are mutually exclusive; the last one on the command line wins. The default format is `terminal`.

## Output formats

- **terminal** — human-readable default.
- **json** — full structured result (`--json` or `report --format json`).
- **markdown** — report-friendly rendering (`--markdown` or `report --format markdown`).
- **sarif** — SARIF for security tooling integrations (`--sarif` or `report --format sarif`).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Verified success. |
| `1` | Findings reported, or executed tests failed. |
| `2` | Invalid input or configuration. |
| `3` | Required verification was blocked or unavailable — including test timeouts, missing runtimes, policy denials, and no tests discovered for `test`. |
| `4` | Internal engine or persistence failure. |
| `130` | Cancelled by SIGINT/SIGTERM; child processes are killed and the run is marked cancelled. |

## Configuration

Configuration lives at `.nodeforge/config.json` (create it with `nodeforge init`). It is validated against the shipped JSON Schema at `config/config.schema.json`. Unknown fields are ignored; fields with the wrong type are reported as issues and cause exit code `2`.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `scan.maxFiles` | integer | `2000` | Maximum number of files examined per scan. |
| `scan.maxFileBytes` | integer | `524288` | Files larger than this are hashed but not content-scanned. |
| `scan.excludeDirs` | string[] | `node_modules`, `.git`, `.next`, `dist`, `build`, `vendor`, `venv`, `.venv`, `__pycache__`, `coverage`, `.data`, `.nodeforge` | Directory names skipped during scanning. |
| `tests.enabled` | boolean | `true` | Whether review discovers and executes tests. |
| `tests.timeoutMs` | integer | `30000` | Hard per-command test timeout; the child process group is killed on expiry. |
| `tests.network` | `"denied"` \| `"allowed"` | `"denied"` | Test network policy. `denied` strips proxy/network variables from the child environment (best-effort). |
| `tests.runnerOverride` | string \| null | `null` | Force a specific runner instead of auto-detection. |
| `tests.commandOverride` | string[] \| null | `null` | Custom argv replacing the runner command; must still pass the allow-list and is never run through a shell. |
| `tests.onBlocked` | `"blocked"` \| `"ignore"` | `"blocked"` | How review treats blocked test execution: surface it as blocked, or ignore and continue. |
| `analysis.enabled` | boolean | `false` | Enable optional LLM analysis. Off by default. |
| `analysis.provider` | string | `"openai-compatible"` | Analysis provider kind behind the AnalysisProvider seam. |
| `analysis.model` | string \| null | `null` | Model identifier, or null for the provider default. |
| `analysis.baseUrl` | string \| null | `null` | OpenAI-compatible base URL override. |
| `analysis.maxFindings` | integer | `10` | Maximum findings forwarded to LLM analysis per run. |
| `storage.backend` | `"fs"` \| `"memory"` | `"fs"` | RunRepository backend. `memory` keeps runs for the current process only. |
| `storage.dir` | string | `".nodeforge/runs"` | Where runs are persisted when the backend is `fs`. |
| `report.artifacts` | boolean | `true` | Write raw artifacts alongside structured results in each run directory. |

## Authentication

Tokens are read **only** from environment variables, per request. They are never persisted, never logged, and stripped from URLs before anything is stored. All logs, reports, and artifacts pass through pattern-based secret redaction before output or persistence.

| Variable | Used for |
| --- | --- |
| `NODEFORGE_GITHUB_TOKEN` (or `GITHUB_TOKEN`) | GitHub API access for PR review. |
| `OPENROUTER_API_KEY` | OpenRouter analysis provider. |
| `OPENAI_API_KEY` | OpenAI-compatible analysis provider. |
| `FEATHERLESS_API_KEY` | Featherless analysis provider. |

Rotate tokens using your provider's normal rotation flow — simply export the new value; nothing about nodeforge needs to change because no token is ever written to disk by nodeforge.

## Security model

- **Command allow-list:** only `node`, `npx`, `npm`, `pnpm`, `yarn`, `vitest`, `jest`, `pytest`, `python3`, `python`, and `go` may be spawned.
- **No shell:** processes spawn argv-only (`shell: false`); arguments containing shell metacharacters are rejected defensively.
- **Minimal child environment:** only `PATH`, `LANG`, `LC_ALL`, `TZ`, `TMPDIR`, `HOME`, `CI`, `NODEFORGE_RUN_ID`, `PYTHONHASHSEED`, `SOURCE_DATE_EPOCH`, and `NO_COLOR` are forwarded. Proxy variables are stripped when network is denied.
- **Hard timeouts:** a per-command timeout kills the child process group.
- **Bounded capture:** output is capped at 200 KB per stream.
- **Resource caps:** file size and file count limits during scanning; symlink-safe, repo-relative traversal.
- **Untrusted content:** PR bodies are intentionally never fetched or stored.
- **Redaction pipeline:** pattern-based secret redaction runs before any log, report, or artifact is written or printed.

Run persistence layout (atomic writes via tmp + rename):

```
.nodeforge/
└── runs/
    └── <run-id>/
        ├── run.json          # full run document (schemaVersion 1)
        ├── findings.json     # scanner findings
        ├── tests.json        # test execution results
        ├── evidence.json     # collected evidence
        ├── stages.json       # per-stage outcomes
        ├── artifacts/        # raw artifacts (when report.artifacts is true)
        └── audit.jsonl       # append-only audit trail
```

The storage backend is replaceable via `storage.backend`: `fs` and in-process `memory` are built in; SQLite, PostgreSQL, or hosted-API backends can be added behind the same `RunRepository` interface.

## Providers and analysis

LLM analysis is **disabled by default**; every deterministic stage works without it. To enable it:

1. Set `analysis.enabled: true` in `.nodeforge/config.json`.
2. Export the API key for your chosen provider (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `FEATHERLESS_API_KEY`).
3. Optionally select the provider per invocation with `--provider <openrouter|openai|featherless|none>` and set `analysis.model` / `analysis.baseUrl`.

If the provider fails or is unavailable, the run degrades honestly: analysis is reported as skipped/unavailable with a reason, and the deterministic results stand on their own. A missing or failed LLM never turns into a false "verified" signal.

## Architecture

nodeforge is built around provider-agnostic seams:

| Seam | Built-in implementations |
| --- | --- |
| `SourceProvider` | local-git, github |
| `DeterministicScanner` | rule-based scanner (six categories) |
| `TestExecutor` | guarded-local |
| `AnalysisProvider` | openai-compatible (disabled by default) |
| `RunRepository` | fs, memory |
| `AuditLogger` | append-only JSONL |

Every stage returns structured results with a common shape: `status`, `reason`, `evidence`, `durationMs`, and `artifacts` — which is what makes honest reporting enforceable rather than aspirational.

## CI usage

Gate merges on nodeforge's exit codes. In this example, findings or failing tests fail the job; a blocked/unavailable verification (exit `3`) currently also fails the job — whether to continue or fail on exit `3` is a policy choice for your team.

```yaml
name: nodeforge

on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install nodeforge
        run: npm i -g @sitt15/cli
      - name: Review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: nodeforge review . --json
```

Because nodeforge exits `1` when findings are reported or executed tests fail, the step — and therefore the job — fails automatically. Add `|| true`-style handling only if you deliberately want exit `3` (blocked verification) to be non-blocking.

## Limitations

Honest limitations, stated plainly:

- Network denial during tests is best-effort (environment sanitization). OS-level enforcement requires an external container runtime, which nodeforge does not manage yet.
- Scanning refs uses `git worktree`, so the ref must exist locally — fetch first if it does not.
- npx-based runners may download packages unless they are already installed locally.
- On Windows, process-group kill degrades to killing the direct child process.
- PR review scans changed files only.
- Large/minified files are hashed but not content-scanned.

## License

MIT.
