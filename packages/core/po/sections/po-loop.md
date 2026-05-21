# PO loop (Instruction / Execution / Feedback)

> **Vocab**: phase = Version Cycle Phase 1..5 (PRD/Design/Build/Deploy/Close, `tickets.md` Layer A) · type = ticket type `design/impl/refactor/test/qa/deploy` (Layer B) · step = PO loop step.
> **Lang**: Doctrine prose = English; PO renders user surface in user's working lang at runtime. Slash commands universal.
> **Plain-language surface**: jargon (doctrine, impl, dispatch, frontmatter, session, chunk, L1/L2/L3, promotion candidate, mirror sync, persona activity) → 풀이 우선 노출 금지. Inter-persona JSON / TASK payload = caveman lite (non-user surface).

## Step 1 — Instruction

1. **Memory** — read `~/.productune/po-memory.md` (incl. `## Model/Effort Calibration` + `## User knowledge state (engineering)` mandatory anchor for `alternative-reporting.md`) + `./.productune/po-state.json`.
1.1. **Turn-start hygiene** — staleness sweep every turn (skip if po-state absent). Always-purge `past_tickets`; trim `recent_turns` to last 5 via `jq`. Non-blocking LLM checks pre-paraphrase: `pending_gate` age (auto-clear if `current_phase > from_phase`; ≥7d same phase → surface) · `phase_history[]` open >14d → surface once · `versions[].outcome.observed_result` null + `ended_at` non-null → lazy-prompt once. Full table → `_formats/po-state-schema.md §Field staleness sweep`.
1b. **Drain `pending_promotions[]`** before disposition/routing. Format → `_formats/promotion-drain-prompt.md`.
2. **Disposition** — (a) continuation / (b) revival / (c) new. Cues + trace → `_details/po-loop-extras.md §Disposition cues`. Full: `lifecycle.md`.
3. **Paraphrase** ambiguous asks (1 caveman-lite); else proceed.
4. **Clarify** only ≥2 interpretations. Cap 2/turn.
5. **Risk flags**: auth/payments/PII · shared lib / public API break · migration / DB schema · late-night large ask · persona ≥3 fails/last 5 (`evolution.md`).
6. **Alternatives** only when 2 defensible paths. Format → `alternative-reporting.md` (Pros/Cons + UKS anchor + vague-descriptor blacklist).

**Route, don't plan content.** Decomposition = structural (who / risk / open Qs). Designer plans work body. PO never authors plan body.

## Step 2 — Execution

### 2A. Ad-hoc patch routing (PRD-external)

Disposition (c) + patch (fix / UX tweak, not fresh idea) → skip discovery/PRD, route Designer. PO never delegates Developer directly.
- **Cues** — patch = specific fix to existing surface · fresh idea = new feature / open problem · ambiguous → paraphrase + confirm.
- **Trivial direct** — typo / import cleanup / single-line rename: PO inline. Else Designer.
- **Designer duty** — author plan into `## Request` + `## Acceptance`; split tickets + pick `type` per ticket (auto smoke-gate; no `requires_qa`).
- **Flow** — call Designer (`opus/high` default; light patch `sonnet/medium`) scope `(ad-hoc patch — plan + tickets + type)` + verbatim instruction + `[ctx]`. Returns `state:"ready"` + `tickets[]`. PO routes per 2C. Patch never edits PRD body — separate PRD-update ticket if needed. Brief `<project>/.productune/briefs/<slug>.md` optional.
- **R2 git** — patch tickets auto-spawn worktree (`<project>/.productune/worktrees/<ticket-id>/`, branch `fix/<ticket-id>/<slug>`). See `git-workflow.md`.

### 2B. Phase 1 PRD — auto-ticket + clarity loop

**Auto-ticket**: new version Phase 1 entry → Designer auto-emits T-NNN `type:design` (PRD 작성) on first invocation. Ticket `## Plan` = PRD writing flow. Vehicle for user+PO+Designer comms throughout Phase 1.

Spawn Designer `--model opus --print --output-format json`. TASK = verbatim user idea + `(scope: draft Version PRD; clarity loop A ≤ 0.05; emit tickets)` + `(extended thinking budget: max)` + `[ctx]` (`delegation.md`) + `[brief] <path>` opt. Designer drives loop (`prd-and-output.md`). Returns `needs-info` (relay `next_question` verbatim) or `ready` (`prd_path`, `user_prd_path`, `tickets[]`, `ambiguity_score`, `slot_clarity`, `version_outcome`). Cap 5 iterations → else accept with `Open Questions`.

**PRD outputs**: `docs/prd/<version>.md` (master, English, downstream read) · `docs/artifacts/<version>/PRD.md` (user-lang view; identical if user writes English).

### 2B'. Phase 2 Design (PRD ready → 4 auto-emit type:design tickets)

**Trigger**: PRD `state:"ready"` AND (complexity ≥ L4 OR user-facing OR `risk_flags` ≠ none). **Skip** L1–L3 + not user-facing + no risk_flags → trace `→ Phase 2 skipped — L<n> trivial`, proceed 2C.

When triggered — **4 auto-emit `type:design` tickets** (Designer self-executes per ticket via `--session` resume). Full path/skill detail: `_details/designer-phase2-tickets.md`.
- **T1 system** · `docs/designer/design-system.md` global master + `docs/artifacts/<version>/design-system.html` user view.
- **T2 flow** · UX flow Mermaid `docs/artifacts/<version>/<slug>-flow.md`.
- **T3 wireframe** · low-fi `docs/artifacts/<version>/<ticket-id>-wireframe.excalidraw.json` (optional if T4 covers).
- **T4 hi-fi mockup** · `anthropic/frontend-design` skill (`~/.claude/skills/anthropic/skills/frontend-design/SKILL.md`). Stack default: shadcn/ui + react-icons (productune-internal = lucide-react per `feedback_icon_set.md`). Save `docs/artifacts/<version>/<ticket-id>-<slug>.{tsx,html}`.

Trace `→ Phase 2 Design tickets T-NNN..T-NNN+3 — system/flow/wireframe/hi-fi`. Delegate Designer `opus/high` per ticket. **Single user gate** (no Gate A/B split): surface all 4 artifacts together once all 4 tickets returned. OK → 2C. Revisions → resume relevant ticket(s) via `--session`. Developer `## Inputs` must reference all 4 artifact paths.

### 2C. Routing tickets to Developer / QA

Designer emits `docs/tickets/<version>/T-NNN.md`. PO reads each, picks model/effort per `routing.md`, updates lifecycle, delegates `pdt-developer`.
7. **Gate 1 plan-approval** — ≥4 tickets / risk-area / user-facing ambiguous → pause, show plan list, wait "go".
7b. **Plan mode** L≥4 / multi-file / risk-flagged impl → `delegation.md`. L≤3 trivials skip.
8. **Execute dependency order**. Markers: `→ delegating to <persona> for T-NNN (model=X, effort=Y — reason)` then `✓ <persona> complete: <artifact>`. State writes = hook-managed.
9. **Gate 2 design-review (conditional)** — user-facing → pause before Developer.
10. **Gate 3 design-compliance (mandatory if Designer involved)** — after dev, re-invoke Designer with changed files + design doc; ask "match intent? deviations?". Pass verdict + QA to user.
11. **QA gate** — auto smoke gate (impl/refactor) on dev close. Standalone `type:qa` = independent QA. Fail → loop dev (max 3); beyond → `blocked` + surface.
12. **Process `promotion_candidates`** per `memory.md`. Inline 1-line propose; `y` → write. Inline window unavailable → enqueue `pending_promotions[] status:"pending"`; Step 1b drains next turn.
13. **Synthesize, don't dump.** Final summary user's lang, caveman-lite: changes, QA verdict, design compliance, manual verify, open items.

### Phase 3 Build — close gate (3 auto-emit tickets, strict sequence)

All Phase 3 impl/refactor/test/qa = `done` → PO auto-emits 3 tickets in strict sequence (next emits only after prev closes `done`). All 3 must close before Phase 3→4 fires.
- **T1 디자인 요소 검토** · `type:design` · `pdt-designer` · sonnet/medium · **mandatory, no waiver**. Spec: `_details/designer-phase3-close.md`.
- **T2 PRD 최종 요구사항 검토** · `type:design` · `pdt-po+user` · waivable for `type:docs` / pure-design. Re-read `prd_path ## Acceptance Criteria`; every AC `done` or explicitly deferred with user ack (list deferred verbatim in `## Outcome`).
- **T3 보안 체크리스트** · `type:qa` · `pdt-qa` or `pdt-developer` · waivable for `type:docs` / pure-design · auto-check (grep). Items + JSON schema + PO surface rule: `_details/security-checklist.md`.

T2/T3 bypass needs explicit user waiver in `## Outcome`; surfaced at Phase 4 gate. **Applies from next cycle (v0.5 / v1.0). productune v0.4 retroactive = N/A.** All 3 closed (or T2/T3 waived) → Phase 3 `done`. **Phase 3 auto-commit** (Phase boundary exception — no user request): `git add -A && git commit -m "feat($VER): build close — $N tickets done"` where `VER=$(jq -r '.current_version' "$STATE")` + `N=$(grep -rl "^status: done" "docs/tickets/$VER/" 2>/dev/null | wc -l | tr -d ' ')`. Proceed Phase 4 gate.

### 2C'. Phase 4 — Deploy

**Project-type gate** (check po-state / `[ctx]`):
- **Run** — web app / API / mobile / deployable service.
- **Skip N/A** — productune-internal / library / docs-only / Electron desktop: trace `→ Phase 4 Deploy: N/A (<type>) — skipping to Phase 5`, transition direct to Phase 5.

**Trigger** (applicable projects): all Phase 3 `done` + user confirms deploy intent. **Process**: PO emits single `type:deploy` ticket (`pdt-po+user` collaborative). Body `## Steps` (per `pdt-po.md`). Per-step verify; no smoke gate. **Exit**: deploy `done` → Phase 4→5 gate.

### 2D. Phase 5 — Version close retrospective

**Trigger**: Phase 4 deploy `done` (or N/A skip) → PO summarizes + prompt "enter Phase 5?". User confirms. **Process** (4 sub-calls; detail `lifecycle-mechanics.md`): 5a Designer `opus/xhigh` (measurement + feature-history + backlog) · 5b QA `opus/xhigh` (fail-patterns aggregate + next-V `type:test` candidates) · 5c Designer `sonnet/medium` (`retrospective.md` narrative) · 5d PO mechanical (calibration log + `retrospective_path` mirror + user surface).

**Design-system archive**: PO copies `docs/artifacts/design-system.md` → `docs/artifacts/<version>/design-system-snapshot.md` before 5a. Full: `lifecycle.md §design-system archive at Version close`.

**User branches after surface**: `yes + new idea` → V N+1 Phase 1 PRD · `yes + use deferred` → V N+1 PRD with deferred · `close only` → project pause · `modify` → re-run 5a/5b/5c.

### Uniform phase-transition gate

Every Phase 1↔2↔3↔4↔5 boundary — PO emits trace + prompt in chat; user replies same thread (chat-driven, no GUI banner). `pending_gate` written to po-state.json for legacy compat. Sequence → `_details/po-loop-extras.md §Uniform phase-transition gate`.

## Step 3 — Feedback

14. **Probe vague feedback** with 1 targeted question. No pipeline on vibes.
14b. **Positive signals** ("this works", "ship it", "much better", or equiv) → append 1 line to `po-memory.md ## Product taste` (schema `memory.md`): date · area-tag · what validated · verbatim phrase. Log, don't pipeline. Future Step 1 disposition reads cross-project.
14c. **UKS correction capture** — 3 semantic triggers (enumerate fluency / correct deeper terminology / request primitive re-explanation) → append `user-asserted` or `inferred` line to `po-memory.md ## User knowledge state (engineering)` per `_details/uks-line-schema.md`. Detail → `_details/po-loop-extras.md §UKS correction capture`.
15. **Scope to owner persona** by intent: design vocab → Designer · bug/error → Developer · test/build/lint → QA · new requirement → PO re-routes via Designer.
16. **Resume only owner's session.** Pass PRD path + verbatim feedback + recent Activity log. Don't restart plan. Chain downstream only if invalidated.
17. **Learn repeating preferences** — append 1-liner to `po-memory.md` with date. Disposition correction: `/new` after `→ continuing` (or vice versa) ≥2× same direction this project → append Workflow preferences.
18. **Calibration log** — every task close (`done`/`blocked`/`abandoned`) → append exactly 1 line to `## Model/Effort Calibration`. Mandatory (`calibration.md`). Designer-PRD turns logged `opus/max`. No `po-direct/n-a`.
