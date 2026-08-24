#!/usr/bin/env bash
# prdt v1 install — mirror discipline to ~/.prdt (1-way), register agents + the hook
# roster. The roster COUNT is never written down here: it is derived from
# scripts/hook-manifest.json (§0 `HOOK_COUNT`), because a literal in this header and a
# literal in §4's progress line both went stale the moment T-490 added the 11th hook —
# a wrong count in a user-visible line during a load-bearing operation is the defect.
# (Canonical name since T-293: was prdt-install.sh during pdt-* coexistence;
#  a thin prdt-install.sh forwarder remains for older installed `prdt update` copies.)
# Statusline (T-330): default-on when nothing is registered yet (fresh install, or
# after legacy-statusline cleanup) — a fresh install without --statusline used to
# leave the user with no statusline at all. Any EXISTING statusLine (ours or a
# custom one) is left untouched to avoid clobbering it; pass --statusline to force
# re-registration, or --no-statusline to opt out on a fresh install.
#
# Usage: install.sh [--statusline|--no-statusline]
set -euo pipefail

STATUSLINE_MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --statusline) STATUSLINE_MODE="on" ;;
    --no-statusline) STATUSLINE_MODE="off" ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
say() { printf '%s\n' "$*"; }
# T-485: every abort goes through die() — non-zero exit + the NAME of what is wrong
# on stderr. A failed run is distinguishable from a clean one by exit code alone.
die() { printf 'prdt-install: %s\n' "$*" >&2; exit 1; }
TMP=""
cleanup() { [ -n "${TMP:-}" ] || return 0; rm -f "$TMP"; }
trap cleanup EXIT

command -v jq >/dev/null 2>&1 || die "jq is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"

# 0. Preflight the hook roster manifest — BEFORE anything is mirrored or written.
#    scripts/hook-manifest.json is the SoT §1 (mirror copy) and §4 (settings.json
#    registration) both derive from. It used to be read only inside §4's
#    `jq … > "$TMP" && mv "$TMP" "$SETTINGS"`: `set -e` does NOT abort on a
#    non-terminal failure in an `&&` list (bash 3.2.57 measured), so a missing or
#    corrupt manifest made jq fail, the mv never ran, and the installer still
#    printed "done" and exited 0 having registered ZERO hooks — the entire
#    discipline injection silently gone on a teammate's machine. (T-485/S5)
#    Validating up front also covers a bad $ROOT: the manifest path is under it.
MANIFEST="$ROOT/scripts/hook-manifest.json"
[ -f "$MANIFEST" ] || die "hook roster manifest not found: $MANIFEST — nothing installed"
jq -e 'type == "object"' "$MANIFEST" >/dev/null 2>&1 \
  || die "hook roster manifest is not valid JSON: $MANIFEST — nothing installed"
jq -e '(.basenames | type) == "array" and (.basenames | length) > 0' "$MANIFEST" >/dev/null 2>&1 \
  || die "hook roster manifest has no non-empty \`basenames\` array: $MANIFEST — nothing installed"
jq -e '(.registrations | type) == "array" and (.registrations | length) > 0' "$MANIFEST" >/dev/null 2>&1 \
  || die "hook roster manifest has no non-empty \`registrations\` array: $MANIFEST — nothing installed"
jq -e 'all(.registrations[];
         (.event | type) == "string" and (.hooks | type) == "array" and (.hooks | length) > 0)' \
   "$MANIFEST" >/dev/null 2>&1 \
  || die "hook roster manifest has a registration without a string \`event\` or a non-empty \`hooks\` array: $MANIFEST — nothing installed"

UNKNOWN_HOOKS="$(jq -r '((.registrations | map(.hooks[])) - .basenames) | unique | join(", ")' "$MANIFEST")"
[ -z "$UNKNOWN_HOOKS" ] \
  || die "hook roster manifest registers hooks absent from \`basenames\`: $UNKNOWN_HOOKS — nothing installed"

# The roster drives §1's copy loop too, so the hand-written cp list can no longer
# drift from the manifest (that drift is how a registration ends up pointing at a
# script the installer never copied).
HOOK_BASENAMES="$(jq -r '.basenames[]' "$MANIFEST")"
# Roster size for the §4 progress line — derived, never typed. The manifest is the one
# roster SoT both this script and the GUI reduce over, so the count the user reads comes
# from the same place the registration does.
HOOK_COUNT="$(jq -r '.basenames | length' "$MANIFEST")"
MISSING_HOOKS=""
while IFS= read -r b; do
  [ -n "$b" ] || continue
  [ -f "$ROOT/scripts/hooks/$b" ] || MISSING_HOOKS="$MISSING_HOOKS $b"
done <<EOF
$HOOK_BASENAMES
EOF
[ -z "$MISSING_HOOKS" ] \
  || die "hook scripts named by the manifest are missing from $ROOT/scripts/hooks:$MISSING_HOOKS — nothing installed"

# 1. mirror (1-way: repo → home). User content lives in the two NON-mirrored stores
#    — overrides/ (per-turn rules) and wiki/ (machine facts, §8b) — which this step
#    only ever creates: the rm -rf below is scoped to discipline/ alone, so a fresh
#    install and an update both leave accumulated machine content standing.
say "1) Mirroring discipline → $PRDT_HOME"
mkdir -p "$PRDT_HOME/overrides" "$PRDT_HOME/wiki" "$PRDT_HOME/hooks" "$PRDT_HOME/bin"
rm -rf "$PRDT_HOME/discipline"
cp -R "$ROOT/discipline" "$PRDT_HOME/discipline"
cp "$ROOT/doctrine.md" "$PRDT_HOME/doctrine.md"
# hook set = the manifest roster (T-485: was a hand-written list that could drift
# from what §4 registers). Existence in the source tree was preflighted above.
while IFS= read -r b; do
  [ -n "$b" ] || continue
  cp "$ROOT/scripts/hooks/$b" "$PRDT_HOME/hooks/$b"
done <<EOF
$HOOK_BASENAMES
EOF
cp "$ROOT/scripts/prdt" "$PRDT_HOME/bin/prdt"
cp "$ROOT/scripts/statusline-prdt.sh" "$PRDT_HOME/bin/statusline-prdt.sh"
chmod +x "$PRDT_HOME/hooks/"*.sh "$PRDT_HOME/bin/prdt" "$PRDT_HOME/bin/statusline-prdt.sh"

# Never let §4 register a command that is not an executable file on this machine.
UNMIRRORED=""
while IFS= read -r b; do
  [ -n "$b" ] || continue
  [ -x "$PRDT_HOME/hooks/$b" ] || UNMIRRORED="$UNMIRRORED $b"
done <<EOF
$HOOK_BASENAMES
EOF
[ -z "$UNMIRRORED" ] \
  || die "hooks failed to mirror into $PRDT_HOME/hooks:$UNMIRRORED — settings.json not touched"

# menus are derived — regenerate against the installed mirror
PRDT_DISCIPLINE="$PRDT_HOME/discipline" "$PRDT_HOME/bin/prdt" menus >/dev/null
say "   mirrored (discipline + doctrine + hooks + bin, menus regenerated)"

# 2. prdt.env (잠정 확정 — 열린 항목 ①: 미니멀 계승)
ENV_FILE="$PRDT_HOME/prdt.env"
if [ ! -f "$ENV_FILE" ]; then
  say "2) Writing $ENV_FILE"
  {
    printf 'PRDT_REPO=%s\n' "$ROOT"
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'PRDT_HOOKS_INSTALLED=true\n'
    printf 'PRDT_STATUSLINE_INSTALLED=false\n'
    printf 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\n'
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  say "2) $ENV_FILE exists — updating PRDT_REPO only"
  python3 - "$ENV_FILE" "$ROOT" <<'PYEOF'
import sys
path, repo = sys.argv[1], sys.argv[2]
lines = [l for l in open(path).read().splitlines() if not l.startswith("PRDT_REPO=")]
lines.insert(0, f"PRDT_REPO={repo}")
open(path, "w").write("\n".join(lines) + "\n")
PYEOF
fi

# 3. agents (copy — additive; pdt-*/pdtl-* untouched)
say "3) Installing agents → $CLAUDE_DIR/agents"
mkdir -p "$CLAUDE_DIR/agents"
cp "$ROOT"/agents/prdt-*.md "$CLAUDE_DIR/agents/"

# 4. hooks merge into ~/.claude/settings.json (idempotent: prdt entries replaced, others preserved)
#    Also sweeps out the deleted legacy pdt-* hook set (T-316 C3a): a machine that
#    previously ran the pre-T-293 installer still carries settings.json entries whose
#    commands point at packages/core/scripts/hooks/<basename>.sh scripts that no longer
#    exist — every session then fails those with command-not-found. We strip them by the
#    repo-distributed path SUFFIX only, so other apps' and users' own hooks are untouched.
#    T-414: the roster/event/matcher/order this step registers is no longer hand-written
#    here — it's derived from scripts/hook-manifest.json (the SoT onboarding.ts's
#    installPrdtHooks reduces over too), via jq --slurpfile. Edit the manifest, not this
#    reduce, to change the roster.
say "4) Registering hook ${HOOK_COUNT}종 in $CLAUDE_DIR/settings.json (+ legacy pdt-* cleanup)"
SETTINGS="$CLAUDE_DIR/settings.json"   # MANIFEST preflighted in §0
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
# temp lives NEXT TO settings.json so the mv below is an atomic same-filesystem
# rename: settings.json is either the fully verified new content or byte-identical
# to what it was — never a half-written middle state. (T-485)
TMP="$(mktemp "$SETTINGS.XXXXXX")"
jq --arg h "$PRDT_HOME/hooks/" --slurpfile manifest "$MANIFEST" '
  # C3a: legacy pdt-* hook basenames this repo distributed (deleted in T-293/T-311).
  (["post-edit-format.sh","post-compact-doctrine.sh","stop-verify.sh",
    "post-delegate-state-write.sh","pre-delegate-task-check.sh","pre-delegate-ctx-lang.sh",
    "pre-chunking-warn.sh","post-bash-strip-cost.sh","pre-frontmatter-lint.sh",
    "post-ticket-status-verify.sh","pre-git-posture.sh","session-start-doctrine.sh",
    "pre-doctrine-guard.sh","pre-phase-gate-guard.sh","prompt-gate-inject.sh",
    "session-start-po-state-migrate.sh","pre-po-state-shape-guard.sh",
    "post-po-state-shape-guard.sh"]) as $legacy |
  def isLegacy(cmd): (cmd) as $c | any($legacy[]; . as $b | $c | endswith("/scripts/hooks/" + $b));
  def stripLegacy(arr): (arr // []) | map(
    .hooks = ((.hooks // []) | map(select(isLegacy(.command // "") | not)))
  ) | map(select((.hooks | length) > 0));
  def strip(ev): (.hooks[ev] // []) | map(
    .hooks = ((.hooks // []) | map(select((.command // "") | (startswith($h) or startswith("\"" + $h)) | not)))
  ) | map(select((.hooks | length) > 0));
  .hooks = (.hooks // {}) |
  # sweep legacy pdt-* out of EVERY event array (incl. PostCompact/Stop, and the
  # legacy pdt-* PreToolUse entries — T-491 re-adds PreToolUse under a DIFFERENT
  # basename, and this sweep matches legacy basenames, not the event key), then
  # drop any now-empty event key.
  .hooks = (.hooks | with_entries(.value = stripLegacy(.value)) | with_entries(select((.value | length) > 0))) |
  # T-358/T-326/T-423/T-445: the four small inject hooks (audience, plan-tier,
  # machine overrides, project overrides) ride the SAME matcher as the
  # discipline hook on SessionStart(startup|resume|clear), SessionStart(compact)
  # and SubagentStart, each as its OWN hook command entry (never merged into
  # another additionalContext string), in precedence order -- machine overrides
  # second-to-last, project overrides LAST for `canonical < machine < project`.
  # T-445 measured that co-registered hooks render in COMPLETION order, not
  # registration order, so the payload text carries the precedence; the array
  # order is intent, not enforcement. That order lives in the manifest per-event
  # hooks array -- this reduce just replays it.
  ($manifest[0].registrations) as $regs |
  ($regs | map(.event) | unique) as $events |
  reduce $events[] as $ev (.;
    .hooks[$ev] = (strip($ev) + ($regs | map(select(.event == $ev)) | map(
      (if .matcher == null then {} else {matcher: .matcher} end)
      + {hooks: (.hooks | map({type: "command", command: ("\"" + $h + . + "\"")}))}
    )))
  ) |
  # C3a: drop the legacy statusline (deleted statusline-productune.sh). The prdt
  # statusline (§6, default-on) is a different basename and is never matched here;
  # a user custom statusLine is preserved (only the repo-distributed suffix matches).
  (if ((.statusLine.command // "")
        | (endswith("/scripts/statusline-productune.sh")
           or endswith("/scripts/statusline-productune.sh\"")))
   then del(.statusLine) else . end)
' "$SETTINGS" > "$TMP" || die "settings merge failed (jq) — $SETTINGS left unchanged, no hooks registered"

# Verify the CANDIDATE before it replaces settings.json, so the file can never end
# up claiming a registration that is not really there: every manifest registration
# must be present, and no command under $PRDT_HOME/hooks/ may be present that the
# manifest did not ask for (stale/dangling entries). (T-485)
jq -e --arg h "$PRDT_HOME/hooks/" --slurpfile manifest "$MANIFEST" '
  ($manifest[0].registrations) as $regs |
  ([$regs[] | .event as $ev | .hooks[] | {ev: $ev, cmd: ("\"" + $h + . + "\"")}]) as $want |
  ([(.hooks // {}) | to_entries[] | .key as $ev | (.value // [])[]
    | (.hooks // [])[] | {ev: $ev, cmd: (.command // "")}]) as $got |
  all($want[]; . as $w | any($got[]; . == $w))
  and all($got[]; . as $g
    | ((($g.cmd | startswith($h)) or ($g.cmd | startswith("\"" + $h))) | not)
      or any($want[]; . == $g))
' "$TMP" >/dev/null \
  || die "hook registration did not match the manifest roster — $SETTINGS left unchanged"
mv "$TMP" "$SETTINGS"
TMP=""

# 5. PATH symlink
if [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  ln -sf "$PRDT_HOME/bin/prdt" "$HOME/.local/bin/prdt"
  say "5) Symlinked ~/.local/bin/prdt (ensure ~/.local/bin is on PATH)"
fi

# 6. statusline — default-on, but never clobber an existing statusLine (ours or a
#    custom one); --statusline forces re-registration, --no-statusline opts out.
CURRENT_STATUSLINE="$(jq -r '.statusLine.command // empty' "$SETTINGS")"
REGISTER_STATUSLINE=false
case "$STATUSLINE_MODE" in
  off) say "6) Statusline NOT registered (--no-statusline)" ;;
  on) REGISTER_STATUSLINE=true ;;
  *)
    if [ -z "$CURRENT_STATUSLINE" ]; then
      REGISTER_STATUSLINE=true
    else
      say "6) Statusline NOT registered (existing statusLine preserved) — force with: install.sh --statusline"
    fi
    ;;
esac

if [ "$REGISTER_STATUSLINE" = true ]; then
  say "6) Registering statusline"
  TMP="$(mktemp "$SETTINGS.XXXXXX")"
  jq --arg cmd "$PRDT_HOME/bin/statusline-prdt.sh" \
     '.statusLine = {type: "command", command: ("\"" + $cmd + "\"")}' "$SETTINGS" > "$TMP" \
    || die "statusline registration failed (jq) — $SETTINGS left unchanged"
  mv "$TMP" "$SETTINGS"
  TMP=""
  python3 - "$ENV_FILE" <<'PYEOF'
import sys
path = sys.argv[1]
s = open(path).read().replace("PRDT_STATUSLINE_INSTALLED=false", "PRDT_STATUSLINE_INSTALLED=true")
open(path, "w").write(s)
PYEOF
fi

say "prdt install done."
