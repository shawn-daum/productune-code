# T-P4-107 · Persona model/effort defaults + caveman mode + Designer §QA scope

**Slug**: `persona-model-effort-defaults-caveman-mode-plan-qa-scope`
**Date**: 2026-05-14
**Round**: r4-doctrine
**Author**: pdt-designer
**Artifact**: plan only (1/1 for this dispatch)
**Status**: ready
**Relates**: T-P4-084 (useUserMode), T-P4-104 (chunking hook), routing.md, delegation.md, po-instructions.md, po-memory.md

---

## §1 Background — Observation Data

### 1.1 Calibration log patterns (po-memory.md)

Three recurring failure patterns observed across T-P4-099 → T-P4-104:

| Pattern | Evidence | Source |
|:--|:--|:--|
| **Sonnet PO chunking violations** | T-P4-099: Designer dispatched with 4 artifacts → hang → cancel (3 cycles). T-P4-102/103: designer kill + redispatch pattern. Calibration notes: "chunking rule violated 3x in this ticket". | po-memory.md calibration log rows |
| **OQ relay miss** | Designer OQs buried in plan body prose, not surfaced to user; PO moved to impl dispatch without user confirm. T-P4-084 §10 OQ list vs T-P4-096 dispatch sequence gap. | T-P4-084 §10 vs subsequent dispatch |
| **Ad-hoc QA scope improvisation** | QA invoke/skip/scope decided improvised at dispatch time — no pre-specified target. T-P4-097 "linter skip list extension" and T-P4-099 "tsc src/ binary call" were unplanned mid-impl QA substitutions. | T-P4-097/099 calibration notes |

### 1.2 Current model/effort state gap

`routing.md §Per-model defaults` has `sonnet → medium`, `opus → xhigh`, `haiku → low`. Per-persona confirmed defaults are absent from any single canonical table — PO re-derives on each routing decision from the algorithm + calibration log, producing inconsistency.

Observed drift: `pdt-po.md` frontmatter is `model: sonnet` — contradicts the confirmed `opus/xhigh` PO default. `pdt-developer.md` and `pdt-qa.md` frontmatter models align but per-task effort is undocumented in a lookup table.

### 1.3 Caveman mode state gap

`po-instructions.md §Language` has "**caveman lite** default" but no mode-branch spec. T-P4-084 introduced `userMode: "developer" | "planner" | null` in `~/.productune/settings.json`; PO never reads this value and always defaults to the same synthesis tone regardless of user segment.

### 1.4 Designer plan §QA scope state gap

All existing plan.md artifacts (T-P4-097, T-P4-099, T-P4-104) have `§Out of scope` and `§Open Questions` but **zero have a `§QA scope` section**. QA decisions are either inline prose or absent entirely, leaving PO to improvise QA dispatch at implementation time.

### 1.5 User decisions verbatim (this conversation)

> **Confirmed defaults:**
> - PO = opus/xhigh (사용자 결정 — sub-agent 위임 비율 높아서 opus PO + sonnet sub-agents combined cost < all-opus alternative)
> - Designer PRD V1 = opus/max
> - Designer ticket emit = sonnet/high (L1 trivial exception = sonnet/medium)
> - Designer plan = sonnet/high (risk-flagged exception = opus/xhigh)
> - Developer plan = opus/xhigh
> - Developer impl = sonnet/high (L1 trivial exception = sonnet/medium)
> - QA = haiku/low (recurring fail / e2e exception = sonnet/high)

> **A. Effort default 통일** — sonnet model = high default, opus model = xhigh default. 즉 model 만 결정 시 effort 자동 (exception override 룰 plan 명시).

> **B. caveman 분기** — T-P4-084 useUserMode 와 통합. 개발자 모드: User ↔ PO 도 light caveman (영어 dev 어휘 OK + JSON quoting 등). 기획자 모드: User ↔ PO 자연어 only (영어 dev 어휘 hidden). Persona 간 caveman lite 는 mode 무관 그대로 (영어/JSON 일관).

> **C. Designer plan §QA scope 의무** — designer 가 emit 하는 모든 plan/ticket 의 의무 section 으로 §QA scope 추가. QA invoke 여부 / test target / 사용자 dogfood 항목 / regression check 항목 포함. 본 doctrine 시점 이후 모든 designer dispatch 의 plan/ticket template 에 강제.

---

## §2 Decisions

### 2(a) Persona model/effort default table (canonical — user-confirmed)

Insertion target: `routing.md §Per-persona complexity floor` (replace existing rows) + mirror summary block in `po-instructions.md §Quick reference`.

| Persona | Task type | Model | Effort | L1 trivial override | Risk-flagged / exception override |
|:--|:--|:--|:--|:--|:--|
| **PO** | All orchestration | `opus` | `xhigh` | — | — |
| **Designer** | PRD R1 (net-new, A ≤ 0.05) | `opus` | `max` | — | — |
| **Designer** | PRD R2+ update | `opus` | `xhigh` | — | — |
| **Designer** | Plan | `sonnet` | `high` | — | `opus/xhigh` (risk-flagged) |
| **Designer** | Ticket emit | `sonnet` | `high` | `sonnet/medium` | — |
| **Designer** | Token/DS compliance check | `sonnet` | `medium` | — | — |
| **Developer** | Plan (L4+) | `opus` | `xhigh` | — | — |
| **Developer** | Impl | `sonnet` | `high` | `sonnet/medium` | — |
| **QA** | Functional verify | `haiku` | `low` | — | `sonnet/high` (recurring fail / e2e / user explicit) |

**Column notes:**
- "L1 trivial override" applies when: single file, ≤2 AC, no cross-cutting, no risk flag, user tone ∈ {"간단", "빠르게", "그냥", "단순"}.
- "Risk-flagged override" applies when: `risk_flags ∩ {auth, payments, PII, migration, DS, public-API} ≠ ∅` or cross-cutting ≥ 3 dirs.
- QA "exception override" = recurring fail (same area ≥ 3 in `fail-patterns.md`) **or** e2e flow ≥ 3 steps **or** user explicit request.
- `max` is PO-gated, opus-only, Stage 1 routing only. Not reachable via Path 1 escalation.

### 2(b) Effort default unification rule

**Rule**: When PO specifies model only (no explicit effort), effort is auto-assigned by model:

| Model | Effort default |
|:--|:--|
| `haiku` | `low` |
| `sonnet` | `high` ← **updated** (was `medium`) |
| `opus` | `xhigh` |

This supersedes the previous `sonnet → medium` default in `routing.md §Per-model defaults`. The §2(a) persona table takes precedence over this per-model default; per-model default applies only to ad-hoc calls not covered by the persona table.

**Trace update**: delegation traces that previously read `sonnet/medium` for Designer plan or Developer impl must now read `sonnet/high`.

### 2(c) caveman mode branching spec

#### Store + resolver

| Element | Location | Notes |
|:--|:--|:--|
| `userMode` value | `~/.productune/settings.json` key `userMode` | Written by GUI Step 0.5 (T-P4-084) or Settings General sub-tab |
| PO read path | Step 1 startup: `jq -r '.userMode // "developer"' ~/.productune/settings.json 2>/dev/null \|\| echo "developer"` | `null` → fallback `"developer"` (no restriction); file-missing → same fallback |
| PO state sync | **Not** mirrored to `po-state.json` — read live from settings.json each session | Avoids sync drift |
| Timing | Read once at Step 1, cached for session | Settings changes mid-session are GUI-side; PO session = single conversation |

#### Mode branches

| Axis | `developer` mode (or null) | `planner` mode | persona ↔ persona |
|:--|:--|:--|:--|
| User ↔ PO synthesis | **light caveman OK** — English dev vocab, arrow/symbol notation (→ ✓ ✗ ↻), ticket IDs, short JSON fragments | **자연어 only** — dev vocab hidden; all traces paraphrased in Korean | **caveman lite always** (English/JSON), mode-invariant |
| Delegation trace in synthesis | `→ routing to pdt-developer (sonnet/high)` OK in summary | Paraphrase: `→ 개발자에게 작업 전달합니다` | English trace always |
| Confidence report | `confidence: high` OK | `검토 완료. 신뢰도 높음.` | As-is |
| OQ relay | JSON fragment alongside Korean OK | Korean 자연어 question only | — |
| Error/low-confidence signal | `⚠ sonnet/high returned low confidence` OK | `⚠ 결과 신뢰도가 낮습니다. 재검토 필요.` | — |

#### Vocabulary mapping table (PO → User)

| Concept | developer output | planner output |
|:--|:--|:--|
| Delegation trace | `→ routing T-P4-107 to pdt-developer (sonnet/high)` | `→ 개발자에게 작업 전달합니다` |
| Confidence | `confidence: high` | `확인 완료. 신뢰도: 높음.` |
| Ticket ID | `T-P4-107` (OK) | `T-P4-107` (OK — product invariant) |
| Effort trace | `sonnet/high · L4` OK | (omit effort details) |
| OQ JSON fragment | `{"state":"needs-info","next_question":"..."}` OK alongside Korean | Korean question only, no JSON |
| Arrow/symbol notation | `→ ✓ ✗ ↻` OK | `→` OK (direction-neutral); `✓/✗` OK (universal); `↻` OK |
| Model name in error | `opus/xhigh returned confidence=low` OK | `검토 결과가 불확실합니다` |

#### po-instructions.md §Language — replacement text

Current (line ~44):
```
User reply in **user's working language**, **caveman lite** default.
```

Replace with:
```
User reply in **user's working language**. Tone mode (read `userMode` at Step 1):
- `userMode = "developer"` (or null): **light caveman** — English dev vocab, arrow/symbol notation (→ ✓ ✗), ticket IDs, short JSON fragments OK.
- `userMode = "planner"`: **자연어 only** — English dev vocab hidden; delegation traces and model names paraphrased in Korean. Ticket IDs still OK (product invariant).
- Persona ↔ Persona: **caveman lite** always (English/JSON), mode-invariant.

Read at Step 1: `jq -r '.userMode // "developer"' ~/.productune/settings.json 2>/dev/null || echo "developer"`
```

#### po-memory.md `## Communication preferences` — new entry

```markdown
- (2026-05-14) caveman mode — userMode 분기: developer = User↔PO light caveman (영어 dev 어휘 OK, JSON OK). planner = User↔PO 자연어 only (dev 어휘 hidden). Persona간: 항상 caveman lite (영어/JSON), mode 무관. PO reads userMode at Step1 from ~/.productune/settings.json.
```

### 2(d) Designer plan §QA scope — mandatory section spec

#### Template

To be inserted in every plan.md and every type:design ticket the Designer emits (after `§Out of scope`, before `§Open Questions` if present, else at end):

```markdown
## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `auto pdt-qa dispatch` \| `manual smoke only` \| `skip` |
| **test target** | [specific function name / component name / e2e flow — or `—` if skip] |
| **사용자 dogfood** | [항목 명시 — PO 가 사용자에게 직접 verify 요청. 없으면 `—`] |
| **regression check** | [file path or feature — 회귀 가능성. 없으면 `—`] |
```

#### Designer guidance for QA invoke selection

| Choice | When to use |
|:--|:--|
| `auto pdt-qa dispatch` | Multi-step user flow ≥ 3 steps; risk_flags includes auth/payments/PII; same area ≥ 3 cumulative fail-patterns |
| `manual smoke only` | Single component change; L1–L3 trivial scope; no regression surface; self-verify sufficient |
| `skip` | Pure doctrine/doc update (plan.md, design doc only); zero user-facing code change |

#### PO reject gate (acceptance rule)

```
After receiving Designer plan JSON:
  if "§QA scope" section ABSENT from plan body:
    → PO resumes Designer session:
        "plan missing §QA scope — please add per T-P4-107 doctrine before PO review."
    → Designer adds §QA scope table, returns updated plan
    → PO re-reviews (same dispatch session, not a new delegation)
    Max retries: 1
    If 2nd return also missing §QA scope:
      → PO surfaces to user as escalation (option menu per escalation.md)
```

**Rejection does not count as a failed turn** — it is a template compliance check. `confidence_history` entry is not written until §QA scope is present.

#### Template location — two insertion points

1. **`pdt-designer.md`** persona doc — Designer's own doctrine reference. Add after the "type:design ticket — 4-artifact set" section, as a new subsection: `### Plan §QA scope (mandatory)`.
2. **`~/.productune/sections/delegation.md §Plan mode`** — PO's reference when reviewing. Add as a `> **§QA scope check**` callout inside step 2 of the Plan mode flow (PO review step).

### 2(e) Exception override rules — decision tree

```
GIVEN: persona_call(persona, task_type, task_signals)

STEP 1 — BASE LOOKUP:
  → §2(a) table[persona][task_type] → (base_model, base_effort)

STEP 2 — L1 TRIVIAL CHECK  (applies to: Designer ticket emit, Developer impl ONLY):
  ALL conditions must hold:
    □ single file change, or ≤2 small files with no shared index (locale/dispatcher/enum)
    □ acceptance_criteria ≤ 2 items
    □ risk_flags = ∅
    □ user_tone ∈ {"간단", "빠르게", "그냥", "단순", "quick"}
    □ no cascade on shared files
  → IF all ✓: OVERRIDE to sonnet/medium
  → Append trace suffix: "(↓L1 trivial → sonnet/medium)"

STEP 3 — RISK-FLAGGED CHECK  (applies to: Designer plan, Developer plan/impl):
  ANY condition triggers:
    □ risk_flags ∩ {auth, payments, PII, migration, DS, public-API} ≠ ∅
    □ cross_cutting_dirs ≥ 3
    □ own_decompose_level ≥ L6
  → IF any ✓: OVERRIDE to opus/xhigh
  → Append trace suffix: "(↑risk-flagged → opus/xhigh)"

STEP 4 — QA EXCEPTION CHECK  (applies to: QA calls ONLY):
  ANY condition triggers (A, B, or C):
    A. docs/qa/fail-patterns.md same area-tag cumulative count ≥ 3
    B. user_flow_steps ≥ 3 (e2e flow)
    C. user intent = "write a test plan first" or equivalent
  → IF any ✓: OVERRIDE to sonnet/high
  → Append trace suffix: "(↑recurring-fail | ↑e2e | ↑user-explicit → sonnet/high)"

STEP 5 — MAX GUARD  (applies to all):
  max effort is PO-gated, Stage 1 only.
  NOT reachable via Path 1 escalation (escalation.md).
  Auto-trigger cases are fixed (PRD R1 / net-new DS / system arch).
  → No dynamic override to max. PO confirms once per session.

STEP 6 — EMIT TRACE:
  → delegating to pdt-<persona> (model=<model>, effort=<effort> — reason: <one-line> <suffix>)
```

---

## §3 Module Map

Implementation dispatch (separate ticket + separate turn — see §6):

| File | Change type | Change summary |
|:--|:--|:--|
| `~/.productune/po-instructions.md` | Update §Language | Replace caveman lite default line with mode-branch paragraph (§2(c)). Add `userMode` read command. |
| `~/.productune/po-instructions.md` | Update §Personas or §Quick reference | Add model/effort column reference to §2(a) canonical table. |
| `~/.productune/sections/routing.md` | Update §Per-persona complexity floor | Replace table with §2(a) canonical table (adds Model / Effort / L1-trivial / risk-flagged columns). |
| `~/.productune/sections/routing.md` | Update §Per-model defaults | `sonnet → high` (was `medium`). Note: persona table takes precedence. |
| `~/.productune/sections/delegation.md` | Insert callout in §Plan mode | Add `> **§QA scope check**` at PO review step (step 2). Template reference → pdt-designer.md. |
| `~/.productune/po-memory.md` | Append to `## Communication preferences` | Add caveman mode-branch dated entry (§2(c) text verbatim). |
| `~/.claude/agents/pdt-po.md` | Update frontmatter | `model: sonnet` → `model: opus` (aligns confirmed default). |
| `~/.claude/agents/pdt-designer.md` | Update effort matrix table + add §QA scope template subsection | Update plan=sonnet/high, ticket emit=sonnet/high in effort matrix. Add `### Plan §QA scope (mandatory)` section with template. |
| `~/.claude/agents/pdt-developer.md` | No change needed | `model: sonnet` already correct; effort handled PO per-call. |
| `~/.claude/agents/pdt-qa.md` | No change needed | `model: haiku` already correct; effort handled PO per-call. |
| `docs/designer/design-system.md §1.5` | Insert footnote | After §1.5 closing sentence: "UX vocabulary splits on `userMode` (`developer`/`planner`) — tone-aware messaging doctrine: T-P4-084 (store) + T-P4-107 (PO routing)." |

**pdt-po.md `model:` note**: `model:` is the fallback when the persona is invoked without explicit `--model` flag. PO is always invoked by the user directly; confirming `model: opus` aligns with the confirmed default and prevents accidental sonnet dispatch on bare `claude --agent pdt-po` invocations.

---

## §4 §1.5 Self-check (UX principles)

Doctrine plan — no user-facing screen. Mapping principles to the PO + Designer operator experience:

| Principle | Application | Status |
|:--|:--|:--|
| **Few Things** | Four sub-decisions (a–d) in §2. Each resolves a single gap. §Module map touches 8 files — all additive or small-replacement; no structural rewrites. No new GUI components. | ✓ |
| **Familiar** | §2(a) table uses the existing `routing.md` table shape with added columns — no new format. caveman mode reuses T-P4-084's `userMode` store directly — no new store, no new enum. §QA scope table matches the existing plan section table style. Exception decision tree reuses existing signal vocabulary (risk_flags, area-tag, user_tone). | ✓ |
| **Predictability** | §2(a) table is a direct lookup — no algorithm needed at dispatch time. caveman mode reads a single string from one settings file. §QA scope is a fixed 4-field table — Designer cannot omit fields (reject gate enforces). Exception overrides require explicit ALL/ANY conditions — no edge-case ambiguity. | ✓ |
| **Feedback** | §QA scope absent → PO emits explicit reject with T-P4-107 doctrine reference. Exception override applied → trace suffix appended (`↓L1 trivial`, `↑risk-flagged`, `↑recurring-fail`). caveman mode switch is explicit (`jq` read at Step 1) — PO cannot be in wrong mode silently. | ✓ |
| **Escape** | L1 trivial override requires ALL five conditions — conservative; rarely fires on ambiguous scope. §QA scope reject allows 1 retry before user escalation. caveman null → developer fallback (no lockout, no degraded mode). max effort not reachable by accident (Stage 1 only, no Path 1 escalation path to max). | ✓ |

No violations found.

---

## §5 Open Questions

| # | Question | Recommendation |
|:--|:--|:--|
| OQ-1 | `userMode = null` PO fallback — `"developer"` or `"planner"`? | **`"developer"`** — productune's historical primary user segment. null = unset = most permissive tone (light caveman) as safe default. Planner users who haven't set mode yet are not harmed (will see some English dev terms until they set planner mode). |
| OQ-2 | pdt-po.md `model: opus` frontmatter — does any Claude Code UI display `model:` as a label for the user? | Low risk. `model:` is invocation fallback only. User never sees it directly. Update is correctness-only. No UX impact. |
| OQ-3 | `사용자 dogfood` field — is this PO-actionable (PO asks user during synthesis) or notes-only? | **PO-actionable**: PO reads this field post-plan, includes in "다음 단계" synthesis to user. User decides yes/no. Dogfood items are user-gated, not auto-dispatched. Recommended phrasing: "사용자 직접 확인 권장: [항목]". |
| OQ-4 | Should PO re-read `userMode` on every synthesis or cache at Step 1? | **Cache at Step 1**. Settings.json changes mid-session are GUI-side (require app restart to take effect in practice). Re-reading adds `jq` calls with no material benefit per session. |
| OQ-5 | Should the §QA scope reject gate also apply to ticket.md bodies (not just plan.md)? | **Yes, same gate** — Designer ticket emit = `sonnet/high`; ticket body is a designer artifact. §QA scope is mandatory in both plan.md and companion ticket.md. Implementation: add to pdt-designer.md ticket template section as well. |

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — (doctrine doc only, zero user-facing code) |
| **사용자 dogfood** | After impl lands: PO synthesizes one caveman-mode turn to user in developer mode and one in planner mode side-by-side — user confirms tone difference is appropriate. |
| **regression check** | `~/.productune/sections/routing.md` (per-persona floor table overwrite) — ensure existing L-step escalation paths (`step-up`/`step-down` signals) remain intact after table update. `~/.productune/po-instructions.md §Language` — ensure caveman lite persona-to-persona behavior unchanged. |

---

## §6 Out of Scope (this dispatch)

- **All file edits** in §3 Module Map — implementation dispatch, separate ticket(s), separate dev/designer turn.
- **Ticket md emission** — 산출물 1 (this plan). Zero companion tickets in this dispatch.
- **ROADMAP touch** — internal doctrine update; no ROADMAP entry needed.
- **Activity Log** — PO mechanical append on close.
- **T-P4-085 vocabulary audit** — planner mode vocabulary table refinement (downstream of T-P4-084, separate scope).
- **`~/.claude/projects/.../memory/feedback_caveman_lite.md` MEMORY.md entry** — user memory system file; update is a PO/user-gated promotion, not designer-authored content.
- **docs/qa/fail-patterns.md** — read-only reference for Designer at Phase 1; no write in this plan.
- **Smoke gate** — T-P4-107 is doctrine-only; smoke gate unchanged.
- **Other persona ceilings** (pdt-developer L1-trivial guard, pdt-qa ceiling) — different signal vocabulary; already handled via §2(e) decision tree.

---

## §7 Dependencies

| Dependency | Relationship | Blocking? |
|:--|:--|:--|
| **T-P4-084** (useUserMode) | §2(c) caveman mode reads `userMode` from `settings.json` written by T-P4-084 GUI impl. | **Non-blocking** — pre-T-P4-084 land: `jq` returns null → developer fallback. Doctrine lands independently of GUI. |
| **T-P4-104** (chunking hook) | Both land in r4-doctrine. T-P4-104 adds a `delegation.md` callout at `## PRD delegation` (line 98). T-P4-107 impl adds `§QA scope check` callout at `## Plan mode` (line 136). **Different insertion points** — no conflict. | Non-blocking. Land order-independent. |
| **routing.md** | §2(a) table update supersedes per-persona floor table rows. §2(b) updates `§Per-model defaults`. Additive/replace — no hard dep on other in-flight tickets. | Non-blocking. |
