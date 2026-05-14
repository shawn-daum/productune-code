# T-P4-104 · Doctrine fix-forward: chunking enforcement
**Slug**: doctrine-chunking-enforcement  
**Date**: 2026-05-14  
**Round**: r4-doctrine  
**Artifact**: plan only (1/1 for this dispatch)  
**Status**: ready

---

## §1 Background — observation data

### T-P4-099 dispatch cycle (3-cycle pattern)

| Cycle | Model/Effort | Scope shipped | Outcome |
|:--|:--|:--|:--|
| 1 (opus/max) | 4 artifacts — system.md, flow.md, 2× screens | hang → user cancel | stale partial |
| 2 (sonnet/xhigh) | 3 artifacts — system.md, flow.md, screens/ | hang → user cancel | stale partial |
| 3 (sonnet/xhigh split) | 1–2 artifacts per sub-call | landed | ✓ |

**Patterns confirmed:**
- Hang threshold = **3+ artifacts** in one dispatch (token + wall-clock both blow up).  
- 2 artifacts = consistently OK (T-P4-103 sweet spot ~6 min).  
- 1 artifact = fastest, always clean (T-P4-103 sub-calls).  
- ROADMAP / Activity Log rows = PO mechanical (< 1 sec, never block designer turn).  

### Why the rule keeps failing

`feedback_designer_chunking.md` (memory file, read once at session start) is the **only** canonical home for this rule. `delegation.md` — the file PO reads on-demand before every dispatch — has **zero chunking text** (confirmed grep: no match for `chunk|ceiling|artifact.*max`). `po-instructions.md §Hard rules` references 4 hooks (R1/R2/R3/R4) but has no designer ceiling.

At dispatch time, the rule is absent from the two files PO actually reads (po-instructions.md + sections/delegation.md). Self-check fails because there is nothing to find.

---

## §2 Decisions

### Open questions — resolved here

| OQ | Resolution | Rationale |
|:--|:--|:--|
| Ceiling: 1 or 2? | **2** | 1 is safest but imposes ordering tax on truly co-dependent pairs (e.g. `system.md` + `flow.md` for same screen). 2 has clean history. 3 = observed hang. |
| Hook block vs warn? | **warn (non-blocking)** | TASK body keyword counting is heuristic — resume bodies are short, verbose instruction bodies may legitimately list many filenames without all being new artifacts. Block → constant friction + false positives. Warn → PO sees signal, decides. |
| ROADMAP / Activity Log in artifact count? | **No — excluded** | Both are PO-mechanical shell appends (< 5 lines), not designer authoring. Including them would inflate the count on every normal dispatch. Hook patterns must not trigger on `ROADMAP` or `Activity Log` keywords. |

### Sub-area decisions

#### A — Hard rule wording (verbatim)

Insertion target: `po-instructions.md §Hard rules` — append after the `Wiki writes` line.

```
- **Designer dispatch ceiling** — ≤2 designer-owned artifacts per `--agent pdt-designer` call.
  ROADMAP rows / Activity Log appends are PO-mechanical (excluded from count).
  Violation → cancel dispatch, re-split into ≤2-artifact calls before re-delegating.
```

One rule, three sentences: the ceiling, the exclusion, the enforcement action. No prose — matches existing Hard rules bullet style.

#### B — PreToolUse hook

- **Script**: `packages/core/scripts/hooks/pre-chunking-warn.sh`  
- **Trigger**: `claude --agent pdt-designer` (not `--resume` — resume TASK bodies are short summaries, false-positive risk high)  
- **Signal counting**: see §4  
- **Threshold**: signal count ≥ 3 → stderr warn, exit 0 (non-blocking)  
- **settings.json registration**: append to existing PreToolUse Bash `hooks[]` array (same matcher object as `pre-delegate-task-check.sh`)  

#### C — delegation.md insertion

`delegation.md` has **no existing chunking entries to remove**. Action = additive only: insert 1 reference callout at the top of `## PRD delegation` (line 98). No other edits.

---

## §3 Hard rule wording — po-instructions.md insertion diff

Current tail of `## Hard rules` section (line 78):

```
- Wiki writes need `[PROMOTION-APPROVED]` marker (`memory.md`).
```

**After** that line, insert:

```diff
+- **Designer dispatch ceiling** — ≤2 designer-owned artifacts per `--agent pdt-designer` call.
+  ROADMAP rows / Activity Log appends are PO-mechanical (excluded from count).
+  Violation → cancel dispatch, re-split into ≤2-artifact calls before re-delegating.
```

No surrounding text changes. The rule appears in §Hard rules where PO reads at the start of every step.

---

## §4 Hook script spec

### 4.1 Script: `pre-chunking-warn.sh`

```bash
#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Chunking ceiling guard for pdt-designer dispatches.
# Counts artifact-signal keywords in TASK body. ≥3 signals → stderr warn (non-blocking).
#
# Excluded from count: ROADMAP rows, Activity Log appends (PO-mechanical).
# Only fires on: claude --agent pdt-designer   (not --resume, not other personas)

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

# Only fire on fresh pdt-designer dispatch (not --resume — short body, high FP)
case "$COMMAND" in
  *"claude --agent pdt-designer"*) ;;
  *) exit 0 ;;
esac

# Extract TASK body — last non-flag positional arg in the command
TASK_BODY="$(printf '%s' "$COMMAND" | python3 -c "
import shlex, sys
try:
    parts = shlex.split(sys.stdin.read().strip())
    for part in reversed(parts):
        if not part.startswith('-'):
            print(part)
            break
except Exception:
    pass
" 2>/dev/null)"

[ -z "$TASK_BODY" ] && exit 0

# ── Artifact signal counting ──────────────────────────────────────────────────
# Each pattern = 1 point (presence only, not occurrence count).
# Pattern groups are mutually exclusive signals to avoid double-counting.
COUNT=0
signal() {
    printf '%s' "$TASK_BODY" | grep -qiE "$1" && COUNT=$((COUNT + 1))
}

# Design system doc
signal 'system\.md'
# UX flow diagram
signal 'flow\.md'
# Wireframe (Excalidraw)
signal '\.excalidraw'
# Hi-fi mockup (HTML)
signal '\.html'
# Screens directory or set
signal 'screens/'
# Plan doc (design plan)
signal 'plan\.md'
# Test plan
signal 'test-plan\.md'
# Decisions log entry
signal 'decisions\.md'
# Feature history log
signal 'feature-history\.md'
# Korean artifact count hint ≥3
signal '(산출물\s*[3-9]|[3-9]\s*산출물)'

# Exclusions: ROADMAP / Activity Log patterns intentionally absent from above list.
# Do NOT add: 'ROADMAP', 'Activity Log', 'ticket_id', 'status:' — PO-mechanical.

# ── Threshold check ───────────────────────────────────────────────────────────
if [ "$COUNT" -ge 3 ]; then
    printf '[productune] ⚠ chunking-warn: pdt-designer TASK signals ~%d artifact types (ceiling=2).\n' "$COUNT" >&2
    printf '  Consider splitting into ≤2 designer-owned artifacts per dispatch.\n' >&2
    printf '  ROADMAP/Activity rows are excluded (PO-mechanical). (non-blocking)\n' >&2
fi

exit 0
```

### 4.2 Regex rationale

| Pattern | What it detects | Excluded analogue |
|:--|:--|:--|
| `system\.md` | DS doc artifact | — |
| `flow\.md` | UX flow diagram | — |
| `\.excalidraw` | Wireframe JSON | — |
| `\.html` | Hi-fi mockup | — |
| `screens/` | Screen set directory | — |
| `plan\.md` | Design plan doc | — |
| `test-plan\.md` | Test plan artifact | — |
| `decisions\.md` | Decisions log | — |
| `feature-history\.md` | Feature history | — |
| `산출물 [3-9]` | Korean inline artifact count | `산출물 [12]` (≤2 is fine) |
| — | `ROADMAP` | **excluded** (PO-mechanical) |
| — | `Activity Log` | **excluded** (PO-mechanical) |
| — | `-- Activity` | **excluded** |

**Why binary presence not count**: A TASK body that says "update system.md and the screens/" once per reference already signals 2 artifacts — counting occurrences would penalize verbose task descriptions.

### 4.3 settings.json registration diff

Current PreToolUse Bash hooks array (lines 7–15 of `~/.claude/settings.json`):

```json
"PreToolUse": [
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "command",
        "command": "...hooks/pre-delegate-task-check.sh"
      }
    ]
  }
]
```

**After** (append inside existing `hooks[]` array — same matcher object):

```diff
 "hooks": [
   {
     "type": "command",
     "command": "...hooks/pre-delegate-task-check.sh"
   },
+  {
+    "type": "command",
+    "command": "/Users/x/Documents/dev/ntf-products/productune/packages/core/scripts/hooks/pre-chunking-warn.sh"
+  }
 ]
```

Full absolute path required (matches existing hook registration pattern). No new matcher object needed — two hooks under the same Bash matcher fire sequentially; `pre-delegate-task-check.sh` runs first (may block on R1/R2/R4/R5), `pre-chunking-warn.sh` runs second (warn only).

---

## §5 delegation.md diff sketch

**Location**: `~/.productune/sections/delegation.md`, line 98 — `## PRD delegation (Designer, clarity loop)` heading.

**Current** (line 98–100):
```markdown
## PRD delegation (Designer, clarity loop)

Stage 2A discovery done → delegate Round 1 PRD:
```

**After** (insert 1 callout between heading and body):
```diff
 ## PRD delegation (Designer, clarity loop)
 
+> **Dispatch ceiling**: ≤2 designer-owned artifacts per `--agent pdt-designer` call.
+> ROADMAP / Activity Log rows are PO-mechanical (excluded). See §Hard rules in po-instructions.md.
+
 Stage 2A discovery done → delegate Round 1 PRD:
```

**No other changes.** There are no existing chunking paragraphs to remove — the file never had any (confirmed by grep). The callout sits where PO's eye lands when constructing a PRD delegation, making the ceiling visible at authoring time.

**Why not a longer section?** Worktree isolation (`##Working tree isolation`) already shows how to handle a complex multi-step doctrine with a full section. Chunking is a one-rule ceiling, not a workflow — a callout is the right weight.

---

## §6 Open Questions

| # | Question | Status |
|:--|:--|:--|
| 1 | Should `--resume pdt-designer` also be guarded? | **Deferred.** Resume TASK bodies are short continuation notes — almost never list full artifact sets. False-positive risk outweighs benefit. Revisit if future pattern shows resume abuse. |
| 2 | Should other personas (pdt-developer, pdt-qa) get their own ceiling? | **Out of scope this ticket.** Developer TASK bodies describe code changes, not artifact files in the same naming pattern. Different signals needed. |
| 3 | Should the hook block (not warn) after N repeated violations? | **Deferred.** Requires state tracking (violation counter) and more complex hook. Warn-first is the right starting policy; escalate if warn is ignored in ≥2 subsequent tickets. |
| 4 | Can the hook read `[ctx]` JSON to get `artifacts[]` count from state? | **Future improvement.** The `[ctx]` inline JSON in TASK body already lists `artifacts:[]`. Parsing it would give a structured count vs heuristic keyword scan. Requires more robust `python3` extraction in the hook. Not in this ticket's scope. |

---

## §7 §1.5 self-check (UX principles)

This is a doctrine + tooling plan, not a user-facing screen. Mapping the five principles to the enforcement experience PO encounters:

| Principle | Application | Status |
|:--|:--|:--|
| **Few Things** | Plan resolves exactly 3 sub-areas (A/B/C). Hook adds 1 mechanism, po-instructions adds 1 line, delegation.md adds 2 lines. Minimal surface. | ✓ |
| **Familiar** | Hook follows identical structure to `pre-delegate-task-check.sh` (same EVENT_JSON parse, same `emit_block`/exit 0 pattern, same absolute path registration). New contributors recognize it immediately. | ✓ |
| **Predictability** | Ceiling is a fixed integer (2). Warning message states the count and the ceiling. PO always knows exactly what triggered it. | ✓ |
| **Feedback** | `stderr` warn is visible in Claude Code's tool output — PO sees `[productune] ⚠ chunking-warn:` before dispatching. Actionable: it says "consider splitting". | ✓ |
| **Escape** | Hook is **non-blocking** (exit 0). PO can override and proceed — the rule is advisory at tool-level, mandatory in doctrine. No hard trap. | ✓ |

No violations found.

---

## §8 Out of scope (this dispatch)

- **Ticket md emission** — separate dispatch per memory rule (≤2 artifacts/call; this dispatch = plan.md only).
- **ROADMAP touch** — no ROADMAP change needed; this is internal doctrine.
- **Activity Log** — PO mechanical append on close.
- **Actual file edits** (po-instructions.md, delegation.md, hook creation, settings.json) — implementation dispatch, separate turn, pdt-developer or PO-direct for doc edits.
- **Other persona ceiling rules** (pdt-developer, pdt-qa) — different signal vocabulary; out of scope.
- **Hook for `--resume` bodies** — deferred (OQ #1 above).

---

## Implementation sequence (for PO reference, next turn)

1. **Edit `~/.productune/po-instructions.md`** — append 3-line hard rule under §Hard rules. (PO-direct doc edit, or delegate to designer: 1 artifact = 1 dispatch.)
2. **Edit `~/.productune/sections/delegation.md`** — insert 2-line callout in §PRD delegation. (Same dispatch or next dispatch.)
3. **Create `packages/core/scripts/hooks/pre-chunking-warn.sh`** — per §4.1 script. (Developer dispatch: 1 file.)
4. **Edit `~/.claude/settings.json`** — append hook registration per §4.3. (Developer or PO-direct.)
5. **Smoke test** — PO dispatches `pdt-designer` with TASK body listing ≥3 artifact filenames; confirm `⚠ chunking-warn` appears in stderr.
