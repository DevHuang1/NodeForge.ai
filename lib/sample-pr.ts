import type { PullRequest, PullRequestFile } from "./types";

function prFile(f: Partial<PullRequestFile> & { path: string }): PullRequestFile {
  return {
    status: "modified",
    additions: 0,
    deletions: 0,
    content: "",
    unifiedDiff: "",
    lines: [],
    binary: false,
    ...f,
  };
}

const SEARCH_PY_AFTER = `import subprocess
import os
import pickle

INDEX_ROOT = os.environ.get("SEARCH_INDEX", ".")

# Load a pre-built index exported by the export job.
def load_index():
    with open(os.path.join(INDEX_ROOT, "index.pkl"), "rb") as fh:
        return pickle.load(fh)

def search_notes(keyword: str) -> list[str]:
    """Return lines matching the keyword under the index root."""
    results: list[str] = []
    cmd = f"grep -r {keyword} {INDEX_ROOT}"
    out = subprocess.check_output(cmd, shell=True)
    results.extend(out.decode().splitlines())
    return results

def list_recent() -> list[str]:
    idx = load_index()
    return sorted(idx.keys())[:10]
`;

const SEARCH_PY_DIFF = `diff --git a/app/search.py b/app/search.py
index 1f2a3b4..7e8f9a0 100644
--- a/app/search.py
+++ b/app/search.py
@@ -1,6 +1,15 @@
 import subprocess
 import os
+import pickle
 
 INDEX_ROOT = os.environ.get("SEARCH_INDEX", ".")
 
+# Load a pre-built index exported by the export job.
+def load_index():
+    with open(os.path.join(INDEX_ROOT, "index.pkl"), "rb") as fh:
+        return pickle.load(fh)
+
 def search_notes(keyword: str) -> list[str]:
     """Return lines matching the keyword under the index root."""
     results: list[str] = []
     cmd = f"grep -r {keyword} {INDEX_ROOT}"
     out = subprocess.check_output(cmd, shell=True)
     results.extend(out.decode().splitlines())
     return results
+
+def list_recent() -> list[str]:
+    idx = load_index()
+    return sorted(idx.keys())[:10]
`;

const TEST_SEARCH_PY = `import pytest

from app.search import search_notes, list_recent


def test_search_returns_matches():
    assert search_notes("pytest")  # expects live grep

def test_search_missing_keyword_raises():
    with pytest.raises(subprocess.CalledProcessError):
        search_notes("")

def test_recent_uses_index():
    recent = list_recent()
    assert isinstance(recent, list)
`;

const TEST_SEARCH_DIFF = `diff --git a/tests/test_search.py b/tests/test_search.py
new file mode 100644
index 0000000..a1b2c3d
--- /dev/null
+++ b/tests/test_search.py
@@ -0,0 +1,12 @@
+import pytest
+
+from app.search import search_notes, list_recent
+
+
+def test_search_returns_matches():
+    assert search_notes("pytest")  # expects live grep
+
+def test_search_missing_keyword_raises():
+    with pytest.raises(subprocess.CalledProcessError):
+        search_notes("")
+
+def test_recent_uses_index():
+    recent = list_recent()
+    assert isinstance(recent, list)
`;

const README_MD = `# acme/notes-search

Search server notes from the command line or HTTP API.

## Usage

\`\`\`bash
python -m app.search "design doc"
\`\`\`

## Status

Tested and production-ready. All tests pass.
`;

const README_DIFF = `diff --git a/README.md b/README.md
new file mode 100644
index 0000000..e5f6a7b
--- /dev/null
+++ b/README.md
@@ -0,0 +1,10 @@
+# acme/notes-search
+
+Search server notes from the command line or HTTP API.
+
+## Usage
+
+\`\`\`bash
+python -m app.search "design doc"
+\`\`\`
+
+## Status
+
+Tested and production-ready. All tests pass.
`;

const REQUIREMENTS_AFTER = `flask==3.0.3
PyYAML>=5.4
`;
const REQUIREMENTS_DIFF = `diff --git a/requirements.txt b/requirements.txt
index 9a8b7c6..d5e4f3a 100644
--- a/requirements.txt
+++ b/requirements.txt
@@ -1,2 +1,3 @@
 flask==3.0.3
+PyYAML>=5.4
`;

const API_KEY_AFTER = `SEARCH_INDEX=./data
GITHUB_TOKEN=ghp_abc123def456ghi789jkl0mnopqrstuvwxyz1
`;

const API_KEY_DIFF = `diff --git a/.env.example b/.env.example
new file mode 100644
index 0000000..b0a1c2d
--- /dev/null
+++ b/.env.example
@@ -0,0 +1,3 @@
+SEARCH_INDEX=./data
+GITHUB_TOKEN=ghp_abc123def456ghi789jkl0mnopqrstuvwxyz1
`;

export const SAMPLE_PR: PullRequest = {
  owner: "acme",
  repo: "notes-search",
  number: 42,
  title: "Add repo search endpoint with recent-notes index",
  body:
    "Adds a search endpoint that greps the index root for a user-supplied " +
    "keyword, plus a recent-notes helper backed by a pickle index.\n\n" +
    "Closes #41.",
  baseSha: "3f9b8c7d1e2a4b5c6d7e8f9a0b1c2d3e4f5a6b7c",
  headSha: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4",
  baseRef: "main",
  headRef: "feat/search-endpoint",
  url: "https://github.com/acme/notes-search/pull/42",
  files: [
    prFile({
      path: "app/search.py",
      status: "modified",
      additions: 9,
      deletions: 0,
      content: SEARCH_PY_AFTER,
      unifiedDiff: SEARCH_PY_DIFF,
      lines: SEARCH_PY_AFTER.split("\n"),
    }),
    prFile({
      path: "tests/test_search.py",
      status: "added",
      additions: 12,
      deletions: 0,
      content: TEST_SEARCH_PY,
      unifiedDiff: TEST_SEARCH_DIFF,
      lines: TEST_SEARCH_PY.split("\n"),
    }),
    prFile({
      path: "README.md",
      status: "added",
      additions: 10,
      deletions: 0,
      content: README_MD,
      unifiedDiff: README_DIFF,
      lines: README_MD.split("\n"),
    }),
    prFile({
      path: "requirements.txt",
      status: "modified",
      additions: 1,
      deletions: 0,
      content: REQUIREMENTS_AFTER,
      unifiedDiff: REQUIREMENTS_DIFF,
      lines: REQUIREMENTS_AFTER.split("\n"),
    }),
    prFile({
      path: ".env.example",
      status: "added",
      additions: 3,
      deletions: 0,
      content: API_KEY_AFTER,
      unifiedDiff: API_KEY_DIFF,
      lines: API_KEY_AFTER.split("\n"),
    }),
  ],
  totalAdditions: 35,
  totalDeletions: 0,
};

export function getSamplePr(owner?: string, repo?: string, number?: number): PullRequest | null {
  if (
    owner &&
    (owner.toLowerCase() !== SAMPLE_PR.owner || (repo && repo.toLowerCase() !== SAMPLE_PR.repo))
  ) {
    return null;
  }
  if (number && number !== SAMPLE_PR.number) return null;
  return SAMPLE_PR;
}

export const SAMPLE_PR_LIST = [
  {
    number: SAMPLE_PR.number,
    title: SAMPLE_PR.title,
    headSha: SAMPLE_PR.headSha,
    headRef: SAMPLE_PR.headRef,
    baseRef: SAMPLE_PR.baseRef,
  },
];