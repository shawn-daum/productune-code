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
# python. bash builtins and local file appends only, zero forks.
# The v1.6 worst hook was vercel-plugin at 439.7s cumulative; that is the
# mistake this file must not repeat.
#
# STATE: $PRDT_HOME/run/call-governor/ — machine-local, outside any repo, and
# outside the install mirror's rm -rf (install.sh §1 scopes that to
# discipline/). It is NOT discipline content: the "~/.prdt is read-only" rule
# governs the mirrored discipline/hook payload personas must not edit, not this
# hook's own scratch counters. Counter files are ~one byte per turn and are
# never read after the dispatch ends.
#
# TRUST (rewritten by T-518 — the previous claim here was false): the event
# payload carries bodies of attacker- and drift-shaped text. `tool_input` is one
# (a worker can put any string in a Bash command, and a tool taking an OBJECT
# argument — Artifact `capabilities`, an object-parameter MCP tool — serializes
# nested keys UNESCAPED, so a forged `"agent_type":"prdt-developer"` arrives as a
# literal, matchable key). `tool_response` on PostToolBatch is a second: tool
# OUTPUT rides along, so merely CAT-ing a file that names these keys feeds them
# in.
#
# So classification is STRUCTURAL, not positional. The scan below walks the
# TOP-LEVEL members of the event object and stops at the tool payload; only a
# top-level member can name the persona, and a forged key nested inside any
# value is at depth ≥ 1 and is therefore never a candidate. Nesting depth, not
# byte offset, is what disqualifies it.
#
# What the old byte-window got wrong, in BOTH directions:
#   - It truncated `tool_input` but did not EXCLUDE it, so the first match won.
#     Subagents survived on leftmost-match alone (a real agent_type precedes the
#     tool payload), but the MAIN SESSION sends no agent_type at all — so the
#     forged one was the only match, and 61 such calls hard-denied every tool
#     call the orchestrator makes. An availability kill on the one session that
#     dispatches work.
#   - A long path could push the real keys past the window and silently drop
#     enforcement. Reading structurally removes that cliff too.
#
# Every extracted value is still SHAPE-MATCHED, never escaped-and-spliced (the
# T-471 prescription for short enum-ish tokens). A value that fails its shape
# yields silence, never a fallback guess: this hook can only ever fail OPEN.
#
# PAYLOAD SHAPE — re-measured 2026-08-25 on harness 2.1.243 with a stdin-dumping
# probe hook (do not take this on faith; re-run the probe when it matters):
#   main session   session_id · transcript_path · cwd · prompt_id ·
#                  permission_mode · effort · hook_event_name · …
#                  — NO agent_id and NO agent_type, on either event. This is why
#                    the main session self-excludes below.
#   subagent       … · permission_mode · agent_id · agent_type · effort · …
#                  — PostToolBatch really does carry both. Confirmed, not assumed.
#   PreToolUse     … · tool_name · tool_input · tool_use_id
#   PostToolBatch  … · tool_calls:[{tool_name, tool_input, tool_use_id,
#                  tool_response}]
# Two members are newer than the 2.1.235 note this file used to carry: `effort`
# (an OBJECT, sitting between the identity keys and hook_event_name — the scan
# must skip containers, not stop at them) and `tool_response`.

set +e

# BYTE SEMANTICS, and the single biggest latency lever in this file. Under a
# UTF-8 locale bash converts the whole string to wide characters on every
# parameter expansion, and re-does it per match attempt: measured 2026-08-25 on
# a 28KB Write payload, two ${EV%%…} cuts cost 121ms in ko_KR.UTF-8 and 1ms in
# C. JSON structure is ASCII, every value here is shape-matched to an ASCII
# alphabet, and paths are handed to the filesystem as bytes either way — so byte
# semantics is both faster and closer to what this hook actually means. Set it
# before the first expansion or the saving is lost.
LC_ALL=C

# Drain stdin with the BUILTIN, no fork. bash reads a pipe one byte per syscall,
# so the obvious worry is a large tool_input — measured on this machine
# (2026-08-19, 200 runs each, total process time incl. bash startup):
#   typical ~600B payload   read 21.0ms med   vs  $(cat) 26.7ms med
#   20KB Write payload      read 26.5ms med   vs  $(cat) 27.5ms med
# The fork costs more than the syscalls it saves at every size we see, and
# `read -d ''` still drains stdin to EOF, so the harness never sees an EPIPE.
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# ── structural top-level scan ─────────────────────────────────────────────────
# Three builtin-only helpers consume from $SCAN. None forks.
#
# THESE THREE BODIES ARE A DELIBERATE BYTE-COPY of prdt-dispatch-gate.sh's, and
# test/scripts/dispatch-gate-hook.test.ts fails if either copy drifts (T-561
# disposition B — the rationale for keeping the copy instead of sourcing a
# `hooks/lib/` file is in that hook's header). Fix one, fix the other, in the
# same diff: this pair already needed the same fix twice because nothing was
# watching the copy.

STR=""

# Skip JSON insignificant whitespace at the head of $SCAN (T-561).
#
# WHY THIS EXISTS — do not "simplify" it away: the walk below decides structure
# by looking at $SCAN's FIRST BYTE at five points (before `{`, before a key,
# before `:`, before a value, before `,`). Without this, every one of those
# five assumed the payload was compact, so ONE space after a `:` or a `,`, or a
# newline after the opening `{`, dropped the walk out of the loop with an empty
# `cwd` — and an empty `cwd` exits 0. No deny, no warning, nothing: the hook
# silently stopped existing. Measured 2026-09-03 on this hook's own fixture,
# all four placements plus a full `jq .` pretty-print. What kept this latent
# was that the harness happens to emit compact JSON — someone else's
# serializer, never verified by us and free to change in any release.
ws_skip() {
  # Two expansions, no loop and no fork whatever the payload's shape: cut the
  # leading run of whitespace off the front, then delete exactly that prefix.
  # `[![:space:]]` is safe under this file's LC_ALL=C — JSON's insignificant
  # whitespace (space, tab, CR, LF) is a subset of C's [:space:]. An
  # all-whitespace $SCAN leaves it empty, which every caller below reads as
  # "no more members": the same fail-open direction as the rest of this walk.
  SCAN="${SCAN#"${SCAN%%[![:space:]]*}"}"
}

# Consume one JSON string starting at $SCAN[0] == '"'; leave it in $STR.
# Escape-aware, so a `\"` inside a value (a path containing a quote, say) is
# consumed as content instead of ending the string and desynchronising the walk
# — which is exactly how a forged key inside a string value would smuggle itself
# up to top level. Only `\"` is decoded; every other escape stays as written,
# because these values are shape-matched, never interpreted.
str_take() {
  local out="" seg bs
  SCAN="${SCAN:1}"
  while :; do
    seg="${SCAN%%\"*}"
    if [ "$seg" = "$SCAN" ]; then SCAN=""; STR=""; return 1; fi   # unterminated
    bs="${seg##*[!\\]}"                                           # trailing backslash run
    out="$out$seg"
    SCAN="${SCAN:${#seg}+1}"
    if [ $(( ${#bs} % 2 )) -eq 1 ]; then out="$out\""; continue; fi
    STR="$out"
    return 0
  done
}

# Consume one balanced object/array starting at $SCAN[0]. Jumps between
# structural characters rather than walking bytes, and hands strings to
# str_take so a `{` or `"` inside a string value cannot skew the depth.
skip_container() {
  # `}` inside an inline bracket expression closes the ${...} early — bash reads
  # `${SCAN%%[][{}` and treats the rest as literal text, with no syntax error to
  # warn you (measured: it silently returns the whole string). Keep both
  # structural patterns in variables so the parser never sees those braces.
  local depth=0 seg c pat='[][{}"]'
  while [ -n "$SCAN" ]; do
    seg="${SCAN%%$pat*}"
    if [ "$seg" = "$SCAN" ]; then SCAN=""; return 1; fi
    SCAN="${SCAN:${#seg}}"
    c="${SCAN:0:1}"
    case "$c" in
      '"')     str_take || return 1 ;;
      '{'|'[') depth=$(( depth + 1 )); SCAN="${SCAN:1}" ;;
      *)       depth=$(( depth - 1 )); SCAN="${SCAN:1}"
               [ "$depth" -le 0 ] && return 0 ;;
    esac
  done
  return 1
}

# LATENCY DEVICE, NOT A SECURITY BOUNDARY — read this before touching it.
# Every parameter expansion is O(len(var)), so walking the header of a 28KB
# Write payload one expansion at a time is measurably worse than cutting the
# payload down to its header once and walking that.
#
# What makes that cut sound is the direction of its failure, not any trust in
# it: attacker bytes exist only INSIDE tool_input / tool_calls, i.e. after the
# genuine first occurrence of these literals, so the cut can only ever land at
# or BEFORE the real boundary. Land it early (a crafted path containing the
# literal) and identity goes missing and the hook goes silent — fail open. It
# can never land late, and it is not what disqualifies a forgery: the top-level
# walk below does that, and would do it just as well on the whole payload. The
# suite pins exactly that, with a forged key nested BEFORE the cut.
TIP='"tool_input":'
TCP='"tool_calls":'
SCAN="${EV%%$TIP*}"
HDR2="${EV%%$TCP*}"
[ ${#HDR2} -lt ${#SCAN} ] && SCAN="$HDR2"

ws_skip
case "$SCAN" in
  '{'*) SCAN="${SCAN:1}" ;;
  *) exit 0 ;;               # not an object: nothing to classify, stay silent
esac

EVENT=""; DIR=""; SID=""; AID=""; ATYPE=""

# EVERY first-byte test below is preceded by ws_skip — that is the whole of the
# T-561 fix, and the five calls are not optional decoration: each one guards one
# structural decision, and dropping any one of them re-opens the silent no-op at
# exactly that position (here: an uncounted turn, or a deny that never fires).
while :; do
  ws_skip                                 # after `{` / `,`, before a key
  case "$SCAN" in '"'*) ;; *) break ;; esac
  str_take || break
  K="$STR"
  ws_skip                                 # after a key, before `:`
  case "$SCAN" in ':'*) SCAN="${SCAN:1}" ;; *) break ;; esac

  # Belt and braces with the cut above: if a payload ever arrives with the tool
  # body ahead of the identity keys, stop rather than walk it. A nested forgery
  # is invisible to a top-level walk either way — this is about cost, not trust.
  case "$K" in
    tool_input|tool_calls|tool_name|tool_response|tool_use_id) break ;;
  esac

  ws_skip                                 # after `:`, before the value
  case "$SCAN" in
    '"'*)
      str_take || break
      case "$K" in
        session_id)      SID="$STR" ;;
        cwd)             DIR="$STR" ;;
        agent_id)        AID="$STR" ;;
        agent_type)      ATYPE="$STR" ;;
        hook_event_name) EVENT="$STR" ;;
      esac
      ;;
    '{'*|'['*)
      skip_container || break ;;          # e.g. `effort` — skipped, not stopped at
    *)
      PAT='[,}]'                          # in a variable — see skip_container
      SEG="${SCAN%%$PAT*}"                # number / true / false / null
      [ "$SEG" = "$SCAN" ] && break
      SCAN="${SCAN:${#SEG}}"
      ;;
  esac

  ws_skip                                 # after the value, before `,` / `}`
  case "$SCAN" in ','*) SCAN="${SCAN:1}" ;; *) break ;; esac
done

# Any malformed payload leaves these empty and every gate below exits 0 — the
# fail-open direction, by design.
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
[ -n "$DIR" ] || exit 0
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

# ── cross-worker writability: a RECORDED decision, not an oversight (T-567 F4) ─
# This directory is shared by every session on the machine, the file names are
# `$SID.$AID`, and `ls` shows them all — so one worker can poison another
# worker's counter, and since T-519 made tamper fail CLOSED that poisoning is a
# confirmed kill rather than the silent fail-open it used to be.
#
# It stays that way, on purpose, because every candidate fix is theatre at this
# layer: all workers run as ONE uid, so no mode, no per-worker subdirectory and
# no name obfuscation stops a peer that can already run `rm -rf $HOME`. Only a
# privileged out-of-process counter would, and this hook cannot have one (it runs
# on every tool call and may not fork). Fail-closed is still the right direction
# — the alternative hands a worker a way to silently UN-govern its peers, which
# is worse than a loud, diagnosable stop.
# What the fix here does instead is make the residual survivable rather than
# mysterious: the deny text tells a victim to say "I did not touch this path" in
# its envelope, and `prdt doctor` names the exact path and its repair. The
# threat model this hook actually serves is a worker evading its OWN budget, and
# that is what T-567 closes.

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
#
# T-567: `>` TRUNCATES, and it follows a symlink. A link planted at this marker
# name aims that truncate at any file this uid owns — strictly worse than the
# counter's one-byte append, and reproduced (a victim file went to 0 bytes).
# `run/call-governor/` is a 0755 directory shared by every session on the
# machine, so this path is plantable by something that is not us. The rule for
# every write in this file is therefore the same one: it lands on a real file
# inside this directory or it does not happen. Refusing here costs a missing
# fire marker, which `prdt doctor` already reports — and it reports the planted
# link itself too (T-567), so refusal is never silence.
if [ ! -L "$RUN/.fired-$EVENT" ]; then
  if ! : 2>/dev/null > "$RUN/.fired-$EVENT"; then
    mkdir -p "$RUN" 2>/dev/null && : 2>/dev/null > "$RUN/.fired-$EVENT"
  fi
fi

# ── persona (a TOP-LEVEL member of the event itself) ──────────────────────────
# Re-measured 2026-08-25 (harness 2.1.243): PreToolUse and PostToolBatch raised
# INSIDE a subagent carry agent_id + agent_type; raised in the main session they
# carry neither. So the main session self-excludes at this test — and, since the
# scan above only ever sees top-level members, nothing in a tool body can put it
# back in (T-518).
ENFORCE=""
case "$ATYPE" in
  prdt-developer)          ENFORCE=1 ;;
  prdt-qa|prdt-designer)   ENFORCE="" ;;
  *) exit 0 ;;   # main session (empty), prdt-po, anything new: out of scope
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
RE_SID='^[A-Za-z0-9_-]{8,64}$'
RE_AID='^[A-Za-z0-9_-]{4,64}$'
[[ $SID =~ $RE_SID ]] || exit 0
[[ $AID =~ $RE_AID ]] || exit 0
KEY="$RUN/$SID.$AID"
# The WITNESS (T-567). One byte per counted turn, same as the counter, appended
# AFTER it — so the witness can only ever LAG the counter, never lead it. A
# counter shorter than its witness is a state this hook cannot produce; it is a
# deletion or a truncation. That is the whole mechanism, and it is what turns the
# guard's question from "is this a regular file?" (which `rm` and `: >` both
# answer correctly while resetting the budget) into "is this the counter this
# session actually accrued?".
#
# The prefix is deliberately NOT `$SID.$AID`: the obvious cleanup a worker
# reaches for is `rm "$RUN/$SID.$AID"*`, and that glob leaves the witness
# standing, which is exactly when this check must speak.
#
# RESIDUAL, stated rather than implied: this is same-uid state, so a worker that
# knows the scheme can remove BOTH files and start clean. No file under $HOME can
# close that — only an out-of-process counter could, which this hook cannot have
# (no forks on the hot path). What T-567 changes is that no single obvious
# primitive silently restores budget any more: every inconsistent state is a deny
# or a warning, and `prdt doctor` reports the leftovers of an attempt.
WIT="$RUN/.hw-$SID.$AID"

WARN_AT=40
DENY_AT=60

# ── tamper: is this the counter this session accrued? (T-519 v2 / T-567) ───────
# Three shapes, one verdict. All three were reproduced against the previous
# `[ -e "$KEY" ] && [ ! -f "$KEY" ]` guard before this rewrite:
#
#   NON-REGULAR  `mkdir "$KEY"` (or a FIFO/socket) makes append and read fail
#                forever, pinning the count at 0 while `.fired-*` stays green.
#                This is the one shape T-519 caught.
#   SYMLINK      `-f` FOLLOWS the link: a link to a regular file passed the old
#                guard, and `printf . >> "$KEY"` then appended to whatever it
#                named — an append primitive aimed at any file this uid owns
#                (`~/.claude/settings.json`, `~/.prdt/prdt.env`, a git object).
#                A DANGLING link is the same primitive in create form: `>>`
#                through one creates the target (measured). So the test is
#                `-L`, never the target's shape — the write stays inside this
#                directory or it does not happen.
#   REGRESSED    the counter is shorter than its witness: `rm -f "$KEY"` or
#                `: > "$KEY"` — the two cheapest evasions there are, and both
#                PASSED the old guard, which is the defect T-567 exists for.
#
# Verdict is the same for all three, and it is NOT the malformed-payload
# fail-open above: identity is resolved and the persona is known, so this is
# tampered evidence and it is read as over-limit rather than as N=0. Enforced
# personas are DENIED (evasion backfires), warn-only personas are never denied
# but ARE told (silence here is what let this run undetected), and `prdt doctor`
# reports all four states. Builtin tests only, no fork.
TAMPER=""
if [ -L "$KEY" ] || [ -L "$WIT" ]; then
  TAMPER="a symlink is planted at the counter path, so a write there would leave the governor's own directory"
elif { [ -e "$KEY" ] && [ ! -f "$KEY" ]; } || { [ -e "$WIT" ] && [ ! -f "$WIT" ]; }; then
  TAMPER="the counter path holds a non-regular file, so the count can never be read or appended"
fi

if [ "$EVENT" = "PostToolBatch" ]; then
  # No append through a tampered path — not even a failed one. The visible
  # outcome for this turn is raised on the PreToolUse of the NEXT tool call
  # (there is no PostToolBatch channel to speak on), which is at most one turn
  # away for any worker still working.
  [ -z "$TAMPER" ] || exit 0
  # One byte per completed API turn. O_APPEND of a single byte is atomic, so
  # concurrent workers (which key to different files anyway) cannot interleave.
  if ! printf . 2>/dev/null >> "$KEY"; then
    mkdir -p "$RUN" 2>/dev/null
    printf . 2>/dev/null >> "$KEY" || exit 0
  fi
  # ORDER IS THE INVARIANT: witness after counter, and only if the counter append
  # actually landed. A witness that could lead the counter would make an ordinary
  # crashed write look like tampering.
  printf . 2>/dev/null >> "$WIT"
  exit 0
fi

# ── PreToolUse: enforce ───────────────────────────────────────────────────────
# Read the whole counter with one builtin read; the byte count IS the turn
# count. `read -d ''` returns non-zero at EOF, which is the normal case here.
BUF=""
IFS= read -r -d '' BUF 2>/dev/null < "$KEY"
N=${#BUF}

# The witness, read the same way. Absent (W=0) is the normal state for a counter
# that predates this check and for a dispatch that has not counted a turn yet —
# never tamper on its own. Only a counter that FELL BEHIND its witness is.
WBUF=""
IFS= read -r -d '' WBUF 2>/dev/null < "$WIT"
if [ -z "$TAMPER" ] && [ "${#WBUF}" -gt "$N" ]; then
  TAMPER="this session accrued ${#WBUF} turns but the counter now holds $N — it was deleted or truncated"
fi

# Tamper verdict: deny the enforced persona, tell the warn-only ones. Neither
# path may end in a plain exit 0 (T-567): a silent pass here is what made the
# reset evasions invisible for a whole round.
if [ -n "$TAMPER" ]; then
  if [ -n "$ENFORCE" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[prdt call governor] Hard stop: the turn counter for this worker cannot be trusted — %s (T-491/T-519/T-567). Enforcement fails CLOSED here rather than granting untracked turns; restoring the count is not something a worker does for itself.\\nReturn your envelope NOW — `summary` (what landed, plus `files_written[]`) and `unresolved[]`, one line per remaining item, written so a fresh worker can pick it up cold. Returning is NOT a tool call; retrying a tool only earns another deny.\\nIf you did not touch this path, say so in `unresolved[]` and let the PO run `prdt doctor` — it reports this state."}}' "$TAMPER"
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"[prdt call governor] The turn counter for this worker cannot be trusted — %s (T-567). Your persona is never denied, so nothing here stops you; the count for this dispatch is simply no longer accountable.\\nIf you did not touch this path, name it in your return and let the PO run `prdt doctor` — it reports this state."}}' "$TAMPER"
  fi
  exit 0
fi

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
