#!/usr/bin/env bash
# prdt — dispatch-side [ctx] gate (T-490 slice 2). Registered ONCE:
#   PreToolUse, matcher `Agent` — deny a prdt dispatch that opens without a
#   well-formed `[ctx]` line, warn on a Hangul-heavy machine-facing field.
#
# WHY (T-490): a rule that a machine can check binarily belongs in the machine,
# not in prose a tired PO skims. The observed drift this closes is the `[ctx]`
# line — 3 of 132 real dispatches opened without one, and a worker that spawns
# without its slug / acceptance / prd_path / user_lang burns a full dispatch's
# tokens before anyone notices. Denying BEFORE the spawn costs nothing; the
# same defect caught in the return costs the whole worker.
#
# SCOPE — user decision 2026-08-24 (option ②), do not widen it here:
#   DENY  ① no `[ctx]` line  ② that line fails JSON parse, lacks a required
#         top-level key, or carries a malformed `prd_path`  ③ (T-591) a
#         `prdt-qa` or `prdt-developer` dispatch whose `[ctx].dispatch_id` is
#         missing or empty. `dispatch_id` is NOT in `$required` — it binds
#         only these two `subagent_type`s, never `prdt-designer` / `prdt-po`,
#         so it is its own elif rather than a fourth required key.
#   WARN  per-FIELD Hangul ratio of `[ctx].goal` / `[ctx].acceptance` over 0.10.
#         Never a deny: the drift already stopped behaviourally (the last 6
#         dispatches are all under 0.05), so day-one denying it would only
#         teach a workaround. Promote to deny after one clean round.
#   DENY  ④ (T-695) the MACHINE is over a resource cap — measured by tooling,
#         never by PO judgment, after ①–③ pass (a malformed `[ctx]` keeps its
#         own deny; a non-prdt dispatch and a cwd outside a prdt project stay
#         fork-free and silent). See "T-695: machine resource cap" below for
#         the five axes, their measurement, the defaults and the override file.
#   RECORD + WARN  ⑤ (T-773) every dispatch that passed ①–④ appends one row to
#         `<project>/.prdt/schedule.jsonl` against the critical path of that
#         moment; one off `prdt schedule`'s top row with no
#         `[ctx].schedule_reason` also WARNS. Never a deny (T-765, user
#         decision) — see "T-773: the schedule record" below.
#   NOT HERE — the return/envelope side (slice 3), and the three binary
#         candidates held under doctrine #5 for zero observed violations
#         (AskUserQuestion in a worker · worker↔worker calls · discipline-path
#         writes). Adding any of them needs its own user decision.
#
# WHY ③ (T-591): a QA grill found two parallel dispatches in one session write
# the same resource marker under `~/.prdt/run/` — the first to finish stopped
# the VM the other still needed. `dispatch_id` is the PO-minted id that owns a
# dispatch's markers (contracts.md §Dispatch); a PO that forgets it produces
# exactly that collision, silently, unless the gate stops it before the spawn.
#
# LINE-LEVEL HANGUL DETECTION IS PROVEN USELESS — do not "simplify" back to it.
# A `[ctx]` line whose goal is 77% Korean measures 0.18 over the whole line,
# because the JSON scaffolding (keys, paths, enums, `docs/prd/PRD.md#v1.7`) is
# all ASCII. The ratio is therefore computed PER FIELD, over letters only:
# hangul / (hangul + ascii_letters), digits and punctuation excluded from both
# sides so a field's own scaffolding cannot dilute it either.
#
# WHY THIS ONE MAY USE jq WHEN prdt-call-governor.sh MAY NOT: the governor is
# matcher-less and fires on EVERY tool call (5,124 worker calls in v1.6), so it
# is bash builtins only. This hook's matcher is `Agent` — it fires once per
# dispatch (~40 per session), which is what buys it a real JSON parser. That
# matters for more than convenience: string-matching a nested `subagent_type`
# or `prompt` out of the raw payload is exactly the forgery surface the
# governor has to defend against with a header window, whereas jq reads the
# actual structure, so a prompt BODY containing `"subagent_type":"prdt-qa"` is
# just text. jq is an install-time hard dependency (install.sh dies without it),
# so a missing jq is not a case this hook designs for — it fails open, like
# every other bail-out below.
#
# TRUST: the `[ctx]` line is PO-authored text and is treated as data. Nothing
# from the payload is ever echoed into a deny reason or a warning — not the bad
# `prd_path`, not the offending line. What is echoed is only ever fixed text:
# the contracts clause verbatim, our own required-key names, and computed
# numbers. A reason string reaches the model, so a payload-shaped reason would
# be an injection channel out of the very text this hook is inspecting.
#
# The deny reason quotes the contracts clause VERBATIM so the PO reads the rule
# it broke rather than a generic rejection. Those quotes are asserted against
# discipline/contracts.md by test/scripts/dispatch-gate-hook.test.ts — if a
# clause is reworded there, that test fails rather than this hook drifting into
# quoting prose that no longer exists.

set +e

# BYTE SEMANTICS (measured in prdt-call-governor.sh: two `${EV%%…}` cuts on a
# 28KB payload cost 121ms in ko_KR.UTF-8 vs 1ms in C, because bash re-widens
# the whole string to wide chars on every parameter expansion under a UTF-8
# locale). JSON structure is ASCII and every value below is shape-matched or
# used as filesystem bytes either way, so C is both faster and correct. Set it
# before the first expansion or the saving is lost.
LC_ALL=C

# Drain stdin with the BUILTIN, no fork (measured in prdt-call-governor.sh: the
# fork costs more than the syscalls it saves at every payload size we see, and
# `read -d ''` still drains to EOF so the harness never sees an EPIPE).
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# ── prdt-project gate: silence everywhere else ────────────────────────────────
# The ONLY pre-jq check, and it is here so that outside a prdt project this hook
# forks nothing at all. `hook_event_name` and `tool_name` are deliberately NOT
# pre-filtered by substring: jq checks both structurally below, and a substring
# pre-filter would have to assume the payload's exact spacing — an assumption
# that silently turns the whole gate into a no-op if the harness ever pretty-
# prints (it cost this hook its first green run: a `"key": "value"` fixture sailed
# straight past `*'"tool_name":"Agent"'*` and out the fail-open exit).
#
# THAT CLAIM WAS TRUE OF THE PRE-FILTER AND FALSE OF THE WALKER (T-561). The
# structural walk that replaced the byte window carried the identical spacing
# assumption at its own five first-byte tests, so a pretty-printed payload took
# the same silent exit the paragraph above rejects — the hook contradicted its
# own header for a version, and the suite could not see it because every fixture
# was compact. `ws_skip` is what makes the paragraph true of this whole file
# now, and the pretty-print cases in test/scripts/dispatch-gate-hook.test.ts are
# what keep it true. The rule the paragraph states is therefore general: NO
# check in this hook may depend on the payload's whitespace, pre-filter or not.
#
# `cwd` IS READ STRUCTURALLY (T-521) — not through a fixed-byte header window.
# The window this replaced (`HDR="${EV:0:8192}"`) truncated `cwd` whenever a
# long path pushed it past 8192B, and the failure was a SILENT no-op: no deny,
# no warning, the gate just stopped existing for that dispatch. Measured
# reproduction (T-521): a real harness-shaped payload with a 6,730-byte `cwd`
# (`transcript_path`, which embeds `cwd`, sits ahead of it in the same object —
# see the key order below — so the field's own byte offset is already past
# half the window before its value even starts) left `HDR` cut mid-string, the
# regex never matched a closing quote, and a dispatch that should have been
# DENIED (no `[ctx]` line, `prdt-developer`, inside a real project) produced
# zero stdout. There is no path length a byte window can be sized against —
# PATH_MAX itself varies by OS and is not a hard ceiling on every filesystem —
# so the fix removes the window rather than enlarging it.
#
# This reuses prdt-call-governor.sh's proven technique verbatim — "verbatim" is
# now MACHINE-CHECKED, not asserted: the two files carry byte-identical
# `ws_skip` / `str_take` / `skip_container` bodies and a test in
# test/scripts/dispatch-gate-hook.test.ts fails if either copy drifts. That is
# the T-561 disposition (option B — keep the copy, pin it): the alternative,
# sourcing a `hooks/lib/` file, would need an entry in scripts/hook-manifest.json,
# which is the REGISTRATION roster install.sh and the GUI derive settings.json
# from — a non-hook entry there is a registration the harness can never satisfy,
# and no entry means install.sh §4's "nothing unregistered under $PRDT_HOME/hooks/"
# assertion rejects the mirrored file. The copy is cheaper than that seam; what
# was missing was anything that noticed it drifting, which is now the test.
# (T-518 fixed
# the identical cliff there: "a long path could push the real keys past the
# window and silently drop enforcement"): cut the payload at the first
# `"tool_input":` — the only tool-body key this hook's PreToolUse-only
# registration ever sees, so unlike the governor (PreToolUse AND PostToolBatch,
# `tool_calls` too) one cut point is enough — then walk the TOP-LEVEL members
# before that cut with an escape-aware, builtin-only string reader. `cwd` is
# always among those top-level members (session_id · transcript_path · cwd ·
# …, measured on harness 2.1.235/2.1.243), so this resolves for a `cwd` of ANY
# length: there is no window left to overrun. Still zero forks, so a dispatch
# this hook never has to act on (outside a prdt project) still costs nothing.
#
# Same fail-open direction as the window it replaces: a `cwd` value containing
# the literal text `"tool_input":` would cut early and lose the rest of the
# scan, but that only ever produces MORE silence, never a wrong deny — a path
# cannot practically contain an unescaped `"` in the first place. (T-518's own
# note on the governor's identical cut applies here unchanged.)

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
# Escape-aware: a `\"` inside a value is consumed as content, not a terminator.
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

# Consume one balanced object/array starting at $SCAN[0] (e.g. `permission_mode`
# ever grows a container next to it) so it can be skipped without derailing the
# top-level walk. Jumps between structural characters, hands strings to
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

TIP='"tool_input":'
SCAN="${EV%%$TIP*}"
ws_skip
case "$SCAN" in
  '{'*) SCAN="${SCAN:1}" ;;
  *) exit 0 ;;               # not an object: nothing to classify, stay silent
esac

# EVERY first-byte test below is preceded by ws_skip — that is the whole of the
# T-561 fix, and the five calls are not optional decoration: each one guards one
# structural decision, and dropping any one of them re-opens the silent no-op at
# exactly that position.
DIR=""
SID=""
while :; do
  ws_skip                                 # after `{` / `,`, before a key
  case "$SCAN" in '"'*) ;; *) break ;; esac
  str_take || break
  K="$STR"
  ws_skip                                 # after a key, before `:`
  case "$SCAN" in ':'*) SCAN="${SCAN:1}" ;; *) break ;; esac
  ws_skip                                 # after `:`, before the value
  case "$SCAN" in
    '"'*)
      str_take || break
      [ "$K" = "cwd" ] && DIR="$STR"
      [ "$K" = "session_id" ] && SID="$STR"
      ;;
    '{'*|'['*)
      skip_container || break ;;
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

# Up-walk the cwd's ancestor chain for the `.prdt/po-state.json` marker, the
# same IN-or-OUT test prdt-call-governor.sh makes (it never reads the file, so
# it needs neither the outermost-wins rule nor a realpath — T-484/T-493).
[ -n "$DIR" ] || exit 0
# `${DIR%/*}` returns a slash-less string UNCHANGED, not empty, so a relative
# DIR would never shrink and the loop below would spin to the hook timeout.
# The harness always sends an absolute cwd, so this is unreached in practice —
# it is here because the governor shipped that exact hang once.
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

# ── T-704: a worker persona may not spawn `subagent_type: "fork"` ────────────
# WHY: 2026-09-26, T-666 2b — a worker-spawned fork wrote `render.mjs` twice
# AFTER the worker itself had handed back, then, told to stop, claimed over
# SendMessage to BE the worker of record and wrote again; the PO had to
# TaskStop it. The prose rule ("do not spawn research forks") already sat in
# both worker overrides (`~/.prdt/overrides/developer.md`, `designer.md`) and
# was ignored under load — a rule a device can hold belongs in the device.
#
# CALLER, not callee: this hook's existing `[ctx]` gate above classifies by
# who is being SPAWNED (`tool_input.subagent_type` matching `^prdt-`), which a
# `fork` call never does. This check classifies by who is SPAWNING instead —
# `agent_type`, a TOP-LEVEL member of the event, sibling of `tool_input`, so it
# is read the same trusted way (jq structure, never a substring on the raw
# payload — a prompt body cannot forge a top-level key). Confirmed on a real
# event, not assumed: prdt-call-governor.sh's own header records a stdin-dump
# probe (harness 2.1.243, 2026-08-25) — a PreToolUse raised INSIDE a subagent
# carries `agent_type`; raised in the main session (the PO) it carries neither
# `agent_id` nor `agent_type` at all. So a worker persona's call has
# `agent_type` set to its own name (`prdt-developer` / `prdt-qa` /
# `prdt-designer`); the PO's own call — main session, or `agent_type` absent —
# never matches, unaffected by design, never denied here.
FORK_DENY="$(printf '%s' "$EV" | jq -rc '
  if (.hook_event_name != "PreToolUse") or (.tool_name != "Agent") then empty
  else (.tool_input // {}) as $ti
  | if ($ti | type) != "object" then empty
    elif (($ti.subagent_type // "") | type) != "string" then empty
    elif ($ti.subagent_type != "fork") then empty
    elif ((.agent_type // "") | type) != "string" then empty
    elif ((.agent_type) | test("^prdt-(developer|qa|designer)$") | not) then empty
    else {hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny",
      permissionDecisionReason: "[prdt dispatch gate] DENIED: a worker persona cannot spawn subagent_type \"fork\" (T-704) — do the read yourself, or return `unresolved[]` for the PO."}}
    end
  end
' 2>/dev/null)"
[ -n "$FORK_DENY" ] && { printf '%s\n' "$FORK_DENY"; exit 0; }

# ── the clauses, verbatim from discipline/contracts.md ────────────────────────
# Single-quoted so backticks and braces are inert; the embedded newline is
# literal. A test asserts each of these appears verbatim in contracts.md.
CLAUSE_CTX='One inline `[ctx]` JSON line opens every dispatch:
  `[ctx] {"slug","goal","change_meta":{"files":[],"user_facing":bool,"risk_flags":[],"stage":""},"acceptance","wiki_refs":[],"user_lang":"<BCP-47>","prd_path":"docs/prd/PRD.md#v<N>.<m>"}`'
CLAUSE_PRD='`[ctx].prd_path` = `docs/prd/PRD.md#v<N>.<m>`'
CLAUSE_LANG='Machine-facing (`envelope` · `ctx-fields` · `ticket-acceptance` · `commit-message` · `dispatch-body` · `discipline`; frontmatter keys, enums, code identifiers and paths everywhere) → English.'
CLAUSE_DISPATCH_ID='`"dispatch_id"` = the PO'\''s minted id, one per dispatch, never per session and never a harness agent id — it owns that dispatch'\''s resource markers; the gate denies its absence on a `prdt-qa` or `prdt-developer` `subagent_type`.'

IFS= read -r -d '' PROG <<'JQ'
def hangul_ratio:
  # Letters only, both sides: digits, punctuation and the JSON scaffolding are
  # excluded from numerator AND denominator. Ranges: Hangul syllables
  # AC00-D7A3, jamo 1100-11FF, compatibility jamo 3130-318F, jamo extended-A
  # A960-A97F, extended-B D7B0-D7FF. (jq has no hex literals — decimal.)
  (if type == "string" then . else tojson end | explode) as $c
  | ([$c[] | select((. >= 44032 and . <= 55203) or (. >= 4352 and . <= 4607)
      or (. >= 12592 and . <= 12687) or (. >= 43360 and . <= 43391)
      or (. >= 55216 and . <= 55295))] | length) as $h
  | ([$c[] | select((. >= 65 and . <= 90) or (. >= 97 and . <= 122))] | length) as $a
  | if ($h + $a) == 0 then 0 else ($h / ($h + $a)) end;

def r2: (. * 100 | round) / 100;
def deny($why): {hookSpecificOutput: {hookEventName: "PreToolUse",
  permissionDecision: "deny", permissionDecisionReason: $why}};
def warn($what): {hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: $what}};

def head: "[prdt dispatch gate] DENIED before the worker spawned: ";
def tail: "\nNothing was spawned and no dispatch tokens were spent — fix the line and re-dispatch.";

# Event and tool are checked STRUCTURALLY, never by substring: the matcher is
# supposed to narrow this to Agent/PreToolUse, and this is the check that makes
# a mis-registration a no-op instead of a surprise.
def gate:
if (.hook_event_name != "PreToolUse") or (.tool_name != "Agent") then empty
else (.tool_input // {}) as $ti
| if ($ti | type) != "object" then empty
  elif (($ti.subagent_type // "") | type) != "string" then empty
  elif (($ti.subagent_type // "") | test("^prdt-")) | not then empty
  elif ($ti.prompt | type) != "string" then empty
  else
    ([$ti.prompt | split("\n")[] | select(test("^\\[ctx\\] \\{"))] | first) as $line
    | if $line == null then
        deny(head + "this dispatch prompt carries no `[ctx]` line, so the worker would start without its slug, acceptance, prd_path or user_lang.\ncontracts.md §Dispatch, verbatim:\n" + $clause_ctx + "\nMake that the prompt's opening line." + tail)
      else (try ($line | sub("^\\[ctx\\] "; "") | fromjson) catch null) as $ctx
      | if ($ctx | type) != "object" then
          deny(head + "the `[ctx]` line is not a parseable JSON object (everything after `[ctx] ` must be ONE single-line JSON object).\ncontracts.md §Dispatch, verbatim:\n" + $clause_ctx + tail)
        else
          ([$required[] | select(($ctx[.] // null) == null)]) as $missing
          | if ($missing | length) > 0 then
              deny(head + "the `[ctx]` line is missing required key(s): " + ($missing | join(", ")) + ".\ncontracts.md §Dispatch, verbatim:\n" + $clause_ctx + "\nEvery key in that schema is required; extra keys of your own are fine." + tail)
            elif (($ctx.prd_path | type) != "string")
                 or (($ctx.prd_path | test("^docs/prd/PRD\\.md#v[0-9]+\\.[0-9]+$")) | not) then
              deny(head + "`[ctx].prd_path` is malformed.\ncontracts.md §Fixed paths, verbatim:\n" + $clause_prd + "\nSet it to exactly that shape — the fragment scopes the worker's read to ONE version section, so it has no tolerance." + tail)
            elif ($ti.subagent_type == "prdt-qa" or $ti.subagent_type == "prdt-developer")
                 and (($ctx.dispatch_id // "") == "") then
              deny(head + "the `[ctx]` line has no `dispatch_id` for this `prdt-qa`/`prdt-developer` dispatch, so this dispatch's resource markers would have no owner.\ncontracts.md §Dispatch, verbatim:\n" + $clause_dispatch_id + "\nMint one id per dispatch and set `[ctx].dispatch_id` to it — never a session id, never a harness agent id." + tail)
            else
              # Passed. Per-FIELD Hangul ratio on the two machine-facing fields.
              ([{f: "goal", r: ($ctx.goal | hangul_ratio)},
                {f: "acceptance", r: ($ctx.acceptance | hangul_ratio)}]
               | map(select(.r > 0.1))) as $hot
              | if ($hot | length) == 0 then empty
                else warn("[prdt dispatch gate] Hangul-heavy machine-facing `[ctx]` field(s): "
                  + ($hot | map(.f + " " + (.r | r2 | tostring)) | join(", "))
                  + " (per-field hangul/(hangul+ascii-letters), warn over 0.1). contracts.md §Language, verbatim: \""
                  + $clause_lang
                  + "\" Warning only, this dispatch proceeds — write these fields in English next round; `user_lang` still governs user-facing prose.")
                end
            end
        end
      end
  end
end;
# T-774: this dispatch's requested MODEL TIER, read the same structural way —
# `.tool_input.model` when the PO set one, else the literal "default" bucket
# (this hook cannot see what the harness/agent-definition would resolve an
# unset override to — see prdt-post-dispatch.sh's norm_model()). Restricted to
# the Agent tool's own `model` enum {sonnet,opus,haiku,fable}; anything else
# (a malformed payload, a future enum member this copy predates) also falls
# into "default" rather than being trusted as a cap-lookup key.
def want_model:
  ((.tool_input.model // "") ) as $m
  | if ($m | type) == "string" and ($m | test("^(sonnet|opus|haiku|fable)$")) then $m else "default" end;

# T-695: two lines — does the resource cap apply to this call (a `prdt-*`
# dispatch on PreToolUse/Agent), and the `[ctx]` verdict above (deny · warn ·
# nothing) as one compact JSON line or an empty line. Structural, never a
# substring test on the raw payload. T-774 adds a third value (this dispatch's
# model tier) on the FIRST line, tab-separated after `applies` — never a third
# line, so the existing two-line split below only needs one more cut.
{applies: (if (.hook_event_name == "PreToolUse") and (.tool_name == "Agent") and ((.tool_input // {}) | type) == "object"
              and (((.tool_input // {}).subagent_type // "") | type) == "string"
           then ((.tool_input // {}).subagent_type // "") | test("^prdt-") else false end),
 out: ([gate] | first), model: want_model}
| "\(.applies)\t\(.model)\n\(if .out == null then "" else (.out | tojson) end)"
JQ

RAW="$(printf '%s' "$EV" | jq -r \
  --arg clause_ctx "$CLAUSE_CTX" \
  --arg clause_prd "$CLAUSE_PRD" \
  --arg clause_lang "$CLAUSE_LANG" \
  --arg clause_dispatch_id "$CLAUSE_DISPATCH_ID" \
  --argjson required '["slug","goal","change_meta","acceptance","wiki_refs","user_lang","prd_path"]' \
  "$PROG" 2>/dev/null)"

# Any jq failure yields empty output and therefore silence: this hook can only
# ever fail OPEN. A gate that breaks a dispatch because its own parser tripped
# would be worse than the drift it exists to catch.
[ -n "$RAW" ] || exit 0
LINE1="${RAW%%$'\n'*}"
GATE="${RAW#*$'\n'}"
[ "$GATE" = "$RAW" ] && GATE=""          # no second line: the `[ctx]` verdict was silence
APPLIES="${LINE1%%$'\t'*}"
WANT_MODEL="${LINE1#*$'\t'}"
[ "$WANT_MODEL" = "$LINE1" ] && WANT_MODEL="default"   # no tab: fail-safe, never reached in practice
if [ "$APPLIES" != "true" ]; then
  [ -n "$GATE" ] && printf '%s\n' "$GATE"
  exit 0
fi
case "$GATE" in
  *'"permissionDecision":"deny"'*) printf '%s\n' "$GATE"; exit 0 ;;
esac

# ── T-695: machine resource cap ───────────────────────────────────────────────
# WHY: 2026-09-26 one session ran 5–7 workers + 2 full suites + the cua VM at
# once — a test flaked under load (green alone) and the 4 workers that ended
# without a handback were all long runs; 2026-09-23 two overlapping full suites
# put load at 72 on 14 CPUs (T-681). Parallelism was PO judgment; now the
# machine is measured HERE, the one point every `prdt-*` dispatch passes before
# it spawns. Reached only after the `[ctx]` verdict above passed, so a cwd
# outside a prdt project and a non-prdt dispatch still cost zero forks.
#
# SIX AXES — each with its measurement, each failing OPEN on its own:
#   load       1-minute load average ÷ cores. `sysctl -n vm.loadavg` ("{ a b c }")
#              and `hw.ncpu`; Linux fallback /proc/loadavg + getconf. The vitest
#              timeout scaler's history on this machine: passes at load 4, times
#              out at load 10 (scripts/vitest-timeouts.cjs).
#   memory     `memory_pressure`'s own "System-wide memory free percentage: N%"
#              × `sysctl -n hw.memsize` — the same source `prdt doctor` uses
#              (T-619); never `vm_stat` free pages, which undercount reclaimable
#              inactive memory.
#   dispatches in-flight markers under $PRDT_HOME/run/dispatches/ (T-682) —
#              MACHINE-WIDE, every project's: no `stopped_at`, `since` within
#              STALE_H hours (the statusline's own STALE_HOURS rule), AND a live
#              worker transcript (slice 2 — the rule and its evidence sit at
#              the "dispatches axis" block below). THIS dispatch's marker is
#              written at SubagentStart, after this hook, so the count is the
#              OTHERS. `prdt dispatch ls` lists the same markers with the same
#              verdict per marker.
#   suites     vitest ENTRY processes in `ps -axo args=`: the node script token
#              is `…/vitest/vitest.mjs` (or `…/.bin/vitest`) and no `.test.`
#              file token follows — a single-file run is brief and cheap; "full"
#              is what the process list can tell apart. Measured 2026-09-26: one
#              `pnpm exec vitest run` is FOUR processes whose args mention
#              vitest — `/bin/sh …/pnpm exec vitest run` (the pnpm shim, no
#              exec), the pnpm-exe (titled `npm exec vitest run`), the node
#              entry, and N pool workers — and the pre-slice-2 filter ("any
#              args containing vitest, minus workers/`sh -c`") counted three of
#              them, so ONE suite denied at cap 1. Only the entry counts now;
#              an editor helper or any other process whose args merely contain
#              the word counts 0.
#   vms        `com.apple.Virtualization.VirtualMachine` processes in the same
#              ps output. Not `lume ls`: its status stays `running` after a stop
#              (machine wiki fact--qa-cua-vm), while the process IS the memory.
#   model_tier (T-774) the SAME dispatches-axis liveness computation, grouped
#              by each open marker's `model` field (prdt-post-dispatch.sh
#              writes it at SubagentStart — sonnet/opus/haiku/fable, or the
#              literal "default" bucket for a call with no override) and
#              compared only against the count in THIS dispatch's OWN
#              requested tier (`tool_input.model`, same normalization, same
#              "default" fallback — see `want_model` above). WHY per-tier
#              rather than folding into the existing machine-wide `dispatches`
#              cap: T-681's user request asked for device-level resource
#              limits that do not collapse to a worker-count knob, and the
#              designer's own note on this axis (critical-path.html §2) flags
#              that whether a model's rate/quota limit is per-model or
#              account-wide was never observed — scoping the cap to "same
#              tier only" means a wrong guess there cannot spill a denial onto
#              an unrelated tier. This axis is therefore a COUNT-based proxy
#              (in-flight dispatches on the tier), not the quota-probe shape
#              the designer's own draft table sketches (`run/preflight/*.json`
#              unavailable latches, a `<synthetic>` tail on same-model
#              markers) — that measurement needs `prdt preflight` machinery
#              this ticket's acceptance does not ask for; T-774's WHY note
#              scopes this slice to the in-flight count alone.
#
# CAPS — the measured value OVER the cap denies (memory: UNDER the minimum).
# Defaults sized on this machine (14 CPU / 36 GB) from the incidents above; any
# key can be overridden by `$PRDT_HOME/dispatch-caps.json`, a machine-scope
# JSON object of numbers the USER writes (no persona writes it — a PO write
# path needs its own contracts §Overrides carve-out first).
#   load_ratio       1.5  (21 on 14 cores) — 1.0 is crossed by one full suite
#                         alone (every dispatch would wait on any test run);
#                         2.0 is the band where tests already time out.
#   mem_free_pct_min 15   (~5.4 GB of 36) — one more worker (claude ~0.6 GB +
#                         node test children ~2 GB) still fits; a VM boot costs
#                         22 pp, and a dispatch right after one still passes.
#   inflight_max     5    — 5 in flight admits a 6th, 6 in flight denies the
#                         7th: the 5–7 band is where 2026-09-26 broke.
#   suites_max       1    — two full suites already running denies: the pair
#                         that broke both 09-23 and 09-26.
#   vms_max          2    — two VM processes (16 GiB, 44% of RAM) still admit;
#                         one leftover process must not stall every dispatch.
#   inflight_sonnet_max   } 5 each — T-774 has no incident of its own to size
#   inflight_opus_max     } these from (the designer's own note: unobserved
#   inflight_haiku_max    } whether a quota limit is even per-model), so each
#   inflight_fable_max    } defaults to the SAME value as `inflight_max`: the
#   inflight_default_max  } per-tier cap never binds tighter than the existing
#                           machine-wide one until the user tunes it here.
#
# A measurement that fails (tool missing, output unparsed) makes that axis
# `unmeasured`: it never denies, and the failure is said ONCE per session — the
# latch is `$PRDT_HOME/run/dispatch-gate/unmeasured.<session_id>` (run/ is the
# tooling-owned directory, no new carve-out). Under every cap: no added output.
# Nothing from the payload is echoed here either — the numbers are the
# machine's, the session id is used only as a sanitized file name.

PRDT_ROOT="${PRDT_HOME:-$HOME/.prdt}"
STALE_H=4

# One sysctl fork for all three keys (its output is one value per line, in
# argument order); a missing key leaves its line empty rather than shifting
# the others, and the Linux fallbacks fill only what stayed empty.
SYS="$(sysctl -n vm.loadavg hw.ncpu hw.memsize 2>/dev/null)"
LOADAVG="${SYS%%$'\n'*}"; SYS="${SYS#*$'\n'}"
NCPU="${SYS%%$'\n'*}"; SYS="${SYS#*$'\n'}"
MEMSIZE="${SYS%%$'\n'*}"
[ "$LOADAVG" = "$NCPU" ] && [ "$NCPU" = "$MEMSIZE" ] && { NCPU=""; MEMSIZE=""; }   # fewer than three lines
[ -n "$LOADAVG" ] || LOADAVG="$(cat /proc/loadavg 2>/dev/null)"
[ -n "$NCPU" ] || NCPU="$(getconf _NPROCESSORS_ONLN 2>/dev/null)"
MEMP="$(memory_pressure 2>/dev/null)"
PSOUT="$(ps -axo args= 2>/dev/null)"

# ── dispatches axis: markers, then liveness (T-695 slice 2) ──────────────────
# Each marker file is read on its own (bash builtin, no fork) and joined with a
# record separator, so ONE jq parses them one by one: a corrupt or half-written
# file makes THIS axis `unmeasured` and nothing else — the old `cat | jq -s`
# failed as a whole and the entire resource check vanished silently.
#
# A marker with no `stopped_at` is not a live worker. Measured 2026-09-26 on
# this machine: 13 open markers, 6 live, 7 phantom — six workers the harness
# killed on a 429 session limit (SubagentStop never fires for those) and one
# leaked test marker with no transcript at all. The 4 h `since` window alone
# held the gate shut for zero live workers until 10:31Z. So a candidate counts
# only when its WORKER TRANSCRIPT says it is alive:
#   path        marker `transcript` (written at SubagentStart since slice 2);
#               a marker without one (pre-slice-2) is looked up ONCE for all of
#               them with a single `find` under $CLAUDE_CONFIG_DIR/projects/
#               (*/<session>/subagents/agent-<id>.jsonl) — 33 ms flat vs ~8 ms
#               per bash glob per marker.
#   dead        the transcript's LAST record carries `"model":"<synthetic>"` —
#               the harness's own placeholder for a run it ended itself
#               (session limit · interrupt · API stop; every one of today's six
#               phantoms ends on exactly this line, ~1.4 KB, "You've hit your
#               session limit"). A resume appends new records, so a revived
#               worker stops matching the moment it writes.
#   dead        no transcript file and the marker is older than GRACE_S — a
#               worker writes its first record within seconds of SubagentStart
#               (this dispatch's own: 0 s), so 5 min is 60× that; younger with
#               no file yet = a worker that is starting, counted.
#   dead        the transcript's mtime is older than IDLE_MIN — the no-signature
#               crash. Evidence for 30 min: over 93 worker transcripts / 20,450
#               consecutive writes of the last 30 h, p99 of the gap is 0.7 min,
#               p99.9 is 3.5 min, the largest in-run gap is 10.0 min (Bash's own
#               600 s ceiling); every gap over that (18–224 min) is a pause
#               between coordinator resumes, whose marker was `stopped_at` then.
#               A worker parked on a background job past 30 min is not counted
#               either — it holds no CPU, which is what this axis guards.
#   alive       otherwise.
# Any failure on this path (jq · find · stat · tail missing or unparsed) leaves
# `$INFLIGHT` empty = unmeasured; every other axis still judges.
# `prdt dispatch ls` applies the same rule to the same files and names each
# marker's state — it is the command the deny text points at.
GRACE_S=300
IDLE_MIN=30
CLAUDE_CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
MARK_BAD=""          # non-empty = the dispatches axis is unmeasured
MARK_CANDS=""        # `<agent_id>US<transcript>US<age-seconds>` per open, fresh marker
MTIMES=""; TAILS=""  # liveness evidence for the transcripts that exist
MARK_FILES=()
for f in "$PRDT_ROOT"/run/dispatches/*.json; do
  [ -e "$f" ] || continue
  [ -r "$f" ] || { MARK_BAD=1; continue; }
  MARK_FILES+=("$f")
done
if [ -z "$MARK_BAD" ] && [ ${#MARK_FILES[@]} -gt 0 ]; then
  # ONE fork reads every marker: `tail -n +1` prints each file whole behind
  # its own `==> path <==` header (`/dev/null` forces the headers even for a
  # single file — macOS tail has no -v). `$(<f)` per file would fork once per
  # marker on bash 3.2 (42 markers = +120 ms, measured).
  MARK_RAW="$(tail -n +1 -- "${MARK_FILES[@]}" /dev/null 2>/dev/null)"
  # Fields are joined with US (0x1f): a TAB is IFS whitespace to `read`, so an
  # empty middle field (a legacy marker's transcript) would collapse away.
  # Line 1: `<bad-count>`; then one candidate line per open marker whose
  # `since` is within STALE_H. Values are our own hook's writes, never payload
  # — still, an id is used below only as a file-name token and a path only
  # when absolute. T-774: a fourth field, `model` — normalized the same way as
  # `want_model` above (a legacy marker predating T-774 has no `.model` at all,
  # which `// "default"` folds into the same bucket a fresh tier-less marker
  # gets, never a parse failure).
  IFS= read -r -d '' MPROG <<'JQ'
(reduce (split("\n"))[] as $l ({cur: null, files: {}};
   if ($l | test("^==> .* <==$")) then (($l | capture("^==> (?<p>.*) <==$").p) as $p | .cur = $p | .files[$p] = "")
   elif .cur == null then . else .files[.cur] += $l + "\n" end)
 | .files | to_entries | map(select(.key != "/dev/null") | .value | try fromjson catch "BAD")) as $m
| ($m | map(select(. == "BAD")) | length) as $bad
| (now | floor) as $now
| ($m | map(select(type == "object" and ((.stopped_at // null) == null))
        | ((.since // "") | try fromdate catch null) as $s
        | select($s != null and ($now - $s) < ($stale_h * 3600))
        | {id: ((.agent_id // "") | tostring), t: ((.transcript // "") | tostring), age: ($now - $s),
           model: (((.model // "default") | tostring) as $mm
                   | if ($mm | test("^(sonnet|opus|haiku|fable)$")) then $mm else "default" end)})) as $c
| "\($bad)", ($c[] | "\(.id | gsub("[\u001f\n]"; ""))\u001f\(.t | gsub("[\u001f\n]"; ""))\u001f\(.age)\u001f\(.model | gsub("[\u001f\n]"; ""))")
JQ
  MOUT="$(printf '%s' "$MARK_RAW" | jq -r -R -s --argjson stale_h "$STALE_H" "$MPROG" 2>/dev/null)"
  if [ -z "$MOUT" ]; then
    MARK_BAD=1
  else
    US=$'\x1f'
    BADN="${MOUT%%$'\n'*}"; CANDS="${MOUT#*$'\n'}"; [ "$CANDS" = "$MOUT" ] && CANDS=""
    if [ "$BADN" != "0" ]; then
      MARK_BAD=1
    else
      # Legacy markers (no `transcript`): one `find` for all of them. Zero forks
      # once every open marker carries its path.
      FIND_ARGS=(); FOUND=""
      while IFS=$US read -r id t age model; do
        [ -n "$id" ] || continue
        case "$t" in /*) continue ;; esac
        case "$id" in *[!A-Za-z0-9_-]*) continue ;; esac
        if [ ${#FIND_ARGS[@]} -eq 0 ]; then FIND_ARGS=(-name "agent-$id.jsonl")
        else FIND_ARGS+=(-o -name "agent-$id.jsonl"); fi
      done <<< "$CANDS"
      if [ ${#FIND_ARGS[@]} -gt 0 ] && [ -d "$CLAUDE_CFG/projects" ]; then
        FOUND="$(find "$CLAUDE_CFG/projects" -maxdepth 4 -name 'agent-*.jsonl' -path '*/subagents/*' \( "${FIND_ARGS[@]}" \) 2>/dev/null)"
      fi
      # Resolve every candidate to a path (or none); collect the paths that exist.
      EXIST=()
      while IFS=$US read -r id t age model; do
        [ -n "$id" ] || continue
        case "$t" in /*) ;; *) t="" ;; esac
        if [ -z "$t" ] && [ -n "$FOUND" ]; then
          case "$id" in *[!A-Za-z0-9_-]*) ;; *)
            while IFS= read -r fp; do
              case "$fp" in */"agent-$id.jsonl") t="$fp"; break ;; esac
            done <<< "$FOUND" ;;
          esac
        fi
        [ -n "$t" ] && [ -f "$t" ] && EXIST+=("$t")
        MARK_CANDS="$MARK_CANDS$id$US$t$US$age$US$model"$'\n'
      done <<< "$CANDS"
      if [ ${#EXIST[@]} -gt 0 ]; then
        # macOS stat first, GNU second; `/dev/null` forces tail's per-file
        # headers even for a single transcript. The verdict itself is computed
        # inside the resource program below (one jq, not two).
        MTIMES="$(stat -f '%m %N' -- "${EXIST[@]}" 2>/dev/null)"
        [ -n "$MTIMES" ] || MTIMES="$(stat -c '%Y %n' -- "${EXIST[@]}" 2>/dev/null)"
        TAILS="$(tail -c 4000 -- "${EXIST[@]}" /dev/null 2>/dev/null)"
        [ -n "$MTIMES" ] && [ -n "$TAILS" ] || MARK_BAD=1
      fi
    fi
  fi
fi

CAPSF="$PRDT_ROOT/dispatch-caps.json"
CAPS='{}'
CAPS_BAD=""
if [ -e "$CAPSF" ]; then
  CAPS="$(jq -c 'if type == "object" then with_entries(select(.value | type == "number")) else empty end' "$CAPSF" 2>/dev/null)"
  [ -n "$CAPS" ] || { CAPS='{}'; CAPS_BAD=1; }
fi

IFS= read -r -d '' RPROG <<'JQ'
def r2: (. * 100 | round) / 100;
def num: try (tonumber | select(. >= 0)) catch null;
def deny($why): {hookSpecificOutput: {hookEventName: "PreToolUse",
  permissionDecision: "deny", permissionDecisionReason: $why}};

({load_ratio: 1.5, mem_free_pct_min: 15, inflight_max: 5, suites_max: 1, vms_max: 2,
  inflight_sonnet_max: 5, inflight_opus_max: 5, inflight_haiku_max: 5, inflight_fable_max: 5,
  inflight_default_max: 5} + $caps) as $cap
| $cap["inflight_\($want_model)_max"] as $tier_cap
| ([$loadavg | scan("[0-9]+\\.[0-9]+")] | first | if . == null then null else num end) as $load1
| ($ncpu | num | if . == 0 then null else . end) as $ncpu
| ($memsize | num | if . == 0 then null else . end) as $memsize
| ([$memp | capture("free percentage: *(?<p>[0-9]+)%")] | first | if . == null then null else (.p | num) end) as $memfree
| (if $ps == "" then null else ($ps | split("\n")) end) as $procs
| (if $procs == null then null else
     ($procs | map(select(test("vitest") and test("^(\\S*/)?node(js|[0-9]+)?(\\s+-\\S*)*\\s+\\S*/(vitest/vitest\\.mjs|\\.bin/vitest)(\\s|$)")
                          and (test("\\.test\\.[cm]?[jt]sx?") | not))) | length) end) as $suites
| (if $procs == null then null else
     ($procs | map(select(test("com\\.apple\\.Virtualization\\.VirtualMachine$"))) | length) end) as $vms
| (if $mark_bad != "" then null else
     try (
       ($mtimes | split("\n") | map(capture("^(?<m>[0-9]+) (?<p>.+)$")) | map({(.p): (.m | tonumber)}) | add // {}) as $mt
       | (reduce ($tails | split("\n"))[] as $l ({cur: "", last: {}};
            if ($l | test("^==> .* <==$")) then .cur = ($l | capture("^==> (?<p>.*) <==$").p)
            elif $l == "" or .cur == "" then . else .last[.cur] = $l end)).last as $last
       | [$cands | split("\n")[] | select(length > 0) | split("\u001f") | {id: .[0], t: .[1], age: (.[2] | tonumber), model: (.[3] // "default")}]
       | map(. + {live: (if .t == "" or ($mt[.t] // null) == null then (.age < $grace)
             elif (($last[.t] // "") | contains("\"model\":\"<synthetic>\"")) then false
             elif (now - $mt[.t]) > ($idle_min * 60) then false
             else true end)})
     ) catch null end) as $live_cands
| (if $live_cands == null then null else ($live_cands | map(select(.live)) | length) end) as $inflight
| (if $live_cands == null then null else ($live_cands | map(select(.live and .model == $want_model)) | length) end) as $tier_inflight
| (if $load1 != null and $ncpu != null then ($load1 / $ncpu) else null end) as $ratio
| (if $memsize != null then ($memsize / 1073741824 | r2) else null end) as $gb
| [
  {k: "load", ok: ($ratio != null), over: ($ratio != null and $ratio > $cap.load_ratio),
   text: (if $ratio != null then "CPU load 1m \($load1 | r2) on \($ncpu) cores = ratio \($ratio | r2) (cap \($cap.load_ratio) — sysctl vm.loadavg / hw.ncpu)"
          else "CPU load: unmeasured (sysctl vm.loadavg / hw.ncpu)" end),
   free: "wait for load to fall (a running suite or worker finishing)"},
  {k: "memory", ok: ($memfree != null), over: ($memfree != null and $memfree < $cap.mem_free_pct_min),
   text: (if $memfree != null then "available memory \($memfree)%\(if $gb != null then " of \($gb) GB" else "" end) (min \($cap.mem_free_pct_min)% — memory_pressure free percentage × hw.memsize)"
          else "available memory: unmeasured (memory_pressure × hw.memsize)" end),
   free: "free memory: stop a VM whose job is done (`prdt resource ls` names its owner) or wait for a suite to finish"},
  {k: "dispatches", ok: ($inflight != null), over: ($inflight != null and $inflight > $cap.inflight_max),
   text: (if $inflight != null then "in-flight dispatches \($inflight) machine-wide, every project (cap \($cap.inflight_max) — run/dispatches markers with no stopped_at, since < \($stale_h) h, and a live worker transcript: not ended by the harness, written within \($idle_min) min)"
          else "in-flight dispatches: unmeasured (a run/dispatches marker is unreadable or a liveness probe failed — `prdt dispatch ls` names it)" end),
   free: "wait for a worker to return (`prdt dispatch ls` lists every project's in-flight dispatches and each marker's state)"},
  {k: "suites", ok: ($suites != null), over: ($suites != null and $suites > $cap.suites_max),
   text: (if $suites != null then "running full test suites \($suites) (cap \($cap.suites_max) — vitest entry processes (node …/vitest/vitest.mjs) with no .test. file filter, from ps; pnpm wrappers and pool workers are not counted)"
          else "running full test suites: unmeasured (ps)" end),
   free: "wait for a full test suite to finish"},
  {k: "vms", ok: ($vms != null), over: ($vms != null and $vms > $cap.vms_max),
   text: (if $vms != null then "resident VMs \($vms) (cap \($cap.vms_max) — com.apple.Virtualization.VirtualMachine processes, from ps)"
          else "resident VMs: unmeasured (ps)" end),
   free: "stop a VM whose job is done (`prdt resource ls` names its owner; a VM no marker owns is the user's)"},
  {k: "model_tier", ok: ($tier_inflight != null), over: ($tier_inflight != null and $tier_inflight > $tier_cap),
   text: (if $tier_inflight != null then "in-flight dispatches on model tier \"\($want_model)\" \($tier_inflight) machine-wide (cap \($tier_cap) — same run/dispatches liveness rule as the dispatches axis, grouped by each marker's model)"
          else "in-flight dispatches on model tier \"\($want_model)\": unmeasured (a run/dispatches marker is unreadable or a liveness probe failed — `prdt dispatch ls` names it)" end),
   free: "wait for a worker on the same model tier to return, or dispatch on a different tier"}
  ] as $axes
| ($axes | map(select(.ok | not) | .k)) as $unm_axes
| (if $caps_bad == "1" then $unm_axes + ["caps-file"] else $unm_axes end) as $unm
| (if ($unm | length) == 0 then "" else
     "[prdt dispatch gate] resource check: unmeasured " + ($unm | join(", "))
     + " — a measurement failed (tool missing or output unparsed), so that axis never blocks a dispatch; said once per session."
     + (if $caps_bad == "1" then " `dispatch-caps.json` is not a JSON object of numbers — defaults in force." else "" end) end) as $note
| ($axes | map(select(.over))) as $over
| (if ($over | length) == 0 then "" else
     deny("[prdt dispatch gate] WAITING — the machine is over cap; nothing was spawned and no dispatch tokens were spent."
          + "\nmeasured: " + ($axes | map(.text) | join(" · "))
          + "\nover cap: " + ($over | map(.k) | join(", "))
          + "\nfrees it: " + ($over | map(.free) | join("; "))
          + " — then re-dispatch the same prompt. Caps: defaults in prdt-dispatch-gate.sh, machine override `$PRDT_HOME/dispatch-caps.json` (keys load_ratio · mem_free_pct_min · inflight_max · suites_max · vms_max · inflight_sonnet_max · inflight_opus_max · inflight_haiku_max · inflight_fable_max · inflight_default_max, numbers only)."
          + (if $note == "" then "" else "\n" + $note end)) | tojson end) as $deny
| "\($unm | join(","))\n\($deny)\n\($note)\nend"
JQ

RES="$(jq -rn \
  --arg loadavg "$LOADAVG" --arg ncpu "$NCPU" --arg memsize "$MEMSIZE" --arg memp "$MEMP" \
  --arg ps "$PSOUT" --argjson caps "$CAPS" --arg caps_bad "$CAPS_BAD" \
  --arg mark_bad "$MARK_BAD" --arg cands "$MARK_CANDS" --arg mtimes "$MTIMES" --arg tails "$TAILS" \
  --argjson stale_h "$STALE_H" --argjson idle_min "$IDLE_MIN" --argjson grace "$GRACE_S" \
  --arg want_model "$WANT_MODEL" \
  "$RPROG" 2>/dev/null)"

# ── T-773: the schedule record — one `dispatch` row per dispatch that passed ──
# Reached only once every check above passed (a deny above never records: that
# dispatch never left). `prdt schedule record` reads THIS event on stdin,
# computes `prdt schedule` for the project at this moment, appends one row to
# `<project>/.prdt/schedule.jsonl` (ticket · critical path · top row · class
# followed/deviated/continuation/off-graph · `[ctx].schedule_reason` ·
# `[ctx].worktree`) and prints ONE warning line when the dispatch is off the
# top row with no `schedule_reason` — a WARNING, never a deny (T-765, user
# decision). The CLI is the sibling mirror copy (`~/.prdt/bin/prdt` beside
# `~/.prdt/hooks/`), or `scripts/prdt` beside `scripts/hooks/` in the repo.
# PRDT_META_BACKUP=0: contracts §Git never lets a per-turn hook trigger the
# meta backup push (the CLI also skips it for `record` on its own). Any
# failure — no CLI, no python3, a crash — is silence: the record fails open
# exactly like every other part of this hook, and the dispatch still goes.
schedule_record() {
  local hd="${BASH_SOURCE[0]%/*}" cli
  [ "$hd" = "${BASH_SOURCE[0]}" ] && hd="."
  cli="$hd/../bin/prdt"
  [ -f "$cli" ] || cli="$hd/../prdt"
  [ -f "$cli" ] || return 0
  printf '%s' "$EV" | PRDT_META_BACKUP=0 python3 "$cli" schedule record 2>/dev/null
}

# Merge extra advisory lines into the `[ctx]` verdict (a warn object or empty)
# as one PreToolUse additionalContext, then exit.
emit() {
  local extra="$1" out=""
  if [ -z "$extra" ]; then
    [ -n "$GATE" ] && printf '%s\n' "$GATE"
    exit 0
  fi
  if [ -n "$GATE" ]; then
    out="$(printf '%s' "$GATE" | jq -c --arg n "$extra" '.hookSpecificOutput.additionalContext += "\n" + $n' 2>/dev/null)"
  else
    out="$(jq -nc --arg n "$extra" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $n}}' 2>/dev/null)"
  fi
  [ -n "$out" ] || out="$GATE"
  [ -n "$out" ] && printf '%s\n' "$out"
  exit 0
}

if [ -z "$RES" ]; then
  # The resource program itself failed: fail OPEN, keep the `[ctx]` verdict.
  emit "$(schedule_record)"
fi
UNM="${RES%%$'\n'*}"; REST="${RES#*$'\n'}"
DENY="${REST%%$'\n'*}"; REST="${REST#*$'\n'}"
NOTE="${REST%%$'\n'*}"

if [ -n "$DENY" ]; then
  printf '%s\n' "$DENY"
  exit 0
fi
SCHED_WARN="$(schedule_record)"

# Unmeasured: say it once per session. The session id is a file-name token
# only — anything outside [A-Za-z0-9._-] collapses to `nosession`.
if [ -n "$UNM" ]; then
  case "$SID" in *[!A-Za-z0-9._-]*|"") SID="nosession" ;; esac
  LATCH_DIR="$PRDT_ROOT/run/dispatch-gate"
  LATCH="$LATCH_DIR/unmeasured.$SID"
  PREV=""
  [ -r "$LATCH" ] && IFS= read -r PREV < "$LATCH"
  if [ "$PREV" = "$UNM" ]; then
    NOTE=""
  else
    mkdir -p "$LATCH_DIR" 2>/dev/null
    printf '%s\n' "$UNM" > "$LATCH" 2>/dev/null
    find "$LATCH_DIR" -type f -mtime +1 -delete 2>/dev/null
  fi
fi

EXTRA="$NOTE"
if [ -n "$SCHED_WARN" ]; then
  if [ -n "$EXTRA" ]; then EXTRA="$EXTRA"$'\n'"$SCHED_WARN"; else EXTRA="$SCHED_WARN"; fi
fi
emit "$EXTRA"
