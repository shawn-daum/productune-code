# T-P4-136 · PreToolUse hook: ticket frontmatter status lint
**Slug**: ticket-frontmatter-lint-hook
**Date**: 2026-05-19
**Round**: phase4-r4
**Artifact**: plan (1/1 for this dispatch)
**Status**: ready

---

## §1 Context — root cause + scope

### Root cause (PO-summarised, 2026-05-19)

`status: planned` appeared in T-P4-131 ~ T-P4-135. Three compounding causes:

| # | Cause | Note |
|:--|:--|:--|
| 1 | LLM training prior bias | GitHub / Jira / Linear all use `planned` as common status |
| 2 | Cascade self-mimic | First violation copied by subsequent batch tickets |
| 3 | No enum in TASK payload | Canonical enum was not injected into dispatch context |

### Scope decision (user: "B만")

| Option | Chosen? |
|:--|:--|
| A — doctrine reinforcement (enum wording in delegation.md / persona files) | ❌ dropped |
| B — PreToolUse hook lint (block Write/Edit with bad `status:`) | ✅ |

---

## §2 Hook spec

### 2.1 File

`packages/core/scripts/hooks/pre-frontmatter-lint.sh`

### 2.2 Trigger

`settings.json` → `PreToolUse` → new entry, `matcher: "Write|Edit"`.

Existing `post-edit-format.sh` uses `PostToolUse "Write|Edit"` — same matcher format confirmed.

### 2.3 Path filter

Only fires when `file_path` matches `docs/tickets/*/T-*.md` (bash `[[ $path == docs/tickets/*/T-*.md ]]`).
All other paths → `exit 0` immediately (no performance impact on non-ticket writes).

### 2.4 Field validation

| Field | Canonical values | Check when |
|:--|:--|:--|
| `status:` | `todo`, `in-progress`, `review`, `user-verify`, `done`, `blocked`, `abandoned` | Always (required field) |
| `qa_status:` | `pending`, `pass`, `fail` | Only when key is present in content |

### 2.5 Tool-specific content extraction

**Write tool** — full file content in `tool_input.content`:
- Extract frontmatter block (between first two `---` lines).
- Grep `^status: (.+)` → validate.
- Grep `^qa_status: (.+)` → validate if present.

**Edit tool** — patch in `tool_input.new_string`:
- Check if `new_string` contains `status:` → if yes, extract value → validate.
- Check if `new_string` contains `qa_status:` → if yes, extract → validate.
- If `new_string` contains neither → `exit 0` (edit doesn't touch these fields).

### 2.6 Violation output + exit code

```
[frontmatter-lint] status: "planned" not in canonical enum.
  allowed: todo | in-progress | review | user-verify | done | blocked | abandoned
  Fix the value and retry.
```

`exit 2` — Claude Code interprets exit 2 as "block the tool call, surface stderr to model."

### 2.7 Script (full)

```bash
#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit
# Validates ticket frontmatter `status:` + `qa_status:` against canonical enums.
# Blocks (exit 2) on violation; passes (exit 0) on clean or non-ticket paths.
#
# T-P4-136 — 2026-05-19

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# ── Extract tool_name, file_path, content ─────────────────────────────────────
read_json() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', {})
    print(ti.get('$1', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON"
}

FILE_PATH="$(read_json file_path)"

# ── Path filter — only docs/tickets/*/T-*.md ─────────────────────────────────
# Normalise: strip leading ./ or /
FILE_PATH="${FILE_PATH#./}"
FILE_PATH="${FILE_PATH#/}"
[[ "$FILE_PATH" == docs/tickets/*/T-*.md ]] || exit 0

TOOL_NAME="$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"

# ── Extract text to lint ──────────────────────────────────────────────────────
if [[ "$TOOL_NAME" == "Write" ]]; then
  LINT_TEXT="$(read_json content)"
elif [[ "$TOOL_NAME" == "Edit" ]]; then
  LINT_TEXT="$(read_json new_string)"
else
  exit 0
fi

[ -z "$LINT_TEXT" ] && exit 0

# ── Enum definitions ──────────────────────────────────────────────────────────
STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"
QA_STATUS_ENUM="pending|pass|fail"

# ── status: validation ────────────────────────────────────────────────────────
if printf '%s' "$LINT_TEXT" | grep -qE '^status:'; then
  STATUS_VAL="$(printf '%s' "$LINT_TEXT" | grep -E '^status:' | head -1 \
    | sed 's/^status:[[:space:]]*//' | tr -d '"'"'"' ')"
  if [ -n "$STATUS_VAL" ]; then
    if ! printf '%s' "$STATUS_VAL" | grep -qE "^($STATUS_ENUM)$"; then
      printf '[frontmatter-lint] status: "%s" not in canonical enum.\n' "$STATUS_VAL" >&2
      printf '  allowed: %s\n' "$(printf '%s' "$STATUS_ENUM" | tr '|' ' | ')" >&2
      printf '  Fix the value and retry.\n' >&2
      exit 2
    fi
  fi
fi

# ── qa_status: validation (only when key present) ────────────────────────────
if printf '%s' "$LINT_TEXT" | grep -qE '^qa_status:'; then
  QA_VAL="$(printf '%s' "$LINT_TEXT" | grep -E '^qa_status:' | head -1 \
    | sed 's/^qa_status:[[:space:]]*//' | tr -d '"'"'"' ')"
  if [ -n "$QA_VAL" ]; then
    if ! printf '%s' "$QA_VAL" | grep -qE "^($QA_STATUS_ENUM)$"; then
      printf '[frontmatter-lint] qa_status: "%s" not in canonical enum.\n' "$QA_VAL" >&2
      printf '  allowed: %s\n' "$(printf '%s' "$QA_STATUS_ENUM" | tr '|' ' | ')" >&2
      printf '  Fix the value and retry.\n' >&2
      exit 2
    fi
  fi
fi

exit 0
```

---

## §3 settings.json registration

Add new entry to the `PreToolUse` array (after the existing two `Bash` entries):

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "/Users/x/Documents/dev/ntf-products/productune/packages/core/scripts/hooks/pre-frontmatter-lint.sh"
    }
  ]
}
```

Full updated `PreToolUse` array will have 3 entries:
1. `Bash` → `pre-delegate-task-check.sh`
2. `Bash` → `pre-chunking-warn.sh`
3. `Write|Edit` → `pre-frontmatter-lint.sh` ← new

---

## §4 delegation.md cross-ref (1 line)

In `~/.productune/sections/delegation.md`, existing lifecycle metadata paragraph (around line 13):

> Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata when routing/closing: status, timestamps, duration, assignee/routing/model/effort/progress refs only.

**Append** after that sentence (same bullet):

```
  `status:` enum enforced by `pre-frontmatter-lint.sh` PreToolUse hook (T-P4-136).
```

---

## §5 Edge cases

| Case | Behaviour |
|:--|:--|
| Write to non-ticket path (e.g. `docs/design/*.md`) | `exit 0` immediately — path filter |
| Edit that doesn't touch `status:` or `qa_status:` | `exit 0` — no matching grep |
| `status:` value with surrounding quotes (`"todo"`) | `tr -d '"'"'"'` strips quotes before compare |
| `status:` absent from Write content entirely | No grep match → skip (schema validation not in scope) |
| Hook stdin empty (hook not invoked via stdin) | `[ -z "$EVENT_JSON" ] && exit 0` guard |
| python3 unavailable | `read_json` returns empty string; grep finds nothing; `exit 0` (no false-block) |

---

## §Out of scope

- Validating other frontmatter fields (`type:`, `estimated_complexity:`, `model:`, etc.) — scope creep; add separately if needed.
- Fixing already-emitted tickets with bad `status:` — PO updates T-P4-131~135 frontmatter manually (linter already ran a correction pass: `planned` → `todo`).
- Syncing `~/.productune/sections/delegation.md` home-mirror — this file lives only at `~/.productune/`; no repo mirror.
- Doctrine reinforcement (option A) — user explicitly dropped.

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `pre-frontmatter-lint.sh` — status enum block + qa_status enum block |
| **사용자 dogfood** | (1) `status: planned` 가 포함된 ticket Write 시도 → `[frontmatter-lint]` stderr + block 확인. (2) `status: todo` → pass 확인. (3) `qa_status: ready` (비정규) → block 확인. (4) non-ticket path (`docs/design/foo.md`) Write → pass (no lint). |
| **regression check** | `post-edit-format.sh` (`PostToolUse Write|Edit`) 동작 변경 없음 확인. 기존 Bash PreToolUse hooks 두 개 영향 없음. |
