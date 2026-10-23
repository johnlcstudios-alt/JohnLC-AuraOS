#!/usr/bin/env bash
# JohnLC AuraOS installer for macOS and Linux.
# Usage:  ./install.sh [--skip-build] [--no-link] [--dev] [--mirror <url>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- pretty colours ---------------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"
  GREEN="$(printf '\033[32m')"; RED="$(printf '\033[31m')"
  YELLOW="$(printf '\033[33m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; DIM=""; GREEN=""; RED=""; YELLOW=""; RESET=""
fi

say()  { printf '%s\n' "$1"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '  %s✖%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

# --- locate Node ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  die "Node.js was not found. Install Node 18+ from https://nodejs.org and re-run this script."
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node $(node -v) is too old. JohnLC AuraOS requires Node 18 or newer."
fi

if ! command -v npm >/dev/null 2>&1; then
  die "npm was not found. It normally ships with Node.js."
fi

ok "Node $(node -v) · npm $(npm -v)"

# --- hand off to the shared installer --------------------------------------
exec node "$SCRIPT_DIR/installer/setup.mjs" "$@"
