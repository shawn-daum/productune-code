# Plan — PO orchestrator rework (no direct authoring)

| Field | Value |
|---|---|
| **Status** | Draft v0.1 |
| **Author** | PO (shawn.kim) — drafted by Claude |
| **Created** | 2026-04-30 |
| **Driver** | Sub-agent model override is the only reliable way to split PRD work onto opus while keeping main session cheap. PO must stop authoring. |
| **Engine policy** | primary: Claude Code · secondary: Codex (doctrine-only — no hooks fire) |

> **Tone rule for live work:** PO ↔ user replies use *caveman lite* by default (terse, full sentences, no filler). Artifacts (PRD, plan, ticket) stay in normal voice.

---

## 0. Why this rework

Two problems force the change:

1. **Model mismatch.** PO authors PRDs directly, so the PRD lives in PO's main session model. The assistant cannot self-rotate to opus mid-session, so a sonnet-started session writes a sonnet PRD even when the doctrine label says `opus + ⚡max`. Sub-agents can be launched with `--model opus` per call — that's the only knob that actually moves the model.
2. **Hook coupling to engine.** R1–R4 hooks enforce mechanical correctness on the **claude** engine. Codex bypasses hooks, so doctrine on codex is best-effort. If PO never edits files itself, R1/R3 lose most of their teeth and the engine gap shrinks.

Conclusion: shift PO to a pure orchestrator. All authoring goes through sub-agents with explicit `--model`. Codex becomes a viable secondary because the surface PO touches is narrow.

---

## 1. Resolved Open Questions (user, 2026-04-30)

| OQ | Decision |
|---|---|
| **OQ-1 PRD authoring** | PO runs first-touch interview using `pm-product-discovery:*` and `pm-market-research:*` skills, then **delegates PRD authoring to Designer**. Designer drafts PRD against a measurable clarity target (see §3). |
| **OQ-2 Ticket split** | **Designer** also produces tickets (`docs/tickets/<round>/T-NNN.md`) as part of the same plan output. PO routes tickets, does not author them. |
| **OQ-3 Discovery skill ownership** | **PO** invokes discovery / market-research skills. Designer receives a synthesized brief, not raw transcripts. |
| **OQ-4 Hooks** | R3 (`.md` boundary) **deleted**. R1 (slug) **softened**: only auto-fills missing slug, no other gating. R2/R4 + post-edit-format/post-compact-doctrine/stop-verify retained. Codex engine runs **doctrine-only**, hooks no-op there. |
| **OQ-5 PO direct work** | **None.** PO never opens an editor. Even one-line `.md` edits go to a persona. |

---

## 2. New persona contract

| Persona | Owns | Writes |
|---|---|---|
| **PO** | sequencing, routing, sub-agent spawn, synthesis, user-facing reply (caveman lite default) | only `<project>/.productune/po-state.json` and `~/.productune/po-memory.md` (calibration log). **No** product files, **no** PRD, **no** tickets, **no** code. |
| **Designer** | PRD authoring, planning, ticket split, design docs | `docs/prd/<slug>.md`, `docs/tickets/<round>/T-NNN.md`, `docs/artifacts/**/*.md` |
| **Developer** | implementation, plan-mode planning for L4+ code work | source code in any extension, code-relevant config |
| **QA** | verification, test scenarios, regression sweeps | `docs/qa/*.md` only |

PO's two state files are state — not "authoring".

---

## 3. PRD flow — Ambiguity-score interview loop (Designer-side)

Designer treats PRD authoring as a **clarity convergence loop**, not a one-shot draft.

### Score formula

```
A = 1 − Σ(clarityᵢ × weightᵢ)
   where  i ∈ PRD slot set
          clarityᵢ ∈ [0, 1]    (Designer's confidence the slot is well-defined)
          weightᵢ  — slot importance weight (Σ weights = 1)
```

**Target:** `A ≤ 0.05` before PRD draft is finalized. Any iteration that ends with `A > 0.05` triggers another reasoning interview turn.

### Default slot weighting (Round 1 MVP)

| Slot | Weight | Why |
|---|--:|---|
| Problem statement & target user | 0.18 | Wrong here = everything downstream wrong. |
| Top user job / outcome | 0.14 | JTBD anchor. |
| Scope boundary (in / out / later) | 0.13 | Round-1 cut quality. |
| Acceptance criteria | 0.12 | Testability gate. |
| Risk & assumption surface | 0.10 | Pre-mortem signal. |
| Success metrics (north star + input) | 0.09 | Measurable outcome. |
| Solution shape (3-layer-ish hypothesis) | 0.08 | Avoids analysis paralysis. |
| External dependencies / integrations | 0.06 | Schedule risk. |
| Brand / UX direction | 0.05 | Designer can self-resolve later if low. |
| Operations / GTM / launch | 0.05 | Punted to Round 2 frequently. |

(Weights are defaults — Designer may rebalance per project and record the override in the PRD frontmatter.)

### Loop

```
loop:
  for each slot i:
    Designer reasons over current evidence (interview brief + research) → clarityᵢ
  A = 1 − Σ(clarityᵢ × weightᵢ)
  if A ≤ 0.05: break
  Designer picks lowest-clarity high-weight slot → emits 1 reasoning question to PO
  PO either answers from interview brief or escalates 1 question to user (verbatim)
  PO returns answer + (optional) updated brief → resume Designer session
```

Designer outputs at the end:

```yaml
ambiguity_score: 0.04
slot_clarity:
  problem_statement: 1.00
  top_job: 0.95
  scope_boundary: 0.90
  ...
unresolved_questions: []        # must be empty when A ≤ 0.05
```

### Hard caps

- **5 question rounds max** between Designer and user (via PO). Beyond that, Designer must ship PRD with explicit `## Open Questions` and surface to PO with `confidence < 0.7`.
- Each round = 1 question to user, 1 answer back. Batching multiple questions per round is allowed.

---

## 4. Phase plan

### Phase 1 — Doctrine rewrite (no code)
| File | Change |
|---|---|
| `po/po-instructions.md` | Replace "What you DO directly" block with "What you orchestrate". Add caveman-lite default rule for user-facing replies. Spell out engine note: codex = doctrine-only. |
| `po/sections/stages.md` | Stage 1 = interview (PO uses pm skills) → brief. Stage 2 = delegate PRD to Designer (clarity loop). Stage 3 = route tickets. |
| `po/sections/prd-and-output.md` | Move PRD ownership to Designer. Document the clarity-loop contract. PO's role here = brief synthesizer + question relay. |
| `po/sections/tickets.md` | Tickets emitted by Designer alongside PRD. PO reads, routes, does not author. |
| `po/sections/delegation.md` | Already updated for `[ctx]` slice. Add Designer-PRD delegation template (interview brief inline, ambiguity contract). |
| `po/sections/routing.md` | Redo model defaults: PO = sonnet/medium (orchestrator), Designer-PRD = opus/max, Designer-design = opus/xhigh, Developer = unchanged, QA = unchanged. |
| `po/sections/lifecycle.md` | Stage 3 close — PO calls Designer/Developer for last-mile artifact, never `Edit`s. |

### Phase 2 — Persona doctrine
| File | Change |
|---|---|
| `agents/variants/*/pdt-po.md` | Frontmatter `tools`: drop `Write`, drop `Edit`. Keep `Bash(jq *)`, `Bash(claude *)`, etc. Body rewrite: orchestrator playbook, caveman-lite for user, normal voice for inter-persona. |
| `agents/variants/*/pdt-designer.md` | Add §"PRD authoring & clarity loop" with ambiguity formula, slot table, 5-round cap, output schema. Add §"Tickets" with split rule and `T-NNN.md` template. |
| `agents/variants/*/pdt-developer.md` | No behavior change, only doc note: "Designer hands you the ticket; PO routes." |
| `agents/variants/*/pdt-qa.md` | Same as Developer. |

### Phase 3 — Hook surgery
| Hook | Action |
|---|---|
| `pre-delegate-task-check.sh` | Strip R3 logic. Keep R1 auto-fill (already option B). Keep R2 archive enforcement. |
| `post-delegate-state-write.sh` | No change. |
| `post-edit-format.sh` | No change (developer/designer sessions still use it). |
| `post-compact-doctrine.sh` | Update doctrine reload list — remove R3 references. |
| `stop-verify.sh` | No change. |
| `scripts/install.sh` | Remove R3 from settings.json hook merge if it was a separate entry; otherwise no-op. |

### Phase 4 — Wrapper + engine policy
| File | Change |
|---|---|
| `scripts/productune` | At PO spawn time, print primary/secondary line: `engine=claude (primary) · codex available as secondary, doctrine-only`. Default `MY_PO_ENGINE=claude` unchanged. |
| `codex/config.toml` | Note in profile description: "secondary engine — hooks do not fire; doctrine R1/R2/R3/R4 are advisory only on this engine." |

### Phase 5 — Migration + smoke
1. Re-deploy doctrine via `bash scripts/install.sh`.
2. From `ntf-archive` cwd, run `productune` → describe a fresh idea.
3. Expect: PO opens interview using `pm-product-discovery:interview-script`, synthesizes brief, then `→ delegating pdt-designer (PRD authoring, opus/max — clarity loop)`. Designer runs the loop and ships PRD with `ambiguity_score ≤ 0.05`.
4. Verify `claude --print --output-format json` invocation log shows `--model opus` for the Designer call regardless of PO's main-session model.
5. Run `productune --engine codex` smoke: PO behaves the same (orchestrator only), no hook traces. Doctrine should hold without enforcement.

### Phase 6 — Calibration & follow-up
- After 5 real PRDs, audit `~/.productune/po-memory.md` `## Model/Effort Calibration` log — ensure Designer-PRD entries dominate `opus/max`, PO entries are `po-direct/n-a` or absent.
- If clarity loop hits 5-round cap > 30% of sessions, lower target from 0.05 → 0.08 *or* change slot weights.
- Schedule ambient cleanup PR for any leftover R3 references in 1 week.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Sub-agent spawn cost dominates for trivial edits (typo in README). | OQ-5 says no PO-direct work. Acceptable cost; revisit only if calibration shows >40% wall time on spawn for trivial-only sessions. |
| Designer clarity loop runs forever on under-specified ideas. | 5-round hard cap → PRD with Open Questions → user surfaces. |
| Ambiguity score is subjective. | Slot weights are public; calibration log records the score per PRD; recalibrate weights monthly if drift. |
| Codex secondary diverges from primary because hooks don't fire. | Doctrine is now narrow enough that R2 (archive) is the only gate that matters; R2 is enforceable in doctrine-only too (PO refuses delegation if archive missing — codex follows the same rule). |
| Persona doctrine update breaks live `[ctx]` parsing. | Backwards compat: personas already fall back to `jq` re-read when `[ctx]` is absent. |

---

## 6. Out of scope (explicit)

- Sub-agent persistence / daemon mode (separate effort if cold-start ever bites).
- Removing graphiti from frontmatter `mcpServers` for lightweight tasks (separate effort).
- Multi-PO parallel orchestration.

---

## 7. Approval gates

- [ ] User approves OQ resolutions in §1 (this doc).
- [ ] User approves model defaults in Phase 1 routing change.
- [ ] User approves R3 deletion (Phase 3).
- [ ] User approves codex secondary policy (Phase 4).

PR is **not** opened automatically. PO surfaces a unified diff per phase for user review on demand.
