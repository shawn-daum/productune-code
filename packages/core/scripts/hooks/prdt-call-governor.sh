#!/usr/bin/env bash
# prdt — per-dispatch API-turn governor (T-491 S1). Registered TWICE, both
# matcher-less (every tool, every agent):
#   PostToolBatch — count one API turn
#   PreToolUse    — enforce the count
#
# WHY (T-498 ledger, measured on the v1.6 session): the token metric A is 96.2%
# cache_read, so `A ≈ API turns × context-per-turn`. Preamble bytes are ~3-5%
# and rework is 1.4%; the lever is how many turns ONE dispatch spends. Counting
# on PostToolBatch (one fire per assistant turn that used tools, whatever the
# batch size) and enforcing on PreToolUse is deliberate: a worker that issues
# five independent reads in ONE turn is charged ONE turn, so the batching
# discipline (T-491 S3) is rewarded here instead of punished. `prompt_id` was
# rejected as the unit — the probe showed it identifies a user PROMPT, not a
# turn.
#
# SCOPE — user decision 2026-08-19 (option A), do not widen it here:
#   prdt-developer        warn at 40, DENY at 60
#   prdt-qa · prdt-designer  warn only, never denied — QA's legitimate 100~131
#       call live-VM verifications must not be cut off. The estimated saving is
#       -20.6% instead of -26.3% because of this; that trade was approved.
#   anything else (main session, prdt-po, non-prdt subagents) — not counted,
#       never warned. Silence is the default everywhere.
#
# LATENCY BUDGET: this fires on EVERY tool call (v1.6: 5,124 worker calls), so
# it must be effectively free — no network, no runtime startup, no jq, no
# python. One `cat` fork to drain stdin, then bash builtins and local file
# appends only. The v1.6 worst hook was vercel-plugin at 439.7s cumulative; that
# is the mistake this file must not repeat.
#
# STATE: $PRDT_HOME/run/call-governor/ — machine-local, outside any repo, and
# outside the install mirror's rm -rf (install.sh §1 scopes that to
# discipline/). It is NOT discipline content: the "~/.prdt is read-only" rule
# governs the mirrored discipline/hook payload personas must not edit, not this
# hook's own scratch counters. Counter files are ~one byte per turn and are
# never read after the dispatch ends.
#
# TRUST: `tool_input` is attacker- and drift-shaped text (a worker can put any
# string in a Bash command). Classification therefore reads only the payload
# HEADER window — every key this hook needs is emitted BEFORE tool_input by the
# harness — and every extracted value is SHAPE-MATCHED, never escaped-and-
# spliced (the T-471 prescription for short enum-ish tokens). A value that
# fails its shape yields silence, never a fallback guess: this hook can only
# ever fail OPEN.

set +e

# Drain stdin with the BUILTIN, no fork. bash reads a pipe one byte per syscall,
# so the obvious worry is a large tool_input — measured on this machine
# (2026-08-19, 200 runs each, total process time incl. bash startup):
#   typical ~600B payload   read 21.0ms med   vs  $(cat) 26.7ms med
#   20KB Write payload      read 26.5ms med   vs  $(cat) 27.5ms med
# The fork costs more than the syscalls it saves at every size we see, and
# `read -d ''` still drains stdin to EOF, so the harness never sees an EPIPE.
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# Header window: the keys below are all emitted before `tool_input`
# (session_id · transcript_path · cwd · prompt_id · permission_mode · agent_id ·
# agent_type · hook_event_name · tool_name · tool_input · tool_use_id, measured
# on harness 2.1.235). Truncating first means a forged `"agent_type":"prdt-qa"`
# inside a tool_input body is never even scanned. If a pathological cwd ever
# pushes the real keys past the window, the match fails and the hook goes silent
# — the fail-open direction.
HDR="${EV:0:8192}"

RE_EVENT='"hook_event_name":"([A-Za-z]{1,32})"'
[[ $HDR =~ $RE_EVENT ]] || exit 0
EVENT="${BASH_REMATCH[1]}"
case "$EVENT" in
  PreToolUse|PostToolBatch) ;;
  *) exit 0 ;;
esac

# ── prdt-project gate: silence everywhere else ────────────────────────────────
# Up-walk the cwd's ancestor chain for the `.prdt/po-state.json` marker, the
# same marker the other hooks resolve a project by. This one only asks IN or
# OUT — it never reads the file — so unlike prdt-user-prompt.sh it needs neither
# the outermost-wins rule nor a realpath (T-484/T-493): a symlinked cwd that
# misses the marker costs one uncounted turn, never a wrong deny. Builtin `[ -f
# ]` tests only, no forks.
RE_CWD='"cwd":"([^"]+)"'
[[ $HDR =~ $RE_CWD ]] || exit 0
DIR="${BASH_REMATCH[1]}"
# The harness always sends an absolute cwd, so this is unreached in practice —
# but `${DIR%/*}` is a no-op on a string with no `/` in it (it returns the
# string unchanged, not empty), so a relative DIR would never shrink and the
# loop below would spin forever. On a hook that fires on EVERY tool call, that
# is the one non-terminating path in this file: every other exit is a `exit 0`
# a few instructions away, this one is a hang to the 60s hook timeout. Grill
# QA reproduced it from a scratch payload (killed at 3s). Fail open instead.
case "$DIR" in
  /*) ;;
  *) exit 0 ;;
esac
FOUND=""
while [ -n "$DIR" ] && [ "$DIR" != "/" ]; do
  if [ -f "$DIR/.prdt/po-state.json" ]; then FOUND=1; break; fi
  DIR="${DIR%/*}"
done
[ -n "$FOUND" ] || exit 0

RUN="${PRDT_HOME:-$HOME/.prdt}/run/call-governor"

# ── fire evidence (T-445 / T-498 §8 r6) ───────────────────────────────────────
# A typo'd event name in settings.json is accepted by the harness with NO error
# and NO warning, so "registered" never proves "fires". Each event stamps its
# own marker here and `prdt doctor` reports a registered event that has never
# fired. $EVENT is one of two literals matched above — never file bytes — so it
# is safe as a path component.
# NOTE the redirection ORDER: `2>/dev/null` comes FIRST everywhere below.
# Redirections are applied left to right, so `: > missing/file 2>/dev/null`
# reports its failure on the still-open stderr — a hook leaking to stderr on
# every tool call is exactly the noise this file must not add.
if ! : 2>/dev/null > "$RUN/.fired-$EVENT"; then
  mkdir -p "$RUN" 2>/dev/null && : 2>/dev/null > "$RUN/.fired-$EVENT"
fi

# ── persona (from the event itself — no correlation file needed) ──────────────
# Measured 2026-08-19 (harness 2.1.235): PreToolUse and PostToolBatch raised
# INSIDE a subagent carry agent_id + agent_type; raised in the main session they
# carry neither. So the main session self-excludes at this test.
RE_AGENT='"agent_type":"(prdt-[a-z]{1,16})"'
[[ $HDR =~ $RE_AGENT ]] || exit 0
ENFORCE=""
case "${BASH_REMATCH[1]}" in
  prdt-developer)          ENFORCE=1 ;;
  prdt-qa|prdt-designer)   ENFORCE="" ;;
  *) exit 0 ;;   # prdt-po and anything new: out of scope by decision
esac

# ── counter key: session + worker ─────────────────────────────────────────────
# agent_id is per-dispatch, so a brand-new dispatch starts at zero and parallel
# workers never share a file. Both halves are shape-matched to a path-safe
# alphabet, so a traversal-shaped value writes nothing at all.
#
# RESUME INHERITS THE COUNT — BY DESIGN (T-491 R2-4, PO ruling 2026-08-19): a
# worker resumed via SendMessage keeps its agent_id, so it reuses this same
# key and picks up the count where it left off instead of restarting at zero.
# The cost model is `A ≈ turns × context-per-turn`; a resumed worker inherits
# the SAME saturated context it left off in, so inheriting the counter is the
# accounting that matches that cost, not a bug to fix. A worker resumed at
# turn 55 that hits the deny 5 turns later is the intended signal for the PO to
# re-dispatch a smaller slice — not a reason to widen this key.
RE_SID='"session_id":"([A-Za-z0-9_-]{8,64})"'
RE_AID='"agent_id":"([A-Za-z0-9_-]{4,64})"'
[[ $HDR =~ $RE_SID ]] || exit 0
SID="${BASH_REMATCH[1]}"
[[ $HDR =~ $RE_AID ]] || exit 0
KEY="$RUN/$SID.${BASH_REMATCH[1]}"

WARN_AT=40
DENY_AT=60

if [ "$EVENT" = "PostToolBatch" ]; then
  # One byte per completed API turn. O_APPEND of a single byte is atomic, so
  # concurrent workers (which key to different files anyway) cannot interleave.
  if ! printf . 2>/dev/null >> "$KEY"; then
    mkdir -p "$RUN" 2>/dev/null && printf . 2>/dev/null >> "$KEY"
  fi
  exit 0
fi

# ── PreToolUse: enforce ───────────────────────────────────────────────────────
# Read the whole counter with one builtin read; the byte count IS the turn
# count. `read -d ''` returns non-zero at EOF, which is the normal case here.
BUF=""
IFS= read -r -d '' BUF 2>/dev/null < "$KEY"
N=${#BUF}

# The count is of COMPLETED turns: the PreToolUse of turn n sees n-1.
if [ -n "$ENFORCE" ] && [ "$N" -ge "$DENY_AT" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[prdt call governor] Hard stop: this worker has accumulated %s API turns in this session (limit %s, T-491 — a resume inherits the count, it does not reset). Every tool call from here on is denied.\\nReturn your envelope NOW — `summary` (what landed, plus `files_written[]`) and `unresolved[]` with one line per remaining item, written so a fresh worker can pick it up cold.\\nReturning is NOT a tool call, so it is always available to you; retrying a tool only earns another deny. Do not report finished what you did not verify — name it in `unresolved[]` instead."}}' "$N" "$DENY_AT"
  exit 0
fi

[ "$N" -ge "$WARN_AT" ] || exit 0

# Which warning band this call falls in. Enforced personas get two: the warn
# threshold, then the midpoint to the stop (40 and 50 with today's constants —
# derived, so the bands cannot drift away from the thresholds they belong to).
# Warn-only personas have no stop to count down to, so they band every 20 turns.
if [ -n "$ENFORCE" ]; then
  MID=$(( (WARN_AT + DENY_AT) / 2 ))
  if [ "$N" -ge "$MID" ]; then BAND=$MID; else BAND=$WARN_AT; fi
else
  BAND=$(( N / 20 * 20 ))
fi

# One warning per band per dispatch. A per-CALL warning would itself burn
# context on every turn — the opposite of this hook's purpose. `set -C` plus a
# truncating redirect is an atomic O_EXCL create with no fork.
set -C
: 2>/dev/null > "$KEY.w$BAND" || { set +C; exit 0; }
set +C

if [ -n "$ENFORCE" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"[prdt call governor] This worker has accumulated %s API turns in this session — warn band %s, hard stop at %s (T-491; a resume inherits the count rather than restarting it). Token cost is turns × full context, so how long a worker keeps running IN THIS SESSION is the single biggest spend there is.\\nStart wrapping up: finish the step in hand, then return `summary` + `unresolved[]` and let the PO re-dispatch a smaller slice. Batch independent reads/greps/globs into ONE turn.\\nWhat this never buys: skipping verification you have not run, or reporting unverified work as done. Say it in `unresolved[]` instead."}}' "$N" "$BAND" "$DENY_AT"
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"[prdt call governor] This worker has accumulated %s API turns in this session (advisory only — your persona is never denied; T-491).\\nIf what remains is separable, returning `summary` + `unresolved[]` for the PO to re-dispatch costs less than continuing in this context. Batch independent reads/greps into ONE turn.\\nNever trade a verification you have not run for this line: an unrun check is a finding, not a saving."}}' "$N"
fi
exit 0
