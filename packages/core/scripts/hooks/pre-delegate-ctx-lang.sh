#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Enforces user_lang in the [ctx] inline JSON of a persona dispatch.
#
# WHY: Tier-0 doctrine (common/habit.md) requires user-review artifacts be
# produced in [ctx].user_lang. The PO sometimes constructs a `claude --agent
# pdt-*` dispatch and forgets to pass user_lang, so the subagent guesses the
# language and artifacts come out wrong. The language rule already exists in
# doctrine — this hook makes the omission MECHANICALLY un-shippable.
#
# DESIGN — block, not inject:
#   Claude Code's PreToolUse hook cannot rewrite the Bash command string the
#   model produced (no supported updatedInput for command mutation). So we
#   cannot transparently inject user_lang into the [ctx]. Instead we BLOCK with
#   a copy-pasteable fix that already carries the canonical user_lang resolved
#   from settings, so the PO re-issues the dispatch correctly. This is the
#   fallback the spec calls for when injection is infeasible.
#
# SCOPE / SAFETY:
#   - Only fires on `claude --agent pdt-*` dispatches (fresh delegations).
#   - SKIPS `--resume` (ctx + lang already established earlier in the ticket).
#   - SKIPS commands with no `[ctx]` at all (not the lang-rule's job — other
#     hooks own ctx-shape; we only guard the one field once a [ctx] exists).
#   - Fail-OPEN on any parse error → never breaks an unrelated Bash command.
#   - Idempotent: a dispatch that already has user_lang passes silently.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

COMMAND="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)"

# Fast path — only fresh persona dispatches. Resume reuses an established ctx.
# Match on `--agent pdt-` (and require a `claude` token somewhere) rather than
# the adjacent `claude --agent` string: the real portable dispatch interposes
# flags (`claude --add-dir ~/.productune -p --agent pdt-<persona>`), so an
# adjacency glob would silently never fire.
case "$COMMAND" in
  *"--resume "*) exit 0 ;;
esac
case "$COMMAND" in
  *"claude"*"--agent pdt-"*) ;;
  *) exit 0 ;;
esac

# ── Inspect the [ctx] JSON for the user_lang key ─────────────────────────────
# Returns:  "missing"  → [ctx] present but no (non-empty) user_lang
#           "ok"       → user_lang present, or no [ctx] to guard, or parse fail
# Fail-open: any exception/uncertainty resolves to "ok" so we never false-block.
CTX_STATUS="$(printf '%s' "$COMMAND" | python3 -c "
import sys, re, json
try:
    cmd = sys.stdin.read()
    # Locate the [ctx] marker; everything after it begins the inline JSON object.
    i = cmd.find('[ctx]')
    if i < 0:
        print('ok'); raise SystemExit       # no ctx to guard — not our concern
    rest = cmd[i + len('[ctx]'):]
    b = rest.find('{')
    if b < 0:
        print('ok'); raise SystemExit       # malformed/absent — fail open
    # Brace-match to extract the JSON object even with nested braces/strings.
    depth = 0; instr = False; esc = False; end = -1
    for j, ch in enumerate(rest[b:], start=b):
        if esc:
            esc = False; continue
        if ch == '\\\\':
            esc = True; continue
        if ch == '\"':
            instr = not instr; continue
        if instr:
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = j; break
    if end < 0:
        print('ok'); raise SystemExit       # unbalanced — fail open
    blob = rest[b:end + 1]
    try:
        obj = json.loads(blob)
        val = obj.get('user_lang')
        print('missing' if (val is None or val == '') else 'ok')
    except Exception:
        # Not strict JSON (PO may hand-write loose ctx) — fall back to a
        # tolerant key scan so we still catch a true omission.
        if re.search(r'\"user_lang\"\s*:\s*\"[^\"]+\"', blob):
            print('ok')
        else:
            print('missing')
except SystemExit:
    raise
except Exception:
    print('ok')
" 2>/dev/null)"

# Any non-"missing" outcome (including the empty string from a python crash)
# passes — strictly fail-open.
[ "$CTX_STATUS" != "missing" ] && exit 0

# ── Resolve canonical user_lang from settings (default ko) ───────────────────
# Source of truth: ~/.productune/settings.json -> .ui.language
SETTINGS="$HOME/.productune/settings.json"
USER_LANG="$(jq -r '.ui.language // empty' "$SETTINGS" 2>/dev/null)"
[ -z "$USER_LANG" ] && USER_LANG="ko"   # user is Korean; safe default

emit_block() {
  printf '{"decision":"block","reason":%s}\n' \
    "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
  exit 0
}

emit_block "[ctx] 에 user_lang 누락 — 위임 차단.

Tier-0 doctrine: 사용자-검토 산출물은 [ctx].user_lang 언어로 생성해야 합니다 (common/habit.md). 이 dispatch 의 [ctx] JSON 에 user_lang 키가 없어 subagent 가 언어를 추측하게 됩니다.

수정: [ctx] JSON 에 다음을 추가한 뒤 다시 위임하세요 (canonical 값 = ~/.productune/settings.json .ui.language):

  \"user_lang\": \"$USER_LANG\"

예: [ctx] {... , \"user_lang\": \"$USER_LANG\"}

(이 게이트는 fresh \`claude --agent pdt-*\` 위임에만 작동하며 --resume 은 통과합니다.)"
