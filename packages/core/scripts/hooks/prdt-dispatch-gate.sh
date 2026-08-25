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
#         top-level key, or carries a malformed `prd_path`.
#   WARN  per-FIELD Hangul ratio of `[ctx].goal` / `[ctx].acceptance` over 0.10.
#         Never a deny: the drift already stopped behaviourally (the last 6
#         dispatches are all under 0.05), so day-one denying it would only
#         teach a workaround. Promote to deny after one clean round.
#   NOT HERE — the return/envelope side (slice 3), and the three binary
#         candidates held under doctrine #5 for zero observed violations
#         (AskUserQuestion in a worker · worker↔worker calls · discipline-path
#         writes). Adding any of them needs its own user decision.
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
# Up-walk the cwd's ancestor chain for the `.prdt/po-state.json` marker, the
# same IN-or-OUT test prdt-call-governor.sh makes (it never reads the file, so
# it needs neither the outermost-wins rule nor a realpath — T-484/T-493).
# `cwd` sits in the payload's first keys (session_id · transcript_path · cwd ·
# …, measured on harness 2.1.235), so a window is enough to find it and a
# pathological tool_input never has to be scanned.
HDR="${EV:0:8192}"
RE_CWD='"cwd"[[:space:]]*:[[:space:]]*"([^"]+)"'
[[ $HDR =~ $RE_CWD ]] || exit 0
DIR="${BASH_REMATCH[1]}"
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
CLAUSE_LANG='Machine-facing (envelopes, frontmatter keys, enums, code identifiers, paths, `## Acceptance`) → English.'

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
              deny(head + "`[ctx].prd_path` is malformed.\ncontracts.md §Fixed paths, verbatim:\n" + $clause_prd + "\nThe fragment is what scopes the worker's read to ONE version section, so it is the shape that has to be exact." + tail)
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
  --argjson required '["slug","goal","change_meta","acceptance","wiki_refs","user_lang","prd_path"]' \
  "$PROG" 2>/dev/null)"

# Any jq failure yields empty output and therefore silence: this hook can only
# ever fail OPEN. A gate that breaks a dispatch because its own parser tripped
# would be worse than the drift it exists to catch.
[ -n "$OUT" ] || exit 0
printf '%s\n' "$OUT"
exit 0
