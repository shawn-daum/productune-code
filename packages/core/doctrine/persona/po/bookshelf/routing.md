# Routing — model + effort, and its calibration

Pick model (haiku/sonnet/opus) × effort (low/medium/high/xhigh/max) per persona call. Decide
dynamically — frontmatter `model:` is fallback only; each pick feeds the calibration log (bottom), which biases your next one.

## 7-level task complexity

| L | Definition | Tier | Effort |
|:--|:--|:--|:--|
| L1 Extraction | pull structured data | haiku | low |
| L2 Classification | fixed categories | haiku | low |
| L3 Transformation | reformat / translate | haiku | medium |
| L4 Summarization | compression | sonnet | medium |
| L5 Generation | new content | sonnet | medium |
| L6 Analysis | multi-factor reasoning | opus | medium–high |
| L7 Synthesis | combine multi-source | opus | high–xhigh |

## Per-persona floor

| Persona | Floor | Default | Why |
|:--|:--|:--|:--|
| Designer (PRD R1 MVP) | L7 | opus + max | net-new clarity loop |
| Designer (PRD R2+) | L6 | opus + xhigh | incremental |
| Designer (single screen / DS) | L6 | opus + xhigh | spec authoring |
| Designer (token / DS compliance) | L4 | sonnet / medium | plan-driven |
| Developer | L5 | sonnet / medium | code authoring (plan = opus / xhigh) |
| QA | L2 | haiku / low | pass/fail + cmd |

## Step-up signals (L → L+1 or +2)

- artifacts ≥3 / cross-cutting dirs
- risk area (auth / payments / PII / migration / DS / public API)
- intent keywords (any lang): architecture · refactor · system-wide · i18n · design system · migration
- own decompose L≥6
- `recent_turns` same persona fail ≥2 (in-version weight)
- risk + cross-cutting → auto xhigh

## Step-down signals (L → L-1)

- single file / string / line, obvious typo
- user tone ("simple", "quickly", "just", "minimal" — any lang)
- decompose = 1-step trivial
- `recent_turns` passing at default ≥3

## Effort 5-tier

| Effort | Budget | Use |
|:--|:--|:--|
| `low` | nearly off | smoke / lint / L1–L3 trivial |
| `medium` | default extended | sonnet baseline |
| `high` | extended | hypothesis testing · sonnet impl-after-plan · opus standard |
| `xhigh` | max + multi-pass | opus default · plan authoring · refactor |
| `max` | deepest | **R1 MVP PRD · net-new DS · system arch** |

Per-model defaults: haiku=low · sonnet=medium · **opus=xhigh** (always).

## `xhigh` / `max` rules

- Both opus-only. sonnet/haiku + xhigh|max → auto-promote opus (confirm once).
- `max` is **Step 1 routing only** — never reached by a recovery retry (`bookshelf/escalation.md`).
- `max` auto-trigger: PRD R1 MVP (`A ≤ 0.05`) · net-new system DS · system architecture.
- `xhigh` auto-trigger: any opus call · developer plan L≥4 · a model-up recovery retry from `high`.
- Flag `effort:"xhigh"|"max"` in `recent_turns` for cost retro.

## Recovery on a bad result

Low confidence / `unresolved` / `blocked` / user rework → run 3-strike recovery; detail
`bookshelf/escalation.md`. A model-up strike bumps one notch, never to `max`.

## Decision algorithm

1. Collect signals: artifacts · risk · `recent_turns` · intent keywords · own decompose · calibration 3-tuple match.
2. Start at the persona floor.
3. Apply step-up / step-down signals; clamp to L1–L7.
4. L → tier (table above).
5. Effort = per-model default, then adjust per signals.
6. `max` auto-trigger (Step 1 only): PRD R1 / net-new DS / system arch.
7. User prefix override (`/model`, `/effort`, `/dev:opus/max`).
8. Emit the trace.

Trace: `→ delegating pdt-<persona> (L<n> <name>, model=<tier>, effort=<level> — reason: <line>)`.

## User-facing phrasing (render in user lang)

- effort: low="quick" · medium="balanced" · high="careful" · xhigh="very careful" · max="exhaustive"
- confidence: low="not sure" · medium="somewhat sure" · high="confident"

## Calibration — the feedback loop

This cross-project weight is separate from the in-version `recent_turns` weight above.

Data: per-task live in `.productune/po-state.json :: current_task.calibration_outcome`
(drops with `current_task = null`); cross-project rolling in
`~/.productune/po/bookshelf/calibration-log.md`, 1 line per task.

### Read (turn open, mandatory)

Scan the last 10–20 entries. Match by 3-tuple `(persona, complexity_class, area_tag)` —
persona ∈ `pdt-{designer,developer,qa}`; complexity_class `L1-single`…`L7-net-new`;
area_tag = task domain (`auth`, `payments`, `refactor-cross-cut`, `prd-r1`, …). All 3 match →
high weight; 2/3 → moderate; 1/3 → ignore. Similar tasks historically needing estimate+1 →
start one notch higher. 3+ deviating entries on the same 3-tuple → auto +1 next dispatch.

### Write (task close, mandatory)

Append 1 line only when the task archives `done | blocked | abandoned` AND deviates (estimate
≠ actual OR escalation triggered OR user rework). Smooth pass (estimate == actual) → no entry.

```
- (YYYY-MM-DD) <persona> · <complexity_class> · <area_tag> · estimate=<model>/<effort> → actual=<model>/<effort> · QA <pass|fail>(<loops>) · rework=<y|n> · internal_redo=<n> · escalation=<none|skill|model|surface> · note: <one-line>
```

```
- (2026-04-29) pdt-developer · L6-multifile · auth-refactor · estimate=sonnet/medium → actual=opus/xhigh · QA pass(1) · rework=n · internal_redo=0 · escalation=model · note: cross-cutting needed opus
```

Field rules:
- `estimate` — your Step 1 first-call model/effort, before any recovery.
- `actual` — last actually-used. `actual=opus/max` implies a Step 1 choice (`max` never comes from recovery).
- `QA pass(N)` — final pdt-qa result + loop count. `n/a` for no-QA tasks.
- `rework=y` — user feedback demanded a redo ("redo" / "no good" — any lang); user-driven only, never a PO-internal redo.
- `internal_redo=<n>` — count of your own re-invocations (same persona/task) for spec mismatch; 0 if none.
- `escalation=skill|model|surface|none` — which strike resolved it, by name; `max` never appears.
- `note` — 1-line judgement.
- model/effort literals only: `haiku/low`, `sonnet/medium`, `sonnet/high`, `opus/xhigh`, `opus/max`. Never `default` / `normal` / `extended`.
- Plan-first tasks: log the impl phase's model/effort (final substantive call); the plan phase lives in `persona_session_meta.<persona>.effort_history`.

Append (mechanical):

```bash
LINE="- ($(date -u +%F)) ..."   # fill per format
printf '%s\n' "$LINE" >> ~/.productune/po/bookshelf/calibration-log.md   # single append, no race
```

### Archive-rotate (cap 100 lines)

When `calibration-log.md` > 100 lines, clean at next turn open:
1. Same-3-tuple duplicates → keep the most recent.
2. Entries > 1 year → move to `## Model/Effort Calibration (archived)`.
3. Still > 100 → mark the oldest `[SUPERSEDED <date>]`.
