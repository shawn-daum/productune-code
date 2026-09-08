#!/usr/bin/env bash
# prdt — REGISTER resolver + injection for the PO's conversational output.
#
# FILENAME NOTE (T-586): this file is named for the key it started with —
# `audience-mode`, T-326, one token in ~/.prdt/audience-mode. It is now the
# resolver for the whole register OBJECT: `$PRDT_HOME/register`, four keys. The
# name stays because renaming a hook moves the manifest, install.sh's mirror
# copy, the GUI's hasPrdtHooksRegistered roster and every installed
# ~/.claude/settings.json on every machine — a cost larger than the name. There
# is exactly ONE register mechanism after T-586: `audience` is a key of this
# file, not a parallel store, and `~/.prdt/audience-mode` is never read here.
#
# Registered on the SAME events/matchers as prdt-session-start.sh, as its own
# small hook command entry — the T-358 pattern: a small must-not-be-lost payload
# gets its own hook process so the main discipline payload's persist-truncation
# can never drop it (see prdt-overrides-inject.sh, fact--claude-hooks).
#
# THE REGISTER FILE — `$PRDT_HOME/register`, machine scope only (the register is
# a property of the operator reading the PO, never of a project, so there is no
# project layer — a cloned repo must not be able to change how the product
# addresses its owner). One `key=value` per line; `#` comments and blank lines
# allowed; whitespace around key and value trimmed; unknown keys ignored
# (forward-compatible); a repeated key → last wins. Written by `prdt register
# set` and the GUI (@productune/core settings/register.ts) — a hand-edited line
# is the one way an illegal value gets in, and this file is where it stops.
#
# THE DOMAIN — this resolver is the single source of truth for what is legal.
# `--list` prints it; nothing else (CLI, doctor, GUI) is allowed to know it by
# heart except as a test-pinned copy.
#   audience   planner | developer        default planner   (T-326 absorbed)
#   form       prose | outline            default prose
#   structure  default | planner-tables   default default
#   address    free text — ONE line · 1–32 bytes · no control or line-break
#              characters · valid UTF-8; default none (the user is not addressed
#              by a name or title). A value, not a rule: it is emitted only
#              inside a fixed sentence of this file's own.
# An out-of-domain value resolves to the key's default and never reaches a
# reader; the block only says HOW MANY lines were ignored, never their bytes.
#
# BODIES — `discipline/register/<key>-<value>.md` (install mirror), each with
# `key:` · `value:` · `governs:` frontmatter naming the surfaces it shapes
# (closed vocabulary in contracts.md §Language). A legal value with no body file
# emits nothing for that key (`audience=developer` is 0 B, byte-identical to
# T-326), so a machine at every default injects exactly the planner body it
# always did and nothing more.
#
# MODES
#   (hook)      stdin = event JSON. PO only. Emits the register block: header +
#               resolved values + the bodies of the keys in force. No body and
#               no address in force → no output at all (never an empty block).
#   --list      JSON: keys · domain · default · body presence. The domain's SoT.
#   --resolve   JSON: resolved values + warnings (unknown key · out-of-domain ·
#               address shape · malformed line). For `prdt register show` and
#               `prdt doctor`; never injected.
#   --binding   ONE plain-text line for the per-turn channel
#               (prdt-user-prompt.sh appends it): the non-default keys in force.
#               EMPTY when every key is at its default — a default machine pays
#               nothing per turn.
#
# Scope: PO only. Worker output reaches the user re-voiced by the PO, so it is
# covered here; workers' own direct register is out of scope.
# Ordering: registered BEFORE both override hooks on the same matcher; those
# blocks say in their own text that they outrank this one, which is what actually
# settles it (T-445: co-registered hooks render in completion order, not
# registration order, so position alone decides nothing).
#
# NOTE the two separate paths of T-326: fixed GUI strings (buttons, labels,
# onboarding copy) are i18n (packages/gui/src/locales); the PO's model-generated
# prose cannot be i18n'd — THIS hook is that second path.

set +e
# Byte semantics on purpose (fact--claude-hooks): the address cap is in BYTES,
# and the control-character scan below is a byte scan. Set before any expansion.
export LC_ALL=C

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
REG_FILE="$PRDT_HOME/register"
# Bodies: the discipline tree that is actually bound — PRDT_DISCIPLINE lets the
# CLI/doctor ask about a source checkout, the way prdt-session-start.sh --plan does.
if [ -n "${PRDT_DISCIPLINE:-}" ] && [ -d "$PRDT_DISCIPLINE" ]; then
  BODY_DIR="$PRDT_DISCIPLINE/register"
else
  BODY_DIR="$PRDT_HOME/discipline/register"
fi

# ── domain (the ONE place it is written) ──────────────────────────────────────
KEYS="audience form structure address"
domain_of()  { case "$1" in audience) echo "planner developer" ;; form) echo "prose outline" ;; structure) echo "default planner-tables" ;; esac; }
default_of() { case "$1" in audience) echo planner ;; form) echo prose ;; structure) echo default ;; address) echo "" ;; esac; }
ADDRESS_MAX_BYTES=32
ADDRESS_SHAPE="one line · 1–32 bytes · no control or line-break characters · valid UTF-8"

# ── resolution ────────────────────────────────────────────────────────────────
R_audience="$(default_of audience)"; R_form="$(default_of form)"; R_structure="$(default_of structure)"; R_address=""
WARNS=""; IGNORED=0; REG_PRESENT=0

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
warn() { WARNS="${WARNS}${WARNS:+
}$1"; IGNORED=$((IGNORED + 1)); }
in_domain() { local v="$1" d; for d in $(domain_of "$2"); do [ "$v" = "$d" ] && return 0; done; return 1; }

# Shape match for the one free value. The address goes into a fixed sentence of
# this file's own, so what must be impossible is a value that adds a LINE: every
# C0 control (CR · VT · FF · FS · GS · RS included) and DEL are rejected by a byte
# scan, the three multi-byte breaks (NEL · LS · PS) by literal match, and the
# bytes must be UTF-8. LF cannot occur — the file is read line by line. Then the
# byte cap: 32 bytes hold a name or a title and no room for a rule.
address_ok() {
  local v="$1" stripped
  [ -n "$v" ] || return 1
  [ "${#v}" -le "$ADDRESS_MAX_BYTES" ] || return 1
  stripped="$(printf '%s' "$v" | tr -d '\001-\037\177')"
  [ "$stripped" = "$v" ] || return 1
  case "$v" in *$'\xc2\x85'*|*$'\xe2\x80\xa8'*|*$'\xe2\x80\xa9'*) return 1 ;; esac
  printf '%s' "$v" | iconv -f UTF-8 -t UTF-8 >/dev/null 2>&1 || return 1
  return 0
}

parse_register() {
  [ -f "$REG_FILE" ] || return 0
  REG_PRESENT=1
  local n=0 line key val
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line="${line%$'\r'}"
    line="$(trim "$line")"
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) ;; *) warn "L$n: not a key=value line — ignored"; continue ;; esac
    key="$(trim "${line%%=*}")"; val="$(trim "${line#*=}")"
    case "$key" in
      audience|form|structure)
        if in_domain "$val" "$key"; then eval "R_$key=\"\$val\""
        else warn "L$n: $key= is outside its domain ($(domain_of "$key" | tr ' ' '|')) — resolved to the default \`$(default_of "$key")\`"; fi ;;
      address)
        if address_ok "$val"; then R_address="$val"
        else warn "L$n: address= fails its shape ($ADDRESS_SHAPE) — address unused"; fi ;;
      *)
        # the key name is file bytes: it reaches `--resolve` (CLI/doctor, never the
        # model context) so the person can find the line; the block counts it only.
        warn "L$n: unknown key \`$(printf '%s' "$key" | tr -d '\001-\037\177' | cut -c1-40)\` — ignored" ;;
    esac
  done < "$REG_FILE"
}

body_path() { printf '%s/%s-%s.md' "$BODY_DIR" "$1" "$2"; }
# Body minus its frontmatter (`---` … `---` at the top) — the frontmatter is the
# object's metadata for tooling, not text the PO should read as instruction.
body_text() { awk 'NR==1 && $0=="---" {fm=1; next} fm && $0=="---" {fm=0; next} !fm' "$1"; }
body_governs() { sed -n 's/^governs:[[:space:]]*\[\(.*\)\][[:space:]]*$/\1/p' "$1" | head -1 | tr -d ' '; }

# Keys in force with a body file present → "key value path" per line.
active_bodies() {
  local k v p
  for k in audience form structure; do
    eval "v=\"\$R_$k\""
    p="$(body_path "$k" "$v")"
    [ -s "$p" ] && printf '%s %s %s\n' "$k" "$v" "$p"
  done
}
governs_union() {
  # union of the active bodies' governs; the address (no body) binds user-chat,
  # and so does the object as a whole when no body is in force.
  local g all=""
  while read -r _ _ p; do [ -n "$p" ] && all="$all,$(body_governs "$p")"; done <<EOF
$(active_bodies)
EOF
  all="$all,user-chat"
  printf '%s' "$all" | tr ',' '\n' | sed '/^$/d' | awk '!seen[$0]++' | paste -sd, - | sed 's/,/ · /g'
}
non_default_pairs() {
  local k v out=""
  for k in audience form structure; do
    eval "v=\"\$R_$k\""
    [ "$v" != "$(default_of "$k")" ] && out="${out}${out:+ · }$k=$v"
  done
  [ -n "$R_address" ] && out="${out}${out:+ · }address=\"$R_address\""
  printf '%s' "$out"
}
all_pairs() {
  printf 'audience=%s · form=%s · structure=%s · address=%s' "$R_audience" "$R_form" "$R_structure" \
    "$([ -n "$R_address" ] && printf '"%s"' "$R_address" || printf 'none')"
}

# ── --list: the domain, as JSON ───────────────────────────────────────────────
if [ "${1:-}" = "--list" ]; then
  command -v jq >/dev/null 2>&1 || exit 0
  rows=""
  for k in audience form structure; do
    bodies=""
    for v in $(domain_of "$k"); do
      if [ -s "$(body_path "$k" "$v")" ]; then present=true; else present=false; fi
      bodies="${bodies}${bodies:+,}\"$v\":$present"
    done
    dom="$(domain_of "$k" | tr ' ' '\n' | jq -R . | jq -sc .)"
    rows="${rows}${rows:+,}{\"key\":\"$k\",\"kind\":\"enum\",\"domain\":$dom,\"default\":\"$(default_of "$k")\",\"bodies\":{$bodies}}"
  done
  jq -n --argjson rows "[$rows]" --arg file "$REG_FILE" --arg bodies "$BODY_DIR" --arg shape "$ADDRESS_SHAPE" \
     --argjson max "$ADDRESS_MAX_BYTES" \
     '{file:$file, bodies_dir:$bodies, keys:($rows + [{key:"address",kind:"text",shape:$shape,max_bytes:$max,default:null}])}'
  exit 0
fi

parse_register

# ── --resolve: values + warnings, as JSON (CLI / doctor) ──────────────────────
if [ "${1:-}" = "--resolve" ]; then
  command -v jq >/dev/null 2>&1 || exit 0
  jq -n --arg file "$REG_FILE" --argjson present "$([ "$REG_PRESENT" = 1 ] && echo true || echo false)" \
     --arg a "$R_audience" --arg f "$R_form" --arg s "$R_structure" --arg ad "$R_address" \
     --arg warns "$WARNS" --arg governs "$(governs_union)" --arg binding "$(non_default_pairs)" \
     '{file:$file, present:$present,
       values:{audience:$a, form:$f, structure:$s, address:(if $ad == "" then null else $ad end)},
       defaults:{audience:"planner", form:"prose", structure:"default", address:null},
       governs:$governs, binding:(if $binding == "" then null else $binding end),
       warnings:($warns | split("\n") | map(select(length > 0)))}'
  exit 0
fi

# ── --binding: the per-turn line ──────────────────────────────────────────────
if [ "${1:-}" = "--binding" ]; then
  pairs="$(non_default_pairs)"
  [ -n "$pairs" ] || exit 0
  printf '[prdt register] %s — governs %s. Binding only; any body arrived at session start.\n' \
    "$pairs" "$(governs_union)"
  exit 0
fi

# ── hook mode: the session-start register block ──────────────────────────────
EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_NAME="SessionStart"
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EN="$(printf '%s' "$EVENT_JSON" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  [ -n "$EN" ] && EVENT_NAME="$EN"
fi

# PO only — the register shapes the PO's conversational output (T-326 scope).
[ "$AGENT_TYPE" = "prdt-po" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

BODIES="$(active_bodies)"
[ -n "$BODIES" ] || [ -n "$R_address" ] || exit 0   # nothing in force → no block at all

# T-483 audit note — the body splice below stays RAW deliberately, and that is
# safe here: every body lives under the install-managed mirror — the same trust
# class as the doctrine/contracts/habit bodies prdt-session-start.sh splices raw.
# No clone or PR can reach it, and an attacker who can write ~/.prdt/discipline
# can rewrite the hook scripts in ~/.prdt/hooks directly, so quoting a body would
# add no boundary. It is also live register INSTRUCTIONS to apply, which a data
# gutter would demote. The untrusted-body gutter (quote_body in the other hooks)
# covers exactly the files that cross a trust boundary: project `.prdt/`
# (clone-carried) and user-authored ~/.prdt/overrides. The register FILE is
# user-authored too, which is why nothing from it is spliced: enum values are
# matched and the matched literal emitted, the address is shape-matched into a
# fixed slot, and an ignored line is reported as a count. Adding a splice of any
# OTHER source here requires the gutter.
emit_block() {
  printf '[prdt register — PO conversational register]\n'
  printf 'Resolved from %s (an absent key takes its default): %s. governs: %s — the register shapes HOW you say things on those surfaces, never WHAT you do or decide. Override blocks (machine, then project, each its own hook output) still win over this block. The `[prdt register]` line on a prompt (present only while some key is off its default) is the binding of these same values.\n' \
    "$REG_FILE" "$(all_pairs)" "$(governs_union)"
  if [ -n "$R_address" ]; then
    printf 'Address the user as "%s" wherever the user is named or addressed in user-chat.\n' "$R_address"
  fi
  if [ "$IGNORED" -gt 0 ]; then
    printf '%s line(s) of the register file were ignored (malformed, unknown key, or a value outside its domain — `prdt register show` names them); nothing from those lines is in force.\n' "$IGNORED"
  fi
  while read -r k v p; do
    [ -n "$p" ] || continue
    printf '%s\n' "" "----- BEGIN register $k=$v ($p) -----"
    body_text "$p"
    printf '%s\n' "----- END register $k=$v -----"
  done <<EOF
$BODIES
EOF
}

emit_block | jq -Rs --arg ev "$EVENT_NAME" '{hookSpecificOutput:{hookEventName:$ev,additionalContext:.}}'
exit 0
