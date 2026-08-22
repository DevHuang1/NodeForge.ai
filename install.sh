#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# nodeforge installer
#
# One-line install (macOS / Linux):
#
#   curl -fsSL https://raw.githubusercontent.com/example/nodeforge-ai/main/install.sh | sh
#
# Environment overrides:
#   NODEFORGE_VERSION       pin a version, e.g. NODEFORGE_VERSION=0.2.0
#   NODEFORGE_PREFIX        install into this npm prefix instead of globally
#   NODEFORGE_INSTALL_NODE  =1 allows bootstrapping Node.js via nvm when missing
#   NODEFORGE_SKIP_VERIFY   =1 skips the post-install `nodeforge --version` check
#   NODEFORGE_PACKAGE       internal/testing: install this instead of the
#                           published package name (e.g. a local tarball)
# ─────────────────────────────────────────────────────────────────────────────

set -eu

PACKAGE="@sitt15/cli"
BIN_NAME="nodeforge"
NVM_VERSION="v0.40.3"

# ── output helpers (color only on TTY, honors NO_COLOR) ─────────────────────
ESC=$(printf '\033')
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD="${ESC}[1m"; YELLOW="${ESC}[33m"; RED="${ESC}[31m"; GREEN="${ESC}[32m"; RESET="${ESC}[0m"
else
  BOLD=""; YELLOW=""; RED=""; GREEN=""; RESET=""
fi
info() { printf '%s\n' "${BOLD}nodeforge installer${RESET} $*"; }
ok()   { printf '%s\n' "${GREEN} ok ${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}warn${RESET} $*"; }
fail() { printf '%s\n' "${RED}error${RESET} $*" >&2; exit 1; }

# ── node >= 18.17 detection ──────────────────────────────────────────────────
node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  v=$(node -v 2>/dev/null | sed 's/^v//' || true)
  [ -n "$v" ] || return 1
  major=$(printf '%s' "$v" | cut -d. -f1 | tr -cd '0-9')
  minor=$(printf '%s' "$v" | cut -d. -f2 | tr -cd '0-9')
  major=${major:-0}; minor=${minor:-0}
  [ "$major" -gt 18 ] && return 0
  [ "$major" -eq 18 ] && [ "$minor" -ge 17 ] && return 0
  return 1
}

bootstrap_node() {
  if [ "${NODEFORGE_INSTALL_NODE:-0}" != "1" ]; then
    fail "Node.js >= 18.17 is required.
  - install it from https://nodejs.org (or via nvm/homebrew/apt), then re-run
  - or let this script bootstrap Node via nvm:
      NODEFORGE_INSTALL_NODE=1 sh install.sh"
  fi
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
    || fail "need curl or wget to bootstrap Node.js"
  info "bootstrapping Node.js LTS via nvm (NODEFORGE_INSTALL_NODE=1)"
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  export NVM_DIR
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | PROFILE=/dev/null sh \
      || fail "nvm bootstrap failed"
  else
    wget -qO- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | PROFILE=/dev/null sh \
      || fail "nvm bootstrap failed"
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || fail "could not load nvm from $NVM_DIR"
  nvm install --lts >/dev/null 2>&1 || fail "Node.js LTS install failed"
  nvm use --lts >/dev/null 2>&1 || true
}

# ── install helpers ──────────────────────────────────────────────────────────
install_into_prefix() {
  mkdir -p "$1"
  info "installing into prefix: $1"
  npm install --prefix "$1" --no-fund --no-audit "$spec" || return 1
  BIN_PATH="$1/node_modules/.bin/${BIN_NAME}"
}

# ── main ─────────────────────────────────────────────────────────────────────
main() {
  printf '\n'
  info "installing ${PACKAGE}"

  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) fail "unsupported platform: $(uname -s). Use macOS or Linux (on Windows, use WSL2)." ;;
  esac

  # 1. ensure node + npm
  if node_version_ok; then
    ok "node $(node -v)"
  else
    if command -v node >/dev/null 2>&1; then
      warn "node $(node -v) is too old — need >= v18.17"
    else
      warn "node not found"
    fi
    bootstrap_node
    node_version_ok || fail "Node.js >= 18.17 still unavailable after bootstrap"
    ok "node $(node -v)"
  fi
  command -v npm >/dev/null 2>&1 || fail "npm not found. Reinstall Node.js >= 18.17 from https://nodejs.org (npm is bundled), then re-run."
  ok "npm $(npm -v)"

  # 2. resolve what to install
  if [ -n "${NODEFORGE_VERSION:-}" ] && [ -z "${NODEFORGE_PACKAGE:-}" ]; then
    spec="${PACKAGE}@${NODEFORGE_VERSION}"
  else
    spec="${NODEFORGE_PACKAGE:-${PACKAGE}}"
  fi

  # 3. install (global first; fall back to a user prefix on permission errors)
  BIN_PATH=""
  PATH_HINT=""
  if [ -n "${NODEFORGE_PREFIX:-}" ]; then
    install_into_prefix "${NODEFORGE_PREFIX}" || fail "install into ${NODEFORGE_PREFIX} failed"
  else
    info "installing globally via npm"
    if npm install -g --no-fund --no-audit "$spec"; then
      BIN_PATH="$(npm prefix -g 2>/dev/null)/bin/${BIN_NAME}"
    else
      warn "global install failed — usually an EACCES permission issue"
      USER_PREFIX="${HOME}/.nodeforge"
      install_into_prefix "${USER_PREFIX}" || fail "user-prefix install also failed"
      PATH_HINT="export PATH=\"${USER_PREFIX}/node_modules/.bin:\$PATH\""
    fi
  fi

  # 4. verify
  if [ "${NODEFORGE_SKIP_VERIFY:-0}" = "1" ]; then
    warn "skipping post-install verification (NODEFORGE_SKIP_VERIFY=1)"
  else
    [ -x "$BIN_PATH" ] || BIN_PATH="${BIN_NAME}"
    ver=$("$BIN_PATH" --version 2>/dev/null) || fail "installed, but '${BIN_NAME}' did not run"
    ok "verified ${BIN_NAME} v${ver}"
  fi

  # 5. next steps
  printf '\n'
  info "${GREEN}done${RESET} — nodeforge is ready"
  printf '\n'
  printf '  get started:\n'
  printf '    %sinit%s      scaffold .nodeforge/config.json\n' "${BOLD}" "${RESET}"
  printf '    %sdoctor%s    check your environment\n' "${BOLD}" "${RESET}"
  printf '    %sscan .%s     deterministic security scan\n' "${BOLD}" "${RESET}"
  printf '    %sreview .%s   full verification pipeline\n' "${BOLD}" "${RESET}"
  if [ -n "$PATH_HINT" ]; then
    printf '\n'
    warn "add nodeforge to your PATH — append this to your shell rc (~/.zshrc or ~/.bashrc):"
    printf '    %s\n' "$PATH_HINT"
  fi
  printf '\n'
  printf '  uninstall: npm uninstall -g %s\n' "${PACKAGE}"
  printf '\n'
}

main "$@"
