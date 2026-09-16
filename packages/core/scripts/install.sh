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
#
# This script INSTALLS. It has no dry-run, plan or measure mode, and it writes
# three places OUTSIDE $PRDT_HOME: $CLAUDE_DIR/agents, $CLAUDE_DIR/settings.json and
# $HOME/.local/bin/prdt (§3/§4/§5). T-640, OBSERVED BY RUNNING: an argument this
# script did not know (`--plan po`) used to be ignored, so `PRDT_HOME=<scratch>
# install.sh --plan po` — run to MEASURE injected bytes — mirrored into the scratch
# dir and registered that scratch roster into the user's real settings.json, twice
# (112 entries; every hook fired three times; `prdt` died when the scratch dir was
# deleted). Now: an unknown argument aborts before anything is written, the
# out-of-PRDT_HOME targets are printed before the first write, and every path is
# resolved physically before it is compared or written — a Claude config only takes the
# roster of its OWN home's mirror ($PRDT_HOME = <home>/.prdt), any other pairing is
# refused whatever spelling it arrives in (§0b). The measurement path
# is the hook, read-only: `PRDT_HOME=<scratch copy> bash scripts/hooks/prdt-session-start.sh --plan <persona> </dev/null`.
set -euo pipefail

STATUSLINE_MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --statusline) STATUSLINE_MODE="on" ;;
    --no-statusline) STATUSLINE_MODE="off" ;;
    --plan|--plan=*)
      printf 'prdt-install: `--plan` is not an install.sh flag — install.sh only installs (hooks into settings.json, agents, PATH symlink). To measure injected bytes, read-only: PRDT_HOME=<scratch copy of discipline/ + doctrine.md> bash scripts/hooks/prdt-session-start.sh --plan <persona> </dev/null — nothing installed\n' >&2
      exit 1 ;;
    *)
      printf 'prdt-install: unknown argument %s — usage: install.sh [--statusline|--no-statusline]; every run installs, so an argument it does not know is refused rather than ignored — nothing installed\n' "$arg" >&2
      exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
LOCAL_BIN="$HOME/.local/bin"
say() { printf '%s\n' "$*"; }
# T-485: every abort goes through die() — non-zero exit + the NAME of what is wrong
# on stderr. A failed run is distinguishable from a clean one by exit code alone.
die() { printf 'prdt-install: %s\n' "$*" >&2; exit 1; }
# Physical path resolution — symlinks, `..`, `//`, a trailing `/`, a relative path,
# and components that do not exist yet (a fresh $PRDT_HOME never does). Same physical
# resolution `cd -P … && pwd -P` does in find_proj, minus the must-already-exist
# restriction; python3 is a hard dependency of this script (checked below), so this is
# one line instead of a deepest-existing-ancestor walk in bash.
resolve_path() {
  python3 - "$1" <<'PYEOF'
import os, sys
print(os.path.realpath(sys.argv[1]))
PYEOF
}
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

# 0b. Resolve the paths this run keys on, refuse the pairing that is the incident, and
#     say where it writes OUTSIDE $PRDT_HOME — all before the first write (T-640).
#
#     The first cut of this guard compared SPELLINGS: `[ "$PRDT_HOME" = "$HOME/.prdt" ]`
#     and `[ "$CLAUDE_DIR" = "$HOME/.claude" ]`. OBSERVED BY RUNNING (QA, fixture homes):
#     five spellings of one directory walked straight through it — a trailing slash, a
#     `/.` suffix, a symlink, a relative path with the cwd at $HOME, and $HOME moved
#     elsewhere with CLAUDE_DIR named explicitly — each appending a second full roster to
#     the fixture user's settings.json; and four spellings of the DEFAULT tree
#     ($HOME/.prdt/, $HOME//.prdt, a symlink alias, $HOME with a trailing slash) were
#     refused with "PRDT_HOME=/x/.prdt/ is not /x/.prdt", telling a user their path is not
#     itself. One defect, two faces. So:
#       1) every path is resolved physically and the RESOLVED value is what the rest of
#          this script mirrors, registers and symlinks. Two spellings of one tree are now
#          one install: a second run spelled differently UPDATES the roster instead of
#          appending a duplicate (the §4 idempotency check matches on the command prefix,
#          so `$HOME/.prdt//hooks/` would have read as a foreign roster and doubled it —
#          the exact state the PO repaired by hand);
#       2) the guard keys on the PAIRING — which home's Claude config this mirror would be
#          registered into — not on the caller's spelling of $HOME. A Claude config belongs
#          to the home it sits in, and only that home's mirror ($PRDT_HOME = <home>/.prdt)
#          may register a hook roster into it. Everything else is the incident: a session
#          loading <home>/.claude would run hooks out of a tree that is not its own, and
#          when that tree is deleted it runs files that do not exist.
#     Arm 2 catches a $HOME moved off the config being written (arm 1 cannot see it);
#     arm 1 catches a config dir whose resolved name is not `.claude` (a ~/.claude symlinked
#     into a dotfiles repo) but which is still what this $HOME's sessions load.
#     The PATH symlink is the third out-of-home write: only a mirror that IS this HOME's
#     default mirror takes over the PATH command (§5).
PRDT_HOME_GIVEN="$PRDT_HOME"
CLAUDE_DIR_GIVEN="$CLAUDE_DIR"
PRDT_HOME="$(resolve_path "$PRDT_HOME")"
CLAUDE_DIR="$(resolve_path "$CLAUDE_DIR")"
LOCAL_BIN="$(resolve_path "$LOCAL_BIN")"
HOME_PRDT="$(resolve_path "$HOME/.prdt")"       # this $HOME's own mirror
HOME_CLAUDE="$(resolve_path "$HOME/.claude")"   # the config this $HOME's sessions load
CLAUDE_OWNER="$(dirname "$CLAUDE_DIR")"         # the home CLAUDE_DIR belongs to
OWNER_PRDT="$(resolve_path "$CLAUDE_OWNER/.prdt")"

REFUSAL=""
if [ "$(basename "$CLAUDE_DIR")" = ".claude" ] && [ "$PRDT_HOME" != "$OWNER_PRDT" ]; then
  REFUSAL="$CLAUDE_DIR is the Claude config of the home $CLAUDE_OWNER, whose mirror is $OWNER_PRDT"
elif [ "$CLAUDE_DIR" = "$HOME_CLAUDE" ] && [ "$PRDT_HOME" != "$HOME_PRDT" ]; then
  REFUSAL="$CLAUDE_DIR is the config the sessions of \$HOME=$HOME load, whose mirror is $HOME_PRDT"
fi
if [ -n "$REFUSAL" ]; then
  die "refused, nothing written — this run would register the hook roster of the mirror PRDT_HOME=$PRDT_HOME_GIVEN (resolves to $PRDT_HOME) into $CLAUDE_DIR/settings.json, but $REFUSAL. A Claude config only ever takes the roster of its own home's mirror; untouched: $CLAUDE_DIR/settings.json, $CLAUDE_DIR/agents, $LOCAL_BIN/prdt. To measure injected bytes use the read-only hook: PRDT_HOME=$PRDT_HOME bash $ROOT/scripts/hooks/prdt-session-start.sh --plan <persona> </dev/null. To install this mirror for real, point CLAUDE_DIR at a config in the mirror's own home $(dirname "$PRDT_HOME"); to install into $CLAUDE_DIR, put the mirror where that config looks for it (PRDT_HOME=$OWNER_PRDT)."
fi

RELOCATED=false
[ "$PRDT_HOME" = "$HOME_PRDT" ] || RELOCATED=true
[ "$PRDT_HOME" = "$PRDT_HOME_GIVEN" ] \
  || say "0) PRDT_HOME=$PRDT_HOME_GIVEN resolves to $PRDT_HOME — the resolved path is what is mirrored and registered"
[ "$CLAUDE_DIR" = "$CLAUDE_DIR_GIVEN" ] \
  || say "0) CLAUDE_DIR=$CLAUDE_DIR_GIVEN resolves to $CLAUDE_DIR — the resolved path is what is written"
SYMLINK_NOTE="symlink"
[ "$RELOCATED" = false ] || SYMLINK_NOTE="left as is — PRDT_HOME is relocated, so this mirror does not take over the PATH command"
say "0) Writes outside PRDT_HOME=$PRDT_HOME: $CLAUDE_DIR/settings.json (hook roster) · $CLAUDE_DIR/agents (prdt-*.md) · $LOCAL_BIN/prdt ($SYMLINK_NOTE)"

# 1. mirror (1-way: repo → home). User content lives in the two NON-mirrored stores
#    — overrides/ (per-turn rules) and wiki/ (machine facts, §8b) — which this step
#    only ever creates: the rm -rf below is scoped to discipline/ alone, so a fresh
#    install and an update both leave accumulated machine content standing.
say "1) Mirroring discipline → $PRDT_HOME"
mkdir -p "$PRDT_HOME/overrides" "$PRDT_HOME/wiki" "$PRDT_HOME/hooks" "$PRDT_HOME/bin"
# T-586: the register object (`register`, key=value) absorbs the T-326 one-token
# `audience-mode` file. A machine that recorded its audience level there keeps it:
# migrate ONCE into `register` as `audience=<value>` when no register file exists
# yet, then remove the old file — after this nothing reads audience-mode (one
# mechanism; the resolver never falls back to it). An existing register wins.
if [ -f "$PRDT_HOME/audience-mode" ]; then
  OLD_MODE="$(tr -d '[:space:]' < "$PRDT_HOME/audience-mode")"
  if [ ! -f "$PRDT_HOME/register" ]; then
    case "$OLD_MODE" in
      planner|developer)
        printf 'audience=%s\n' "$OLD_MODE" > "$PRDT_HOME/register.tmp"
        chmod 0600 "$PRDT_HOME/register.tmp"
        mv "$PRDT_HOME/register.tmp" "$PRDT_HOME/register"
        say "   audience-mode=$OLD_MODE → register (audience=$OLD_MODE); audience-mode removed" ;;
      *)
        say "   audience-mode=$OLD_MODE is outside audience's domain (planner|developer) — dropped; audience resolves to its default (planner); audience-mode removed" ;;
    esac
  elif [ ! -s "$PRDT_HOME/register" ]; then
    say "   audience-mode=$OLD_MODE dropped — register exists but is empty (0 B); audience resolves to its default (planner); audience-mode removed"
  elif ! grep -q '^audience=' "$PRDT_HOME/register"; then
    say "   audience-mode=$OLD_MODE dropped — register exists with no audience= key; audience resolves to its default (planner); audience-mode removed"
  fi
  rm -f "$PRDT_HOME/audience-mode"
fi
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

# 5. PATH symlink — only a mirror living in this HOME takes over the PATH command
#    (T-640: a relocated PRDT_HOME used to repoint the real ~/.local/bin/prdt at a
#    scratch tree, and the command died when that tree was deleted).
if [ "$RELOCATED" = true ]; then
  say "5) $LOCAL_BIN/prdt left as is (PRDT_HOME=$PRDT_HOME is not $HOME/.prdt)"
elif [ -d "$LOCAL_BIN" ] || mkdir -p "$LOCAL_BIN" 2>/dev/null; then
  ln -sf "$PRDT_HOME/bin/prdt" "$LOCAL_BIN/prdt"
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
