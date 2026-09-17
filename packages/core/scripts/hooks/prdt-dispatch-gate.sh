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
end
JQ

OUT="$(printf '%s' "$EV" | jq -c \
  --arg clause_ctx "$CLAUSE_CTX" \
  --arg clause_prd "$CLAUSE_PRD" \
  --arg clause_lang "$CLAUSE_LANG" \
  --arg clause_dispatch_id "$CLAUSE_DISPATCH_ID" \
  --argjson required '["slug","goal","change_meta","acceptance","wiki_refs","user_lang","prd_path"]' \
  "$PROG" 2>/dev/null)"

# Any jq failure yields empty output and therefore silence: this hook can only
# ever fail OPEN. A gate that breaks a dispatch because its own parser tripped
# would be worse than the drift it exists to catch.
[ -n "$OUT" ] || exit 0
printf '%s\n' "$OUT"
exit 0
