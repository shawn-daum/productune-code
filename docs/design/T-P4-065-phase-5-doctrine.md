# T-P4-065 sub-area a — Phase 1~5 doctrine adoption plan

**Ticket**: T-P4-065 (sub-area a only — doctrine + schema + GUI type plan)
**Author**: pdt-designer
**Date**: 2026-05-07
**Status**: plan (no code change in this turn — impl follows in dev tickets)
**Scope**: doctrine + schema + GUI type spec for 4-Phase → 5-Phase migration. **Excludes** sub-areas b/c/d/e (StageStrip, persona selector, ticket stage→type rename, PRD text fix-ups) — separate calls.

---

## §1 Decision

**Option A adopted.** Doctrine Phase enum expands from 4 to **5**:

```
Phase 1 PRD     → Phase 2 Design → Phase 3 Build → Phase 4 Deploy → Phase 5 Close
```

User-visible vocabulary equals doctrine vocabulary. The two-axis split that previously separated "user-visible 6-stage strip (PRD/Design/Build/QA/Deploy/Operate)" from "doctrine 4-Phase enum (PRD/Design/Build/Close)" collapses into a **single 5-step axis**.

### Why A over B (4-Phase + hybrid Deploy step)

- **B** kept doctrine at 4 phases (Close absorbed Deploy as a sub-step). Pros: smaller migration. Cons: persistent vocabulary mismatch — `current_phase=4` would still mean "Close" in state but user UI would render two distinct steps "Deploy" and "Close" on top of it. Bookkeeping cost (sub-step enum + GUI mapping table) recurs every time the strip is touched.
- **A** removes the mapping layer entirely. `current_phase` in state matches the strip dot, the breadcrumb, the ticket frontmatter, and the doctrine prose. One source of truth.
- User's 2026-05-08 directive locked the 5-step strip; A is the only option that lets doctrine match it 1:1.

### New Phase enum semantics

| # | Name    | Trigger entering                                                                 | Exit condition                                          |
|---|---------|----------------------------------------------------------------------------------|---------------------------------------------------------|
| 1 | PRD     | new task disposition (c) / Designer clarity loop start                           | PRD `state:"ready"` (A ≤ 0.05) + user gate              |
| 2 | Design  | PRD ready + (L≥4 ∨ user-facing ∨ risk_flags). Skipped for L1–L3 trivial          | 4 design artifacts approved by user (Phase 2 gate)      |
| 3 | Build   | Phase 2 gate passed (or skipped)                                                 | all `impl`+`refactor`+`test`+`qa` tickets `done`        |
| 4 | Deploy  | Build done + user confirms deploy intent                                         | `stage:deploy` ticket `done` (per-step verify, no smoke)|
| 5 | Close   | Deploy done                                                                      | retrospective written (5a–5d sequence) + calibration    |

**Phase 4 (Deploy) responsibilities**: existing `stage:deploy` work that today executes inside Phase 3 Build moves into its own Phase. The `pdt-po+user` collaborative `## Steps` body (per `pdt-po.md`) is unchanged — only the framing Phase number shifts from 3 to 4.

**Phase 5 (Close) responsibilities**: the current Phase 4 retrospective sequence (5a Designer measurement → 5b QA fail-pattern → 5c Designer narrative → 5d PO mechanical) renumbers verbatim under Phase 5. Step labels stay `5a/5b/5c/5d` (already match the new Phase number — accidental alignment).

---

## §2 Doctrine impact (grep-confirmed)

Files that contain Phase enum vocabulary or Phase-numbered references. All under `packages/core/po/`. Each entry annotates the change shape.

### Hard renames (Phase number 4 → 5 for retrospective)

- **`packages/core/po/po-instructions.md`**
  - line 52 — pointer `lifecycle-mechanics.md (… + Phase 4 retrospective sequence + retro template)` → `Phase 5 retrospective sequence`.
  - line 52 — pointer `git-workflow.md (Phase 4 R2 worktree)` → **see §6 Open Question**: this references doctrine that does not exist in the repo today (`git-workflow.md` is missing). Decide separately whether to drop the reference or create the file. For sub-area a we mark the reference for a follow-up audit.

- **`packages/core/po/sections/stages.md`**
  - line 53 (Section 2A) — `**Phase 4 R2 git-workflow** — patch tickets auto-spawn worktree …` → `**Phase 4/5 R2 git-workflow**` or simply drop "Phase N" framing and reference the worktree convention by name (recommended — decouple from Phase numbering so future renumbers don't ripple).
  - lines 55–117 — Section heading **2B. Phase 1 PRD** stays. **2B'. Phase 2 Design** stays. **2C. Routing tickets** stays (Phase 3 prose). **2D. Phase 4 — Version close retrospective** → renamed to **2D. Phase 5 — Version close retrospective** AND a new sub-section **2C'. Phase 4 — Deploy** is inserted between 2C and the renamed 2D, describing: trigger (Build done + user confirm), the single `stage:deploy` ticket execution, exit condition.
  - line 91 — `**Trigger**: all Phase 3 tickets … 'enter Phase 4 Version close?'` → `… 'enter Phase 5 Version close?'`. Note: trigger wording must change because Build no longer contains `stage:deploy` (Deploy is its own Phase). New trigger for Phase 5 = Phase 4 Deploy ticket `done`.
  - line 107 — `### Uniform phase-transition gate (every Phase 1↔2↔3↔4 boundary)` → `(every Phase 1↔2↔3↔4↔5 boundary)`.
  - lines 111, 113 — `pending_gate` schema doc strings keep enum range comment up to date (`from_phase: 1..5`, `to_phase: 2..5`).

- **`packages/core/po/sections/lifecycle-mechanics.md`**
  - line 27 — `Version close → mechanical status / backfill sweep` prose stays; no Phase number.
  - line 41 — `**Lazy measurement protocol** … When validation_method requires external data … Phase 4 leaves observed_result: null. Designer asks user during the next Version's Phase 2 PRD authoring` → first occurrence "Phase 4" → "Phase 5"; second occurrence "Phase 2 PRD authoring" → **"Phase 1 PRD authoring"** (this is also a pre-existing typo independent of this migration — flag for sub-area e PRD text fix-ups, but correct it here in lifecycle-mechanics since we're already touching the file). Actually: keep scope tight — only do the `4 → 5` rename in this sub-area; mark the `Phase 2 PRD` typo as a separate finding for sub-area e.
  - line 69 — `## Phase 4 retrospective sequence (PO orchestrates)` → `## Phase 5 retrospective sequence (PO orchestrates)`.
  - line 78 — table cell `5d | PO | mechanical | append calibration log; mirror retrospective_path; surface to user with next-V candidates` — step labels (5a/5b/5c/5d) keep their letters; Phase header renames only.

- **`packages/core/po/sections/tickets.md`**
  - line 9 — `stage:deploy body shape (`[PO]/[user]` steps) + Phase 4 step 5d → ~/.claude/agents/pdt-po.md` → `Phase 5 step 5d`.
  - line 10 — `Phase 4 step 5a / 5c (Designer measurement + retrospective narrative) → ~/.claude/agents/pdt-designer.md` → `Phase 5 step 5a / 5c`.
  - line 11 — `Phase 4 step 5b (QA fail-pattern aggregate) → ~/.claude/agents/pdt-qa.md` → `Phase 5 step 5b`.
  - line 12 — `(smoke gate, close rules, outcome measurement, lazy measurement, retro template, Phase 4 sequence)` → `Phase 5 sequence`.
  - lines 30–48 — **Layer A diagram block needs the most surgery**:
    ```
    Phase 1 PRD          Designer clarity loop A ≤ 0.05
    Phase 2 Design       Designer self-execute, 4 artifacts
    Phase 3 Build        ticket execution
                         · stage:impl
                         · stage:refactor
                         · stage:test
                         · stage:qa
                         · stage:deploy        ← REMOVE from Phase 3
    Phase 4 Version close retrospective + calibration
    ```
    becomes:
    ```
    Phase 1 PRD          Designer clarity loop A ≤ 0.05
    Phase 2 Design       Designer self-execute, 4 artifacts
    Phase 3 Build        ticket execution
                         · stage:impl
                         · stage:refactor
                         · stage:test
                         · stage:qa
    Phase 4 Deploy       stage:deploy ticket execution     [stage:deploy]
                         (pdt-po+user collaborative; per-step verify)
    Phase 5 Version close retrospective + calibration       [no ticket]
    ```
  - line 50 — `**MVP cycle (V1)**: PRD → Design → Build → Version close → next Version on usage data` → `PRD → Design → Build → Deploy → Version close → next Version`.
  - line 63 — Layer B table row for `deploy`: `When` column changes from `Phase 3 (required, last)` → `Phase 4 (required, sole stage)`.

- **`packages/core/po/sections/memory.md`**
  - line 102 — schema bullet `current_version, current_phase, phase_history[].{phase, started_at, completed_at, summary, user_approved_at}` — add comment `# phase ∈ 1..5` or update neighbouring text. Existing text is enum-agnostic so no rename strictly required, but adding the range comment is a good defensive hint for future contributors.
  - lines 135–138 — Persona product-memory references `Designer at Phase 4 Version close` (in the table). Second column rows: `docs/qa/fail-patterns.md … Designer at Phase 1` (stays — Phase 1 = PRD), `docs/designer/feature-history.md | Designer Write at Phase 4 Version close | Designer at Phase 1 (next Version)` → `Designer Write at Phase 5 Version close`.

- **`packages/core/po/sections/prd-and-output.md`**
  - line 5 — `mandatory Step 1 deliverable for every new task` — Step refers to PO three-stage doctrine, not Phase enum; **no change**.
  - No other Phase-number references found. PRD authoring lives in Phase 1 throughout. Confirmed safe.

- **`packages/core/po/sections/calibration.md`**
  - No "Phase 4" / "Phase 5" prose found. Calibration is task-close-driven, not Phase-driven. **No change**.

- **`packages/core/po/sections/evolution.md`** (not read in this plan — scope budget)
  - Grep target: any string `Phase 4`, `Phase 1↔2↔3↔4`, `Phase N` framing. Likely none (evolution is persona-fail-driven). Mark as audit step in §5 migration sequence.

- **`packages/core/po/sections/git-workflow.md`**
  - **File does not exist** (read attempt returned ENOENT). Pointer in `po-instructions.md` line 52 references it. Pre-existing inconsistency — not introduced by this migration. Mark for follow-up; do not block sub-area a on it.

- **`~/.productune/po-memory.md.template`** (user-home template, not in repo source — confirm path under `packages/core/po/po-memory.md.template`)
  - Likely contains no Phase enum references (template is calibration log skeleton). Audit during impl; rename only if found.

### Persona spec files

- `packages/core/personas/pdt-designer.md`, `pdt-po.md`, `pdt-qa.md`, `pdt-developer.md` — each contains scattered "Phase 4 step 5x" references mirrored from `tickets.md`. Renumber `4 → 5` per §2 above (specifically the retrospective step ownership lines). Add Phase 4 Deploy ownership notes:
  - `pdt-po.md` — explicit "Phase 4 Deploy = pdt-po+user collaborative" note (already implied by stage:deploy body shape doctrine; confirm wording aligns with new Phase number).
  - `pdt-designer.md`, `pdt-developer.md`, `pdt-qa.md` — no involvement in Phase 4 Deploy; no doctrine change needed beyond mirroring the new enum.

### Rename-class summary

| Pattern                                  | Old           | New                       | Files affected                        |
|------------------------------------------|---------------|---------------------------|---------------------------------------|
| Retrospective Phase                      | `Phase 4`     | `Phase 5`                 | tickets.md, stages.md, lifecycle-mechanics.md, memory.md, persona specs |
| Phase boundary range                     | `1↔2↔3↔4`     | `1↔2↔3↔4↔5`               | stages.md                             |
| `current_phase` enum                     | `1..4`        | `1..5`                    | memory.md (comment), GUI types        |
| `pending_gate.from_phase` / `to_phase`   | `1..4` / `2..4` | `1..5` / `2..5`         | memory.md (schema), GUI types         |
| Layer A diagram                          | 4 phases      | 5 phases (Deploy inserted)| tickets.md                            |
| MVP cycle prose                          | `… → Build → Version close`     | `… → Build → Deploy → Version close` | tickets.md |
| `stage:deploy` Phase column              | `Phase 3`     | `Phase 4`                 | tickets.md Layer B table              |
| `git-workflow.md` reference              | `Phase 4 R2`  | (decouple — name only)    | po-instructions.md, stages.md         |

---

## §3 GUI impact (TypeScript / component)

**Code edits NOT done in this turn** (designer plan only). Listed for the dev ticket that follows.

- **`packages/gui/src/lib/types.ts`**
  - line 6 — `export type Phase = 'PRD' | 'Design' | 'Build' | 'Close'` → `'PRD' | 'Design' | 'Build' | 'Deploy' | 'Close'`.
  - lines 8–13 — `PHASE_NAMES` record adds key `4: 'Deploy'`; existing `4: 'Close'` becomes `5: 'Close'`.
  - line 4 — JSDoc comment `current_phase (1..4)` → `(1..5)`.
  - line 93 — `PhaseTransition.phase: number  // 1..4` → `// 1..5`.
  - lines 102–108 — `PendingGate.from_phase: number  // 1..4` → `// 1..5`. `to_phase: number  // 2..4 (or null when terminal — Phase 4 close)` → `// 2..5 (or null when terminal — Phase 5 close)`.
  - line 129 — `PoState.current_phase?: number  // 1..4; resolves to Phase via PHASE_NAMES` → `// 1..5`.

- **`packages/gui/src/components/workspace/PhaseBreadcrumb.tsx`**
  - line 3 — `const PHASES: Phase[] = ['PRD', 'Design', 'Build', 'Close']` → `['PRD', 'Design', 'Build', 'Deploy', 'Close']`. No layout/style change beyond rendering 5 dots in the same horizontal flex container — existing `gap: 0` + chevron separator scales naturally. Visual density check: at 12 px font, 10 px horizontal padding per node, 4 nodes currently render at ~280 px; 5 nodes ≈ 350 px. Still fits within the breadcrumb bar (full-width `padding: 0 20px` parent). **No design system token change.**

- **`packages/gui/src/components/workspace/VersionDetailView.tsx`**
  - line 10 — `const PHASE_ORDER: Phase[] = ['PRD', 'Design', 'Build', 'Close']` → `['PRD', 'Design', 'Build', 'Deploy', 'Close']`.
  - line 21 — `currentPhase = isActive ? poState?.current_phase : version.ended_at ? 4 : undefined` → `… ? 5 : undefined` (terminal / ended-version sentinel becomes 5).
  - The `PhaseTimeline` sub-component's `PHASE_ORDER.map((p, i) => { const num = i + 1 … })` adapts automatically once the array length is 5. No node-style change.

- **`packages/gui/src/components/workspace/StageStrip.tsx`** — out of scope (sub-area b). Plan note only: today renders 6 user-visible steps; in sub-area b it collapses to the same 5 as `PhaseBreadcrumb`. After both changes ship together the strip and the breadcrumb represent the same axis.

- **`packages/gui/src/lib/stage-mapping.ts`** — out of scope (sub-area b). Today maps `(current_phase, current_task.stage) → strip-step`. Once strip == phase axis (5 == 5) the file's purpose collapses to identity. Decision in sub-area b: delete the file or keep a thin pass-through for migration ergonomics. Out of scope for sub-area a.

- **i18n keys** — `packages/gui/src/i18n/*.ts` (locales) likely contain `Phase` string keys and Phase-numbered messages. Audit step in §5; add a `phase.deploy` key and shift any "phase 4 close" copy to "phase 5 close".

---

## §4 Schema migration — `po-state.json`

### Affected fields

- `current_phase: number` — domain widens 1..4 → 1..5.
- `phase_history[].phase: number` — domain widens 1..4 → 1..5.
- `pending_gate.from_phase: number` / `pending_gate.to_phase: number | null` — domain widens.
- `versions[].outcome` and ticket frontmatter — **no field-level change** (no Phase number stored on those records). Tickets carry `stage`, not `phase`.

### Existing data interpretation rule

**Rule**: any pre-migration record with `phase: 4` continues to mean "Close" → re-write as `phase: 5` ("Close" in new enum). **Phase 4 (Deploy) is not back-filled** — old records had no Deploy phase; the new Deploy phase only applies to Versions started after the migration.

Rationale:
- Pre-migration tasks executed `stage:deploy` inside Phase 3 Build (per old doctrine) or skipped deploy entirely. Re-classifying any of them as "Phase 4 Deploy" retroactively would lose information about when the work actually ran.
- Mapping old 4 → new 5 preserves the "close" semantic exactly. No data is lost.

### jq idempotent transform

Idempotency contract: running the transform twice produces the same output as running it once. Achieved by checking the **schema version** field (introduced as part of this migration) before applying.

```bash
# Run from project root. STATE = ./.productune/po-state.json
STATE=./.productune/po-state.json
TARGET_VERSION=2

tmp=$(mktemp)
jq --argjson target "$TARGET_VERSION" '
  if (.schema_version // 1) >= $target then .   # already migrated — no-op
  else
    # 1. current_phase: 4 → 5 (only meaning preserved, Close)
    (if .current_phase == 4 then .current_phase = 5 else . end)
    # 2. phase_history entries: any phase==4 → 5
    | (if (.phase_history // []) | type == "array"
        then .phase_history |= map(if .phase == 4 then .phase = 5 else . end)
        else . end)
    # 3. pending_gate: from_phase / to_phase 4 → 5
    | (if .pending_gate != null and .pending_gate.from_phase == 4
        then .pending_gate.from_phase = 5 else . end)
    | (if .pending_gate != null and .pending_gate.to_phase == 4
        then .pending_gate.to_phase = 5 else . end)
    # 4. stamp new schema version
    | .schema_version = $target
  end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

**Backup**: `cp "$STATE" "$STATE.bak.$(date -u +%FT%TZ)"` before the transform. Wrapper script (impl side) handles backup + transform + verify.

**Verify** (post-transform):
```bash
jq -e '.schema_version == 2
  and ((.current_phase // 5) >= 1 and (.current_phase // 5) <= 5)
  and ((.phase_history // []) | all(.phase >= 1 and .phase <= 5))
' "$STATE"
```
Exit 0 = pass, non-zero = fail → restore from backup.

### Schema version field — new

Introduce `po-state.json.schema_version: number`. Pre-migration files have it absent; jq treats absent as 1. Post-migration = 2. Future enum-shape changes bump again.

Doctrine note (sub-area a covers this): document the field in `sections/memory.md` "Per-project state" canonical schema block.

---

## §5 Migration sequence (impl ordering)

The order below is the order dev tickets must execute to keep the system consistent at every step. Each step independently reversible.

1. **Doctrine first** — patch `po/po-instructions.md` + `sections/*.md` per §2. No code/state touched yet. Doctrine refers to a 5-Phase model that the code does not yet implement; this is intentional — the next step closes the gap. Commit: `docs(doctrine): adopt Phase 1~5 enum (PRD/Design/Build/Deploy/Close)`.
2. **State migration script** (idempotent) — add `scripts/migrate/po-state-v2.sh` (or wherever migration scripts live in repo — confirm during impl). Run it on the dogfood `.productune/po-state.json` first; gate the wider rollout on success.
3. **GUI Phase TypeScript type** — `packages/gui/src/lib/types.ts` 4-enum → 5-enum + range comments. TypeScript compiles with no consumer break (consumers either iterate `PHASE_NAMES` keys or use the `Phase` literal — both extend cleanly).
4. **PhaseBreadcrumb** — render 5 dots. Smoke-check at standard viewport widths (1024 / 1280 / 1440).
5. **VersionDetailView** — `PHASE_ORDER` 5 entries; ended-version sentinel `4 → 5`. Smoke-check timeline node + line rendering.
6. **i18n audit** — add `phase.deploy` locale entry; shift any phase-4-close copy. Run app in `en` and `ko` to spot raw key leakage.
7. **Persona spec sweep** — renumber Phase 4 → 5 in retrospective ownership lines (`pdt-designer.md`, `pdt-po.md`, `pdt-qa.md`). Confirm no doctrine drift between persona files and `sections/lifecycle-mechanics.md`.
8. **Ticket md frontmatter audit** — tickets store `stage`, not `phase`. **No frontmatter migration required.** This step is a verification: grep `docs/tickets/**/*.md` for any literal `phase: 4` or `phase: 5` to be safe (likely zero hits). If any found, plan separately.
9. **Cross-check**: run `productune` against the dogfood project; confirm `current_phase` reads as 1..5 throughout, breadcrumb dot tracks correctly, gate prompts surface with right phase numbers, retrospective triggers at the new boundary (Phase 4 Deploy done).

Steps 3–6 ship in one PR (GUI bundle); step 1 in its own PR (doctrine); step 2 ships alongside step 1 with a release note. Step 7 piggybacks on step 1 PR. Step 8 is a verify-only check.

---

## §6 Rollback plan

Each step has an independent rollback path — no flag-day cutover.

| Step                                | Rollback                                                                                        |
|-------------------------------------|-------------------------------------------------------------------------------------------------|
| 1. Doctrine                         | `git revert` the doctrine commit. Pre-existing 4-Phase doctrine restored.                       |
| 2. State migration                  | Restore `$STATE.bak.<ts>` from backup. Re-running migration on restored backup is idempotent.   |
| 3. GUI types                        | `git revert`. Type narrowing is back-compat (5 → 4 means literal `'Deploy'` becomes invalid; fix any consumer code that landed in step 3+). |
| 4. PhaseBreadcrumb                  | `git revert`. Component change is isolated.                                                     |
| 5. VersionDetailView                | `git revert`. Sentinel `5 → 4` is mechanical.                                                   |
| 6. i18n                             | `git revert`. New locale key removal is harmless (no consumer would yet reference it).          |
| 7. Persona specs                    | `git revert`.                                                                                   |

Roll-forward beats rollback: if a partial bug surfaces post-deploy, fix it in a follow-up commit. Schema migration is the only step with data risk — backups are mandatory.

---

## §7 Out of scope (separate calls)

- **sub-area b** — `StageStrip.tsx` 6-step → 5-step + `stage-mapping.ts` decision (delete vs. identity pass-through).
- **sub-area c** — `ChatPanel` persona selector removal.
- **sub-area d** — ticket frontmatter `stage` → `type` rename (separate doctrine vocabulary decision).
- **sub-area e** — `docs/prd/*.md §L235` and `docs/service-flow.md §2.2` text fix-ups.
- Migration automation tooling (CLI subcommand `productune migrate-state`) — likely a follow-up ticket; the bash transform in §4 is enough for dogfood.
- Pre-existing pointer to non-existent `git-workflow.md` (audit + decide: create or drop reference).
- Pre-existing typo "next Version's Phase 2 PRD authoring" in `lifecycle-mechanics.md` line 41 (should read "Phase 1 PRD").

---

## §8 Resolutions (PO directive 2026-05-08)

1. ✅ **Phase 3→4 (Deploy) entry trigger** — **(a) automatic gate**. Last `impl/refactor/test/qa` ticket → `done` → PO emits Phase 3→4 transition gate ("티켓 다 됐는데 배포 단계로 넘어갈까요?") → user approval → Phase 4. All Phase transitions follow uniform gate pattern.
2. ✅ **Phase 4→5 (Close) entry trigger** — **gate**. Same uniform pattern — `stage:deploy` ticket → `done` → PO emits Phase 4→5 gate → user approval → Phase 5.
3. ✅ **Retrospective sequence (5a/5b/5c/5d)** — **moves as a unit into Phase 5**. Measurement post-deploy; coincidental letter alignment ("5" prefix matches Phase 5).
4. **Existing ticket frontmatter `phase: 4`** — defer to dev impl `step 8 verify`. Rule: old `4` (Close) → new `5`. Deploy forward-only (no back-fill).
5. ✅ **`schema_version` location** — **top-level key** on `po-state.json`. Simpler jq + migration scripts. Future `.meta` migration possible if more meta fields accumulate.

---

## §9 Validation checklist

- [x] Decision (§1) addresses 2026-05-08 user directive (5-step user-visible == doctrine).
- [x] Doctrine impact (§2) lists every file with confirmed `Phase 4` / `1..4` references found via direct read.
- [x] GUI impact (§3) names exact files + line numbers for the dev ticket.
- [x] Schema migration (§4) provides idempotent jq transform + verify step + backup convention.
- [x] Migration order (§5) is independently rollback-able per step.
- [x] Rollback (§6) lists every step.
- [x] Out of scope (§7) preserves sub-area boundaries.
- [x] Open questions (§8) flag every unresolved decision but none block plan acceptance.
- [x] No code edited.
- [x] Single design plan markdown produced.
