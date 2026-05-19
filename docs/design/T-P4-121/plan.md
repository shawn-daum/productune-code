---
ticket_id: T-P4-121
title: "PO mechanical wiki write — doctrine fix"
type: doctrine
status: planned
assignee: pdt-designer
estimated_complexity: L3
model: opus
effort: high
created_at: 2026-05-18
---

# Plan — T-P4-121 PO mechanical wiki write doctrine

> Plan only. Implementation = separate turn (T-P4-120 pattern). 5 doctrine files +
> 1 repo mirror sync. No GUI / no scripts. Mechanical edits only.

## §1 Context

### Trigger

T-P4-120 dogfood (2026-05-15 → 2026-05-18). Approved wiki episode
`knowledge-state-anchored-alternatives` for `persona-designer` namespace failed
to land via the `pdt-designer` subagent path on 6 sequential dispatches. Working
path only emerged after PO bypassed the subagent and called `claude --print` (no
`--agent`) directly.

### 4-layer root cause

| Layer | Failure | Evidence |
|:--|:--|:--|
| 1 | `~/.productune/productune.env` had no `GRAPHITI_LLM_PROVIDER` | `graphiti-launcher.sh` exited at first OPENAI_API_KEY check |
| 2 | `claude mcp add` never registered the graphiti server with claude code | `claude mcp list` returned empty even after env restore |
| 3 | hyphen mismatch between agent whitelist (`mcp__graphiti__add_memory`) and actual MCP tool name in claude code 2.1.142 | tool listed in `tools:` frontmatter, runtime says "No such tool available" |
| 4 | `claude --agent <persona>` subprocess **does not inherit project-local MCP server registrations** from parent session | even after fixing layers 1–3 for the parent shell, subagent dispatch still fails |

Layers 3 + 4 are **structural to claude code 2.1.142**, not bugs in productune
doctrine. PO subprocess path is the only currently-functional invocation.

### User push-back (2026-05-18, verbatim)

> "PO는 오케스트레이션 only지만.. promotion 반영도 orchestration이야.."

→ Wiki write *is* orchestration. PO must be the mechanical executor; doctrine
must reflect this.

### What this plan establishes

PO becomes the **mechanical executor** of wiki episode writes via
`claude --print` (no `--agent`) subprocess. Persona-side `mcp__graphiti__add_memory`
call possibility is **removed** from doctrine — personas only emit
`promotion_candidates`. The `[PROMOTION-APPROVED]` gate semantic stays
(user-approval required), but its target switches from "persona resume" to "PO
subprocess invocation".

## §2 Decision recap (alternatives considered — for audit only, not user-surface)

User already decided based on dogfood evidence; this section records why the
other paths are doctrine-dead, not a fresh surface.

- **A (chosen). PO subprocess invocation** — `claude --print` (no `--agent`)
  inheriting project-local MCP servers from the PO shell environment.
  - `[Architecture trade-offs · very strong]` consistent with PO mechanical-write
    pattern already used for `pending_promotions` / ticket frontmatter / state
    json. Single executor; no subagent inheritance surface.
  - `[Architecture trade-offs]` zero new infrastructure — reuses existing
    `claude` binary + graphiti MCP already configured for PO shell.
- **B. Patch subagent MCP inheritance** — rejected. Requires upstream claude
  code changes (`claude --agent` inherits parent MCP registry). Not under
  productune control; doctrine cannot mandate upstream behavior.
- **C. Direct HTTP to graphiti server** — rejected. Bypasses claude binary →
  loses LLM-extracted entity/relationship enrichment that's the whole point of
  graphiti (per its MCP server instructions). Would require productune to
  embed its own LLM client.

Recommendation: **A**, already enacted via dogfood. Doctrine catches up — see
`[Architecture trade-offs · very strong]` user fluency with doctrine-consistency
arguments.

## §3 Diff spec

### §3.a `~/.productune/po-instructions.md`

**Location**: `## CAN (mechanical only) — docs/tickets/<version>/T-NNN.md` section
(lines 13–19). This section currently scopes PO mechanical writes to ticket md
only. The wiki episode write is a **sibling category**, not a 5th item in the
same list (different domain — wiki, not ticket md). Insert as a new sub-section
immediately after the `Tools:` line of CAN.

**Before**:
```markdown
## CAN (mechanical only) — `docs/tickets/<version>/T-NNN.md`

- frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `version` (stamp `poState.current_version` if absent at emit — T-P4-086), routing/model/effort meta
- mirrored header status line
- `## Persona Activity` table — append-only 1 row per delegation (≤80 char Result)
- Tools: `sed -n`, `awk`, `perl`, `printf >>`

## NEVER
```

**After**:
```markdown
## CAN (mechanical only) — `docs/tickets/<version>/T-NNN.md`

- frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `version` (stamp `poState.current_version` if absent at emit — T-P4-086), routing/model/effort meta
- mirrored header status line
- `## Persona Activity` table — append-only 1 row per delegation (≤80 char Result)
- Tools: `sed -n`, `awk`, `perl`, `printf >>`

## CAN (mechanical only) — wiki episode write (T-P4-121)

PO is the **mechanical executor** of approved wiki episodes. Personas emit
`promotion_candidates`; PO writes via `claude --print` (no `--agent`) subprocess.
Subagent path (`claude --agent pdt-<x>`) is **non-functional in claude code
2.1.142** for MCP-bearing personas due to project-local MCP server
non-inheritance + agent whitelist tool-name resolution issues.

Preconditions:
- User-emitted `[PROMOTION-APPROVED]` marker on the surfacing turn.
- Verbatim persona-emitted `episode_body` (from `promotion_candidates[]` entry —
  PO never authors body content).
- Parent PO shell has graphiti MCP registered (`claude mcp list` confirms
  `graphiti` present).

Invocation template — see `sections/lifecycle-mechanics.md` §"PO mechanical
wiki write".

## NEVER
```

**Hard rules change** (line 78 area):

**Before**:
```markdown
- Wiki writes need `[PROMOTION-APPROVED]` marker (`memory.md`).
```

**After**:
```markdown
- Wiki writes — PO mechanical via `claude --print` (no `--agent`) subprocess
  on `[PROMOTION-APPROVED]` marker (`sections/lifecycle-mechanics.md` §"PO
  mechanical wiki write"). Persona subagent dispatch path retired
  (T-P4-121).
```

### §3.b `~/.productune/sections/delegation.md`

There is no current "promotion lifecycle" sub-section to update directly — the
delegation file currently covers ticket dispatch, `[ctx]` template, Plan mode,
chunking. Insert a new sub-section after the existing "Plan mode (L4+ default)"
block, before "Chunking".

**Insert (new sub-section)**:
```markdown
## Promotion lifecycle (T-P4-121)

Persona returns `promotion_candidates` (top-level JSON array — see persona
output rule). PO surfaces inline per `sections/memory.md` §"Promotion gate";
on user `y` / `edit`:

| tier | Mechanical write path |
|:--|:--|
| `project` | `printf '%s\n' "$DELTA" >> "$TARGET"` (PO shell) |
| `work-note` | `printf` to `docs/<persona>/R<n>-<slug>.md` (full markdown body) |
| `wiki` | `claude --print` (no `--agent`) subprocess — see `lifecycle-mechanics.md` §"PO mechanical wiki write" |

**Subagent dispatch path retired** (T-P4-121). Prior doctrine had personas
self-write wiki via `mcp__graphiti__add_memory` after receiving
`[PROMOTION-APPROVED]`-prefixed resume. Layer 4 root cause (subagent MCP
non-inheritance in claude code 2.1.142) makes this path non-functional. PO
subprocess is the only currently-supported path. Persona-side
`mcp__graphiti__add_memory` call possibility is removed from agent doctrine —
see §3.d.
```

### §3.c `~/.productune/sections/lifecycle-mechanics.md`

**Location**: New sub-section after "Phase transition mechanical write" (line
12) and before "Auto QA smoke gate" (line 14). Hosts the bash invocation
template — the most operationally-detailed spec in this whole plan.

**Insert (new sub-section)**:
~~~markdown
## PO mechanical wiki write (T-P4-121)

PO is the sole mechanical executor of approved wiki episodes. Subagent path
retired — see `po-instructions.md` `## CAN (mechanical only) — wiki episode
write` for rationale.

### Preconditions (PO self-check before invocation)

1. User emitted `[PROMOTION-APPROVED]` marker on the surfacing turn (semantic
   intent class: explicit approval of a surfaced wiki promotion candidate).
2. `promotion_candidates[]` entry from persona output with `tier:"wiki"` —
   PO uses `target` (group_id), `episode_name` (name), `episode_body` verbatim.
3. Parent PO shell has graphiti MCP registered. Quick check:
   `claude mcp list | grep -q '^graphiti' || echo "MISSING — run claude mcp add graphiti ..."`.

### Invocation template

```bash
# Inputs (from approved promotion_candidates[] entry):
GROUP_ID="persona-designer"                       # from .target
EPISODE_NAME="knowledge-state-anchored-alternatives"
EPISODE_BODY="When reporting N≥2 alternatives ..."  # verbatim from .episode_body
SRC_DESC="T-P4-NNN doctrine adoption"             # PO auto-generates: "<ticket-id> <slug-context>"

TASK="[PROMOTION-APPROVED] mcp__graphiti__add_memory call:
group_id=\"$GROUP_ID\"
name=\"$EPISODE_NAME\"
episode_body=\"$EPISODE_BODY\"
source=\"text\"
source_description=\"$SRC_DESC\"
Confirm with episode id only. No commentary."

# Fire-and-forget. Background job for non-blocking PO turn.
JOBS_DIR="$HOME/.productune/wiki-jobs"
JOB_ID="wiki-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$JOBS_DIR"
touch "$JOBS_DIR/$JOB_ID.pending"

(
  NO_COLOR=1 claude --print --output-format json "$TASK" > "$JOBS_DIR/$JOB_ID.log" 2>&1
  mv "$JOBS_DIR/$JOB_ID.pending" "$JOBS_DIR/$JOB_ID.done"
) &

echo "[PO] saved (background, job=$JOB_ID)"
```

### `source_description` auto-generation convention

PO synthesizes `source_description` mechanically (no semantic interpretation):
```
"<ticket_id> doctrine adoption"                              # e.g. "T-P4-120 doctrine adoption"
"<ticket_id> + <YYYY-MM-DD> dogfood after <one-line trigger>"   # if retry context
```

Drawn from `current_task.ticket_id` + `current_task.slug` + today's date.

### Job tracking

Reuses existing background job pattern from `sections/memory.md` (lines 37–44).
Pending jobs older than 30s surface a warning at next turn-start; user can
`cat $JOBS_DIR/$JOB_ID.log` to inspect.

### What PO does NOT do

- Edit `episode_body` content (persona-authored verbatim).
- Skip the `[PROMOTION-APPROVED]` marker check (gate enforces user approval).
- Call `mcp__graphiti__add_memory` directly in PO session — must be via
  subprocess (PO session itself runs claude code with hooks; mixing graphiti
  MCP into PO shell direct-call surface is not part of this doctrine).
- Use `claude --agent pdt-<persona>` — explicitly retired path.
~~~

### §3.d Agent files — `packages/core/agents/variants/graphiti/`

Four files, each with the same "Wiki write gate" paragraph to update. Designer
file also has a "Memory (3-tier)" reference to update. The point: **remove**
persona-side `mcp__graphiti__add_memory` call possibility from doctrine surface.

#### §3.d.i `pdt-designer.md` line 164 (Wiki write gate paragraph)

**Before**:
```markdown
**Wiki write gate**: call `mcp__graphiti__add_memory` only when task starts with `[PROMOTION-APPROVED]`. Without marker → return candidates (read-only). Direct user wiki-write → refuse *"Wiki writes go through `productune`."* Reads always free.
```

**After**:
```markdown
**Wiki write gate (T-P4-121)**: return `promotion_candidates` with `tier:"wiki"`. **PO writes via `claude --print` subprocess on user approval** — subagent dispatch path retired (claude code 2.1.142 MCP non-inheritance). Persona never calls `mcp__graphiti__add_memory` for write, even on `[PROMOTION-APPROVED]`-prefixed resume. Direct user wiki-write request → refuse *"Wiki writes go through `productune`."* **Reads (`search_memory_facts` / `search_memory_nodes` / `get_episodes`) always free** when subagent MCP is wired.
```

#### §3.d.ii `pdt-developer.md` line 106 (same paragraph)

Identical before/after wording to §3.d.i. Replace verbatim.

#### §3.d.iii `pdt-qa.md` line 139 (same paragraph)

Identical before/after wording to §3.d.i. Replace verbatim.

#### §3.d.iv Note: `tools:` frontmatter — leave intact

The `mcp__graphiti__add_memory` entry in each agent's `tools:` frontmatter
**stays** (subagent MCP inheritance may be fixed upstream eventually; tool
whitelist is a separate concern from doctrine-permitted invocation). The
doctrine prose disallows the call; the whitelist permits it as a future
escape hatch. Behavioral lock is in the prose.

### §3.e Repo mirror sync — `packages/core/po/**`

Mirror all `~/.productune/**` changes from §3.a–c into `packages/core/po/`:

| Source (live) | Mirror (repo) |
|:--|:--|
| `~/.productune/po-instructions.md` | `packages/core/po/po-instructions.md` |
| `~/.productune/sections/delegation.md` | `packages/core/po/sections/delegation.md` |
| `~/.productune/sections/lifecycle-mechanics.md` | `packages/core/po/sections/lifecycle-mechanics.md` |

Verify with `diff -r ~/.productune/po-instructions.md packages/core/po/po-instructions.md` (etc.) returns empty after edits.

Agent file mirrors (`packages/core/agents/variants/graphiti/*.md`) are already
the source-of-truth — they are not mirrored from `~/.claude/` and edits land
directly in repo. No sync needed beyond editing them in place per §3.d.

### §3.f `~/.productune/po-memory.md` — verification only

The `## User knowledge state (engineering)` section was already appended this
turn-cycle (2026-05-15 baseline 6 axis lines + 2026-05-18 user push-back
correction line). Verify schema:

- Each line matches: `- (YYYY-MM-DD [baseline|inferred|user-asserted]) <axis>: <level> — <nuance>`
- Level enum used: `fluent` > `solid` > `comfortable` > `concept-level fluent` > `partial` > `gap/unclear`
- 2026-05-18 push-back correction line (if any was appended) cites the verbatim user phrase

No edits needed if verification passes. If schema drift → 1-line correction
during implementation turn.

## §4 Migration sequence

Implementation turn (separate from this plan turn) executes in this order:

1. **Pre-check** — `claude mcp list | grep -q '^graphiti'` from PO shell. If missing → flag as blocker; doctrine assumes registered.
2. **Edit `~/.productune/po-instructions.md`** per §3.a (add new CAN sub-section + Hard rule rewrite). Confirm via `grep -n 'CAN (mechanical only) — wiki' ~/.productune/po-instructions.md`.
3. **Edit `~/.productune/sections/lifecycle-mechanics.md`** per §3.c (new sub-section with invocation template). This is the longest edit — highest care on heredoc preservation.
4. **Edit `~/.productune/sections/delegation.md`** per §3.b (new promotion lifecycle sub-section).
5. **Edit 3 agent files** per §3.d.i–iii (find/replace one paragraph each).
6. **Mirror sync** per §3.e — `cp` from `~/.productune/` to `packages/core/po/`; verify `diff -r` empty.
7. **Verification** per §3.f — `grep` for User knowledge state schema lines.
8. **Self-verify the doctrine** — re-read each touched file end-to-end; confirm no orphan reference to "designer dispatch with PROMOTION-APPROVED" or "claude --resume ... [PROMOTION-APPROVED]" in retired-path form. Note: `sections/memory.md` lines 33–34 may also need update — see Open Questions.
9. **Update ticket §Outcome** — list 5 file changes + self-verify pass + follow-ups.

## §5 Validation scenarios

| ID | Scenario | Expected |
|:--|:--|:--|
| V1 | PO reads `po-instructions.md` at Step 1.1 next turn | New CAN sub-section + Hard rule visible |
| V2 | Persona emits `promotion_candidates` with `tier:"wiki"` | PO surfaces inline, awaits `y` |
| V3 | User responds `y` to wiki promotion | PO runs subprocess template per §3.c, echoes `[PO] saved (background, job=<id>)` |
| V4 | Background job completes | `.pending` renamed to `.done`, log file contains episode id (if MCP returns) |
| V5 | Persona dispatched with `[PROMOTION-APPROVED]`-prefixed resume (legacy) | Persona returns `{refused:true, reason:"wiki write path retired — PO subprocess only"}` |
| V6 | `claude mcp list` shows graphiti missing | PO precondition check fails, surfaces "MISSING — run claude mcp add ..." to user |

V5 = behavioral lock from §3.d. V6 = precondition lock from §3.c.

## §Out of scope

- `install.sh` automation of `claude mcp add graphiti ...` (separate ticket — Open Question (i)).
- GUI onboarding parity for the MCP-registration precondition (separate ticket — Open Question (ii)).
- Background job UI surface in GUI (existing pattern in `sections/memory.md` lines 37–44 sufficient).
- Synchronous wait-for-completion mode (deliberately fire-and-forget per existing graphiti tier pattern).
- Updating `sections/memory.md` lines 33–34 directly — see Open Question (iii).

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — (doctrine-only edits; no user-facing code change) |
| **사용자 dogfood** | Next wiki promotion approval turn — PO runs §3.c subprocess template; user verifies `[PO] saved (background, job=<id>)` echo + `.done` job file appears |
| **regression check** | `sections/memory.md` lines 33–34 (graphiti tier write) — possible orphan reference if not updated, see Open Question (iii) |

Rationale: pure doctrine update, zero user-facing code. T-P4-107 doctrine
maps this to `skip`. Real verification = next wiki promo dogfood (T-P4-120
pattern proved this loop works).

## §Open Questions

(i) **`install.sh` automation of `claude mcp add graphiti ...`** — current
flow assumes user already ran the registration command. Should `install.sh` /
`productune init` add a `claude mcp add` step? Out of this ticket's scope but
ranks as the most-likely-to-bite-new-users gap. Promote to separate ticket
candidate.

(ii) **GUI onboarding parity** — productune GUI doesn't surface MCP
registration status. Future ticket for an onboarding card "graphiti MCP not
configured — click to set up". Out of scope here.

(iii) **`sections/memory.md` lines 33–34** — currently describe the retired
`claude --resume "$SID"` graphiti path. Should this ticket also update those
lines, or is `lifecycle-mechanics.md` §"PO mechanical wiki write" the new SoT
+ `memory.md` cross-references it? Recommend: update `memory.md` lines 33–34
to cross-reference `lifecycle-mechanics.md` (the SoT) rather than duplicate
template. Surface to PO at implementation turn.

(iv) **Subprocess `claude --print` invocation overhead** — fire-and-forget
costs one full claude session boot per wiki write. Acceptable for the
expected rate (1–5 wiki writes per Version close), but worth noting. Future
optimization (batched writes in one subprocess) is out of scope.

## §Promotion candidates (preview — emitted with implementation turn)

The implementation turn (Designer or PO) should consider emitting:

- **project** → `docs/designer/decisions.md`:
  `(2026-05-18) wiki-write-doctrine: PO mechanical subprocess chosen over subagent dispatch — claude code 2.1.142 MCP non-inheritance makes subagent path doctrine-dead`
- **work-note** → `docs/designer/R<n>-po-mechanical-wiki-write.md`:
  Full 4-layer root cause analysis (§1 above) as future reference for any
  similar MCP-tool-availability debugging.

No wiki tier emission this turn — the doctrine itself becomes the SoT;
re-promoting it as a wiki episode would be circular.
