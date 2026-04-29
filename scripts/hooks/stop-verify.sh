#!/usr/bin/env bash
# Claude Code hook — Stop, matcher: pdt-developer
# When pdt-developer signals "done", run a deterministic typecheck/build pass.
# On failure, return decision:block JSON so Claude is forced to take another turn
# and fix the issue before handing off to QA.
#
# Quiet on success. Conservative: only acts when (a) the agent is pdt-developer,
# and (b) there's a recognizable typecheck/build script in package.json.
# Times out at 90s so a runaway build never wedges the session.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"

extract_field() {
  local key="$1"
  printf '%s' "$EVENT_JSON" \
    | python3 -c "import json,sys
try:
    data=json.loads(sys.stdin.read())
    val=data
    for k in '$key'.split('.'):
        val=val.get(k) if isinstance(val,dict) else None
        if val is None: break
    print(val if val is not None else '')
except Exception:
    print('')
" 2>/dev/null
}

AGENT="$(extract_field agent_name)"
[ -z "$AGENT" ] && AGENT="$(extract_field agent)"
[ "$AGENT" = "pdt-developer" ] || exit 0

find_project_root() {
  local d="$PWD"
  while [ "$d" != "/" ]; do
    [ -f "$d/package.json" ] && { echo "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

ROOT="$(find_project_root)" || exit 0
PKG="$ROOT/package.json"
[ -f "$PKG" ] || exit 0

PM=""
if [ -f "$ROOT/bun.lockb" ] || [ -f "$ROOT/bun.lock" ]; then PM="bun"
elif [ -f "$ROOT/pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "$ROOT/yarn.lock" ]; then PM="yarn"
else PM="npm"
fi

has_script() { grep -q "\"$1\"[[:space:]]*:" "$PKG" 2>/dev/null; }

run() {
  local cmd=("$@")
  if command -v timeout >/dev/null 2>&1; then
    timeout 90 "${cmd[@]}" >/dev/null 2>&1
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 90 "${cmd[@]}" >/dev/null 2>&1
  else
    "${cmd[@]}" >/dev/null 2>&1
  fi
}

cd "$ROOT" || exit 0

CHECK=""
if has_script typecheck; then CHECK="typecheck"
elif has_script build; then CHECK="build"
fi

[ -z "$CHECK" ] && exit 0

case "$PM" in
  bun)  run bun run "$CHECK"  ;;
  pnpm) run pnpm "$CHECK"     ;;
  yarn) run yarn "$CHECK"     ;;
  npm)  run npm run "$CHECK"  ;;
esac
RC=$?

if [ "$RC" -ne 0 ]; then
  printf '{"decision":"block","reason":"%s failed via %s — fix before stopping. Re-run `%s %s` to inspect."}\n' \
    "$CHECK" "$PM" "$PM" "$([ "$PM" = "npm" ] && echo "run $CHECK" || echo "$CHECK")"
  exit 0
fi

exit 0
