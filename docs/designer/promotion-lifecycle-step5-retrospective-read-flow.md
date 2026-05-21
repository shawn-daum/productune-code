# Design — Promotion Lifecycle Step 5 (Retrospective Read Flow)

## Context

Final step of the 5-step promotion-lifecycle bug fix. Steps 1–4 already landed:
- step 1: 13 persona specs require top-level JSON output (`promotion_candidates` surfaced consistently).
- step 2: `pending_promotions[]` schema in `memory.md` + `### Persistence (deferred surface)` sub-section.
- step 3: `stages.md` Step 1b — turn-start drain of `pending_promotions[]`.
- step 4: mechanical writes (no doctrine change — existing `### Mechanical writes` branch in `memory.md`).

Step 5 closes the loop on the read side. Today's retrospective sequence (5a/5b/5c/5d in `lifecycle-mechanics.md` + `stages.md` 2D) is silent on **what stored memory the retrospective reads from**. Without an explicit list, sub-call personas drift toward calling fresh persona turns to re-derive context — wasteful and divergent from "retrospective = read what was already saved".

User's diagnostic point #5: "retrospective should read stored memory, not invoke new persona turns. Make the read paths explicit in doctrine."

## Goals

1. Doctrine explicitly enumerates the 5 stored-memory read sources for retrospective sub-calls.
2. Retrospective template gets 3 new sections that mirror the 5 read sources (so each read source has a place to land).
3. Zero new persona invocations introduced — Phase 4 sequence keeps 4 sub-calls (5a/5b/5c/5d).
4. Compatible with T-P4-065 phase-rename (Phase 4 → Phase 5 Close); read-flow doctrine is phase-number agnostic.

## Non-goals

- No code changes (CLI, GUI, GraphQL, CI).
- No migration / backward-compat fallback (the `pending_promotions[]` jq fallback is a separate ticket).
- No change to step 4 mechanical-writes branch.
- No bundled impl ticket — that's the next ad-hoc patch call.

## Approach

Single-file doctrine update: `packages/core/po/sections/lifecycle-mechanics.md`.

### Edit 1 — Add read-flow step in Phase 4 retrospective sequence

Between the existing `## retrospective.md template` block and the `## Phase 4 retrospective sequence` table, insert a new sub-section `### Retrospective read sources (no new persona calls)` that enumerates the 5 read targets. Then add a new column or note in the existing 5a/5b/5c row mapping each step to which read sources it consults.

The 5 read sources, named verbatim for grep-discoverability:

1. **Project notes** — `docs/{designer,developer,qa}/project-notes.md` and `docs/<persona>/decisions.md`. Approved promotions from Step 1b mechanical writes land here. Read by 5a (designer) + 5b (qa).
2. **`po-state.json` `recent_turns[]`** — rolling 10 project-wide turn outcomes. Read by 5a + 5b for failure-pattern surfacing.
3. **Wiki / Graphiti persona lessons** — `search_memory_facts` (graphiti backend) or `~/.productune/wiki/<persona>/INDEX.md` (keeper / fs backend). Cross-project style lessons. Read by 5a + 5b.
4. **`~/.productune/po-memory.md` calibration + product taste** — `## Model/Effort Calibration` + `## Product taste` + `## Recent corrections / to-avoid`. Read by 5c (designer narrative) for tone + repeated-pushback tracking.
5. **Approved-promotion archive (this Version)** — `pending_promotions[]` entries with `status ∈ {approved, edited}` whose `decided_at` ∈ `[versions[N].started_at, versions[N].ended_at]`. Read by 5c for "what got promoted to doctrine this Version" section.

Source #5 is the new one — sources #1–#4 already exist as data but were never enumerated as the retrospective's read surface.

### Edit 2 — Extend retrospective.md template

Append three sections to the markdown template inside the `## retrospective.md template` fence:

```markdown
## Approved doctrine promotions (this Version)
- (<decided_at>) <persona> · <tier> · <target>: <delta excerpt>

## Repeated patterns
- recent_turns[] hits: <area-tag> ×N
- fail-patterns.md cross-Version: <area-tag> ×N (cumulative)
- po-memory pushbacks: "<verbatim phrase>" ×N

## Surfaced for next Version
- deferred / dropped: <pending_promotions[] items still pending or dropped this Version>
- next-Version Phase 1 disposition input: <list>
```

These three sections map 1:1 to read sources #5, #2 + project-notes, and the dropped/deferred subset of `pending_promotions[]`. The existing `## Outcome` / `## What worked` / `## What didn't` / `## Carry to next Version` sections stay unchanged.

### Edit 3 — Annotate sequence table

Replace the 4-column table with a 5-column one adding a `Reads` column:

| Step | Persona | Model/Effort | Output | Reads |
|---|---|---|---|---|
| 5a | `pdt-designer` | opus + xhigh | feature-history.md append; backlog | sources #1, #2, #3 |
| 5b | `pdt-qa` | opus + xhigh | fail-patterns aggregate; test candidates | sources #1, #2, #3 |
| 5c | `pdt-designer` | sonnet + medium | retrospective.md narrative | 5a + 5b output ctx + sources #4, #5 |
| 5d | PO | mechanical | calibration log; mirror retrospective_path; surface | none (writes only) |

Explicit "Reads" column makes the no-new-persona-call rule mechanical: each persona's TASK body lists the read paths to consult; persona refuses to spawn fresh sub-calls outside that list.

## API / Doctrine spec

File touched: `packages/core/po/sections/lifecycle-mechanics.md` only.

Insertion order inside file (line numbers from current state, will shift):
1. After current line 67 (end of `retrospective.md template` fence) → append the 3 new template sections inside the same fence.
2. After current line 69 (`## Phase 4 retrospective sequence (PO orchestrates)` heading) and before line 71 (`Per-step detail lives in...`) → insert new `### Retrospective read sources (no new persona calls)` sub-section enumerating sources #1–#5.
3. Replace the 4-column table at lines 73–78 with the 5-column variant above.

No edit to `stages.md` — its 2D section already references `lifecycle-mechanics.md` for full detail; the Reads column is detail, not orchestration trace.

No edit to `memory.md` — schema already has `pending_promotions[]` with `status` + `decided_at` + `surfaced_at`, sufficient for source #5 query (`status ∈ {approved, edited}` ∧ `decided_at ∈ Version range`).

## Vocabulary check (T-P4-057 linter)

- "retrospective" — already in use, no flag.
- "read source" / "read flow" — neutral, no banned tokens.
- "Approved doctrine promotions" — descriptive heading, not a slogan.
- No emojis. No "epic / sprint / task" misuse — uses "Version" / "ticket" per glossary.

## Length impact

- `lifecycle-mechanics.md` grows by ~25 lines (read-sources sub-section + 3 template sections + extra table column). File goes from 79 lines → ~104 lines. Within section budget.
- `stages.md` unchanged — Step 1b already added in step 3 of this fix path.
- `memory.md` unchanged.

## Compatibility with T-P4-065 (Phase rename)

T-P4-065 renames "Phase 4 close" to "Phase 5 Close" inside the 5-stage doctrine. Read-flow doctrine references the **sequence label `5a/5b/5c/5d`**, not the phase number. When T-P4-065 sub-a lands and rewrites the section heading from `## Phase 4 retrospective sequence` to `## Phase 5 retrospective sequence`, the read-sources sub-section + table column survive verbatim. No merge conflict expected.

## Alternatives considered

- **A. Add read-flow into each persona spec (`pdt-designer.md`, `pdt-qa.md`)** instead of central doctrine. Rejected — duplicates list across 2 files; risks drift; PO orchestrates so PO's doctrine should list it.
- **B. New file `retrospective-mechanics.md`**. Rejected — scope tiny; lifecycle-mechanics.md is the natural home; new file inflates section count.
- **C. Skip Edit 3 (sequence table)** and let read flow live only in prose. Rejected — table is the persona's at-a-glance reference; prose-only invites drift back toward "spawn new call to re-derive".

## Implementation notes (for next ad-hoc patch call)

The bundled impl ticket should:
- Apply edits 1–3 to `packages/core/po/sections/lifecycle-mechanics.md`.
- No code changes.
- Verification: `grep -n "Reads" packages/core/po/sections/lifecycle-mechanics.md` returns the new column header; `grep -n "Approved doctrine promotions" packages/core/po/sections/lifecycle-mechanics.md` returns the template section.
- Smoke gate skipped (`stage:design` self-verifies per `lifecycle-mechanics.md` line 15).

## Open questions

None blocking. Phase-rename timing (T-P4-065 sub-a) is independent — this doctrine survives either ordering.
