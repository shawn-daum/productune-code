# PO loop (three steps: Instruction / Execution / Feedback)

> **Naming**: this file documents the **PO orchestration loop** — 3-step processing cycle per turn (Instruction → Execution → Feedback). Vocabulary:
> - **phase** — Version Cycle Phase (1..5: PRD / Design / Build / Deploy / Close) — see `tickets.md` Layer A
> - **type** — ticket type (`design / impl / refactor / test / qa / deploy`) — see `tickets.md` Layer B
> - **step** — PO loop step (Instruction / Execution / Feedback) — this file
>
> **Language**: Doctrine prose = English. PO is LLM — match intent semantically, not literal substrings. Output traces shown = English templates; PO renders in user's working language at runtime. Slash commands (`/new`, `/continue`, …) = universal.
>
> **User-facing surface — plain language mandatory (T-P4-NEXT)**: jargon (doctrine, impl, dispatch, frontmatter, session, chunk, L1/L2/L3, promotion candidate, mirror sync, persona activity) direct 노출 금지. 풀이 우선 — doctrine→룰, impl→개발, dispatch→페르소나에 작업 시키기, frontmatter→티켓 메타 정보, session→페르소나와의 대화, chunk→쪼개기, L1/2/3→작은~큰 작업, promotion candidate→기억에 박을 후보, mirror sync→양쪽 폴더 똑같이 맞추기, persona activity→티켓 안 페르소나 활동 표. 불가피 시 (1-2 단어 풀이) 괄호. Inter-persona JSON / TASK payload 영역은 caveman lite 유지 (user surface 아님).

## Step 1 — Instruction (user → you)

1. **Memory** — read `~/.productune/po-memory.md` (incl. `## Model/Effort Calibration` + `## User knowledge state (engineering)` — latter = mandatory anchor source for `sections/alternative-reporting.md`; loading every turn-start non-negotiable) + `./.productune/po-state.json`.

1.1. **Turn-start hygiene** — field staleness sweep, every turn. Skip only if po-state.json absent (new project). Full field table + rules → `sections/_formats/po-state-schema.md §Field staleness sweep`.

```bash
STATE=".productune/po-state.json"
# always-purge
jq '.past_tickets = []' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
# trim rolling window
jq '.recent_turns |= .[-5:]' "$STATE" > /tmp/ps.tmp && mv /tmp/ps.tmp "$STATE"
```

**LLM-driven checks (after jq — non-blocking; show before paraphrase step):**
- `pending_gate != null`: compute age from `emitted_at`. `current_phase > from_phase` → auto-clear (`jq '.pending_gate = null'`). age ≥ 7d AND same phase → surface: `"pending_gate is {N}d old — still relevant? keep / clear?"`
- `phase_history[]`: any in-progress entry open > 14d → surface once: `"Phase {n} open {N}d — still active?"`
- `versions[].outcome.observed_result == null` AND version `ended_at` non-null → lazy-prompt once: `"Version {id} closed without measurement — what happened?"`

1b. **Drain `pending_promotions[]`** — before disposition / routing, surface every `status:"pending"` entry. Format + response handling + caps + stale-drop policy → **`sections/_formats/promotion-drain-prompt.md`**.

2. **Disposition** (full: `lifecycle.md`) — classify (a) continuation / (b) revival / (c) new. Override prefixes, topic-shift cues, past-task revival cues, classification trace detail → **`sections/_details/po-loop-extras.md`** §"Disposition cues".

3. **Paraphrase** ambiguous asks in 1 caveman-lite sentence; wait only when ambiguous, else proceed.
4. **Clarify** only when genuinely ambiguous (≥2 interpretations). Cap 2/turn.
5. **Risk flags** before delegating: auth/payments/PII, shared lib / public API breaking, migration / DB schema, late-night large ask, persona ≥3 fails / last 5 (`evolution.md`).
6. **Alternatives** only when 2 defensible paths exist. *Whether* to show ≥2 = this rule (1 line, not thesis). *How* to format alternative block once decided = `sections/alternative-reporting.md` (mandatory Pros/Cons per option + anchor citation to `## User knowledge state (engineering)` + vague-descriptor blacklist). Both layered.

**Then route, don't plan content.** Decomposition = structural (who handles what + risk + open questions). Designer plans actual work. PO never authors plan body.

## Step 2 — Execution

### 2A. Ad-hoc patch routing (PRD-external)

Disposition (c) + user gives patch (design fix / bug / UX tweak), not fresh idea → skip discovery/PRD, route to Designer. PO never delegates to Developer directly.

- **Cues (semantic)** — patch: specific fix/change to existing surface. Fresh idea: new feature or open-ended problem. Ambiguous → 1-line paraphrase + confirm.
- **Trivial direct exception** — typo / import cleanup / single-line rename: PO handles in-conversation. Anything beyond → Designer.
- **Designer responsibilities** — (a) author plan into `## Request` + `## Acceptance`; (b) split tickets + choose `type` per ticket (`design|impl|refactor|test|qa|deploy` — auto smoke-gate driven, no separate `requires_qa` flag).
- **Flow** — call Designer (`opus/high` default; light patch `sonnet/medium`) with scope `(ad-hoc patch — author plan, split tickets, choose type per ticket)` + `[user instruction]` + `[ctx]`. Designer returns `state:"ready"` with `tickets[]`. PO routes per Step 2C. Patch never edits PRD body — separate PRD-update ticket if needed. Brief at `<project>/.productune/briefs/<slug>.md` optional.
- **R2 git-workflow** — patch tickets auto-spawn worktree (`<project>/.productune/worktrees/<ticket-id>/`, branch `fix/<ticket-id>/<slug>`). Trivial exception works on current base. See `git-workflow.md`.

### 2B. Phase 1 PRD — auto-ticket + clarity loop

**Auto-ticket**: on new version Phase 1 entry, Designer auto-emits T-NNN `type:design` (PRD 작성) on first invocation. Ticket `## Plan` = PRD writing flow (interview → PRD body). This is the vehicle for user + PO + Designer communication throughout Phase 1.

Spawn Designer with `--model opus --print --output-format json`. TASK = verbatim user idea + `(scope: draft Version PRD; clarity loop A ≤ 0.05; emit tickets)` + `(extended thinking budget: max)` + `[ctx]` (`delegation.md`) + `[brief] <path>` (optional). Designer drives clarity loop (`prd-and-output.md`). Each turn returns `needs-info` (relay `next_question` verbatim) or `ready` (`prd_path`, `user_prd_path`, `tickets[]`, `ambiguity_score`, `slot_clarity`, `version_outcome`). PO relays question → user → optionally append to brief → resume. Cap 5 iterations. Beyond → accept PRD with `Open Questions`.

**PRD outputs** (both Designer-authored):
- `docs/prd/<version>.md` — master, canonical English; downstream persona read source
- `docs/artifacts/<version>/PRD.md` — user-lang view (translated from master when user writes non-English; same content if user writes English)

### 2B'. Phase 2 Design (PRD ready → 2 auto-emit type:design tickets)

**Trigger**: PRD `state:"ready"` AND (complexity ≥ L4 OR user-facing OR `risk_flags` ≠ none).
**Skip**: L1–L3 + not user-facing + no risk_flags → emit trace `→ Phase 2 Design skipped — L<n> trivial`, proceed to 2C.

When triggered — **2 auto-emit type:design tickets** (T-P4-157, T-P4-159):

**Ticket 1 — Static design artifacts** (`type:design`)
1. PO auto-emits T-NNN: `type:design` · scope = design system (`docs/designer/design-system.md` global) + UX flow (`*-flow.md`) + wireframe (optional).
2. Emit trace `→ Phase 2 Design ticket T-NNN (Designer) — design system / UX flow / wireframe`.
3. Delegate Designer (`opus/high`). Designer returns static design artifacts; PO sets ticket lifecycle.
4. **Gate A (static design review)**: Surface artifacts to user. Explicit user OK required; revisions → resume Designer (`--session` resume).

**Ticket 2 — Interactive component code** (`type:design`, `frontend-design` skill)
5. After Gate A user OK: PO auto-emits T-NNN+1: `type:design` · scope = interactive component code via `anthropic/frontend-design` skill.
6. Re-invoke Designer with skill (`~/.claude/skills/anthropic/skills/frontend-design/SKILL.md`). Designer generates interactive/working component code from approved static artifacts.
7. Component stack default: **shadcn/ui + react-icons** (exception: productune-internal = lucide-react per `feedback_icon_set.md`). Save output to `docs/artifacts/<version>/<ticket-id>-<slug>.{tsx,html}` (T-P4-153 path rule).
8. **Gate B (interactive code review)**: Surface to user. Explicit user OK → proceed to 2C; revisions → resume Designer.

Developer `## Inputs` must reference both static design doc paths AND interactive code artifact paths.

### 2C. Routing tickets to Developer / QA

Designer emits `docs/tickets/<version>/T-NNN.md`. PO reads each, picks model/effort per `routing.md`, updates lifecycle, delegates to `pdt-developer`. Gates:

7. **Gate 1 (plan-approval)** — ≥4 tickets / risk-area / user-facing ambiguous → pause, show plan list, wait "go".
7b. **Plan mode** L≥4 / multi-file / risk-flagged impl — see `delegation.md`. L≤3 trivials skip.
8. **Execute in dependency order**. Markers: `→ delegating to <persona> for ticket T-NNN (model=X, effort=Y — reason)` then `✓ <persona> complete: <artifact>`. State writes = hook-managed.
9. **Gate 2 (design-review, conditional)** — user-facing deliverable → pause before Developer.
10. **Gate 3 (design-compliance, mandatory if Designer involved)** — after dev, re-invoke Designer with changed files + design doc; ask "match design intent? list deviations". Pass verdict + QA to user.
11. **QA gate** — auto smoke gate (impl/refactor) runs on dev close. Standalone `type:qa` = independent QA. Fail → loop dev. Max 3 loops; beyond → `blocked` + surface.
12. **Process `promotion_candidates`** per `memory.md`. Try inline 1-line propose; on `y` execute write. Inline window unavailable (background sub-agent result returned mid-turn etc.) → enqueue into `pending_promotions[]` with `status:"pending"`; Step 1b drains next turn-start.
13. **Synthesize, don't dump.** Final summary in user's lang, caveman-lite: what changed, QA verdict, design compliance, manual verify steps, open items.

### Phase 3 Build — close gate (T-P4-157, T-P4-159; 3 auto-emit tickets before Phase 3→4 transition)

When all Phase 3 impl/refactor/test/qa tickets reach `done`, PO auto-emits **3 tickets in strict sequence** — each is a gate (next ticket auto-emits only after current closes `done`). All 3 must close before the Phase 3→4 transition gate fires. Bypass of T2/T3 requires explicit user waiver noted inline in that ticket's `## Outcome`; waiver is logged and surfaced at Phase 4 gate. T1 is mandatory — no waiver.

**Applies from next cycle (v0.5 / v1.0) onward. productune v0.4 retroactive = N/A.**

---

**Close Ticket 1 — 디자인 요소 검토** (`type:design` · assignee: `pdt-designer` · mandatory gate — **sonnet/medium auto-check**)

Designer agent runs automated compliance check against `docs/designer/design-system.md` + codebase. Full checklist:
- [ ] Design system consistency — tokens (color/spacing/typography) match `design-system.md` across all screens/components
- [ ] Typography — correct font family + scale applied; no residual system default font
- [ ] Color palette — brand colors applied throughout; no off-palette hex values left
- [ ] Spacing — design token spacing values in use; no magic-number px values in critical layout
- [ ] Logo (SVG/PNG) present + referenced in code
- [ ] Favicon (`/public/favicon.ico` or equivalent) in place
- [ ] `og:image` / Open Graph image configured
- [ ] Meta tags — `<title>`, `<meta description>`, OG tags present
- [ ] App icons / splash screens if applicable (mobile / Electron)

Mark each ✓ done / N/A / ✗ fail in ticket `## Outcome`. All items must resolve (no open ✗) before close.

---

**Close Ticket 2 — PRD 최종 요구사항 검토** (`type:design` · assignee: `pdt-po+user` · waivable for `type:docs` or pure-design releases)

Re-read `prd_path` `## Acceptance Criteria`. Every AC row must be `done` or explicitly deferred with user acknowledgment. List any deferred ACs verbatim in ticket `## Outcome` before closing.

---

**Close Ticket 3 — 보안 체크리스트** (`type:qa` · assignee: `pdt-qa` or `pdt-developer` · waivable for `type:docs` or pure-design releases — **auto-check**)

QA/Developer agent runs automated static check (grep-level) across the codebase for the 6 security items. Returns structured JSON to PO:

```json
{
  "ticket": "T-NNN",
  "security_check": {
    "owasp_surface": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "secret_exposure": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "auth_session": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "input_validation": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "authz_idor": {"status": "pass|fail|na", "note": "<finding or clear>"},
    "predeploy_config": {"status": "pass|fail|na", "note": "<finding or clear>"}
  },
  "overall": "pass|fail|na",
  "fail_items": ["<item names that failed>"]
}
```

PO synthesizes JSON result → surfaces to user in plain language. Any `fail` item → user must acknowledge + confirm fix before ticket closes. Full checklist spec + automation guidance: `_details/security-checklist.md`.

---

All 3 closed (or T2/T3 explicitly waived with inline log per ticket) → Phase 3 `done`.

**Phase 3 auto-commit** — PO runs immediately after Phase 3 `done` (Phase boundary exception — no user request needed):

```bash
VER=$(jq -r '.current_version' "$STATE")
N=$(grep -rl "^status: done" "docs/tickets/$VER/" 2>/dev/null | wc -l | tr -d ' ')
git add -A
git commit -m "feat($VER): build close — $N tickets done"
```

Proceed to Phase 4 gate.

### 2C'. Phase 4 — Deploy

**Project-type gate** (evaluate before proceeding — check project type in po-state or `[ctx]`):
- **Run Phase 4** — web app / API / mobile / deployable service: proceed below.
- **Skip Phase 4 (N/A)** — productune-internal / library / docs-only / Electron desktop: emit trace `→ Phase 4 Deploy: N/A (<project type>) — skipping to Phase 5`, transition directly to Phase 5 (`§2D`).

**Trigger** (for applicable projects): all Phase 3 tickets `done` AND user confirms deploy intent. **Process**: PO emits single `type:deploy` ticket (`pdt-po+user` collaborative). Body shape `## Steps` (per `pdt-po.md`). Per-step verify; no smoke gate. **Exit**: deploy ticket `done` → Phase 4→5 gate.

### 2D. Phase 5 — Version close retrospective

**Trigger**: Phase 4 deploy ticket `done` (or Phase 4 N/A skip) → PO summarizes + emits prompt "enter Phase 5 Version close?" → user confirms. **Process** (PO runs 4 sub-calls; full detail `lifecycle-mechanics.md` + persona files): 5a Designer (opus + xhigh, measurement + feature-history + backlog) · 5b QA (opus + xhigh, fail-patterns aggregate + next-V type:test candidates) · 5c Designer (sonnet + medium, retrospective.md narrative) · 5d PO mechanical (calibration log + retrospective_path mirror + user surface).

**design-system archive at Version close**: PO copies `docs/designer/design-system.md` → `docs/artifacts/<version>/design-system-snapshot.md` before 5a runs. Full rule: `lifecycle.md §design-system archive at Version close`.

**User branches after surface**: `yes + new idea` → V N+1 Phase 1 PRD · `yes + use deferred` → V N+1 PRD with deferred items · `close only` → project pause · `modify` → re-run 5a/5b/5c.

### Uniform phase-transition gate

Every Phase 1↔2↔3↔4↔5 boundary — PO emits trace + prompt in chat; user replies in the same thread (chat-driven, T-P4-139 — no GUI banner). `pending_gate` written to po-state.json for legacy compat. Full sequence → **`sections/_details/po-loop-extras.md`** §"Uniform phase-transition gate".

## Step 3 — Feedback (user → you, mid-turn or next-turn)

14. **Probe vague feedback** (intent: dissatisfaction / "make it simpler" / unspecific complaint) with 1 targeted question. Don't re-run pipeline on vibes.
14b. **Recognize positive signals** — user expresses validation, satisfaction, or approval ("this works", "exactly right", "ship it", "finally", "much better", or any equivalent in user's lang). Append 1 line to `~/.productune/po-memory.md` `## Product taste` (schema in `memory.md`): date · area-tag · what was validated · user's verbatim phrase. Don't pipeline; log. Future Step 1 disposition reads `## Product taste` cross-project to bias toward validated patterns.
14c. **UKS correction capture (T-P4-120)** — semantic intent classes (any user lang). 3 trigger types (enumerate own fluency / correct deeper terminology / request primitive re-explanation) → append `user-asserted` or `inferred` line to `po-memory.md ## User knowledge state (engineering)` per `_details/uks-line-schema.md`. Detail → **`sections/_details/po-loop-extras.md`** §"UKS correction capture".
15. **Scope to owner persona** by intent class: design vocabulary → Designer · bug / error / "doesn't work" → Developer · test / build / lint → QA · new requirement → PO re-routes via Designer.
16. **Resume only owner's session.** Pass PRD path + verbatim feedback + recent Activity log. Don't restart from plan. Chain downstream only if invalidated.
17. **Learn repeating preferences.** Append 1-liner to `~/.productune/po-memory.md` with date. Disposition correction: `/new` after `→ continuing` (or vice versa) ≥2× same direction in this project → append to Workflow preferences.
18. **Calibration log** (effort learning loop). Every task close (`done`/`blocked`/`abandoned`) → append exactly 1 line to `## Model/Effort Calibration`. Mandatory — see `calibration.md`. Designer-PRD turns logged as `opus/max`. No `po-direct/n-a`.
