#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Write|Edit
# Auto-formats the project after Claude writes or edits a file.
# Silent on missing tooling: this is a "90% nice-to-have", not a gate.
#
# Detection order: bun → pnpm → yarn → npm. Honors a `format` script in package.json.
# Falls back to a local prettier if available. Never blocks the tool call.

set +e

read_event() { cat 2>/dev/null || true; }
EVENT="$(read_event)"   # currently unused — reserved for future selective triggering

find_project_root() {
  local d="$PWD"
  while [ "$d" != "/" ]; do
    [ -f "$d/package.json" ] && { echo "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

ROOT="$(find_project_root)" || exit 0
[ -f "$ROOT/package.json" ] || exit 0

PKG="$ROOT/package.json"
HAS_FORMAT_SCRIPT=0
grep -q '"format"[[:space:]]*:' "$PKG" 2>/dev/null && HAS_FORMAT_SCRIPT=1

PM=""
if [ -f "$ROOT/bun.lockb" ] || [ -f "$ROOT/bun.lock" ]; then PM="bun"
elif [ -f "$ROOT/pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "$ROOT/yarn.lock" ]; then PM="yarn"
elif [ -f "$ROOT/package-lock.json" ]; then PM="npm"
else PM="npm"
fi

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 30 "$@" >/dev/null 2>&1
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 30 "$@" >/dev/null 2>&1
  else
    "$@" >/dev/null 2>&1
  fi
}

cd "$ROOT" || exit 0

if [ "$HAS_FORMAT_SCRIPT" = 1 ]; then
  case "$PM" in
    bun)  run_with_timeout bun run format ;;
    pnpm) run_with_timeout pnpm format ;;
    yarn) run_with_timeout yarn format ;;
    npm)  run_with_timeout npm run format ;;
  esac
elif [ -x "$ROOT/node_modules/.bin/prettier" ]; then
  run_with_timeout "$ROOT/node_modules/.bin/prettier" --write --log-level=silent "$ROOT" || true
fi

exit 0
