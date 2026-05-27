# Lifecycle mechanics — 5-Phase orchestration detail

Run these mechanical ticket operations through the lifecycle. Phase contract:
`../../common/bookshelf/phase-definitions.md`.

## Phase transition write

On user approval (chat reply), write:

```bash
jq '.current_phase = <N>
  | .phase_history += [{"phase":<N>,"started_at":"<ISO>","user_approved_at":"<ISO>"}]
  | .pending_gate = null' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

## Auto QA smoke gate (impl / refactor close)

Never let user-facing breakage reach the user.

- Tool: Playwright / Chromium MCP / headless. Non-UI = build / typecheck / unit tests.
- Coverage: route load · navigation · no console errors · sanity Acceptance check.
- Budget: ≤1 min. Not full test plan.
- Fail loop: dev resume + fail excerpt; max 3 retries; beyond → `blocked` + surface.
- Pass: ticket `done` allowed; 1 row appended to `## Persona Activity`.

`type:test` / `type:qa` self-verify. `type:design` self-verifies. `type:deploy` verifies per-step.

## Mechanical close rules

- `todo → in-progress`: set `started_at` if empty.
- `in-progress | review → done | blocked | abandoned`: set `completed_at`; compute
  `duration_min` if `started_at` present.
- Status transition: update frontmatter + mirrored header.
- `assignee` / routing / session refs: metadata only.
- `branch` / `worktree_path`: set on open; never clear (history).
- `## Outcome` = content; delegate Designer if product meaning needed.
- **QA gate close** (impl / refactor): dev `ready_for_qa` → run smoke gate → update
  `qa_status`. Pass → `done`. Fail → resume dev + `qa_loops += 1`. ≥3 → `blocked`.

## Outcome measurement (See layer)

Two append-only layers; neither blocks lifecycle:

**Per-ticket** (optional frontmatter): `success_metric`, `validation_method` —
Designer-set when measurable. `observed_result` — fill at P5. Most stay null.

**Per-Version** (required `versions[].outcome`): `north_star`, `input_metrics[]`,
`validation_method` — Designer derives from PRD at ready time, emits via
`version_outcome` in ready-turn JSON; mirror into state. `observed_result`,
`retrospective_path` — fill at P5.

## Lazy measurement protocol

`validation_method` needs external data (PostHog / Sentry / GA) → leave
`observed_result: null` at P5. Designer asks user during next Version's P1 (P1 N+1 outcome
chase). Never remind. No next Version → measurement never runs.

## Phase ticket auto-emit summary

- **P1 PRD** (new version): T+0 `type:design` "PRD authoring" (Designer, opus/max V1;
  opus/xhigh V2+). `## Plan` = clarity loop. Outputs: `docs/prd/PRD.md` (master EN) +
  `docs/artifacts/<version>/PRD.html` (user-lang).
- **P2 Design** (L4+ / user-facing / risk_flags ≠ none): T+0 × 3 `type:design`:
  T1 design system + mockup · T2 user flow + wireframe · T3 hi-fi mockup
  (frontend-design skill). Single user gate after all 3 surfaced.
- **P3 Build close**: T+0 `type:design` design review (Designer sonnet/medium,
  **mandatory, no waiver** — see `designer/bookshelf/phase3-close-gate.md`) → T+1
  `type:design` PRD requirements (PO + user, waivable) → T+2 `type:qa` 6 security items
  (waivable). Sequential.
- **P4 Deploy** — project-type gate. Meaningful (web/API/mobile) = run normally.
  N/A (internal / library / docs-only) = skip; P3 → P5 direct.
- **P5 Close**: 5a Designer outcome (opus/xhigh) → 5b QA fail-pattern aggregate
  (opus/xhigh) → 5c Designer retrospective (sonnet/medium) → 5d PO calibration.

## Retrospective read sources (P5 — no fresh persona calls)

At 5a/5b/5c, read stored memory only; never spawn fresh analysis. Allowed:

1. **project notes** — `docs/{designer,developer,qa}/bookshelf/*.md`
2. **po-state recent_turns** — rolling 5
3. **global persona memory** — `~/.productune/<persona>/{habit,bookshelf}.md`
   (file-read ahead and inject via `[ctx]`)
4. **po-memory** — `~/.productune/po/habit.md` (product taste + workflow prefs) +
   `~/.productune/po/bookshelf/calibration-log.md` (model/effort calibration)
5. **approved-promotion archive** — `pending_promotions[]` `status ∈ {approved, edited}`
   ∧ `decided_at ∈ [version.started_at, version.ended_at]`

5d mechanical: append calibration log; mirror `retrospective_path`; surface next-V
candidates + dropped promotions.

## Master archive at Version close

```bash
mkdir -p "docs/artifacts/$VERSION"
cp docs/designer/design-system.md "docs/artifacts/$VERSION/design-system-snapshot.md"
cp docs/prd/PRD.md "docs/artifacts/$VERSION/PRD-snapshot.md"
```
