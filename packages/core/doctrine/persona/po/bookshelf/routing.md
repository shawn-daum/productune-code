# Routing — model + effort

Pick model (haiku/sonnet/opus) × effort (low/medium/high/xhigh/max) per persona call.
Decide dynamically — frontmatter `model:` is fallback only.

## 7-level task complexity

| L | Definition | Tier | Effort |
|:--|:--|:--|:--|
| L1 Extraction | pull structured data | haiku | low |
| L2 Classification | fixed categories | haiku | low |
| L3 Transformation | reformat / translate | haiku | low–med |
| L4 Summarization | compression | sonnet | low–med |
| L5 Generation | new content | sonnet | medium |
| L6 Analysis | multi-factor reasoning | opus | medium–high |
| L7 Synthesis | combine multi-source | opus | high–xhigh |

## Per-persona floor

| Persona | Floor | Default | Why |
|:--|:--|:--|:--|
| PO | L4 | opus / xhigh | orchestration |
| Designer (PRD R1 MVP) | L7 | **opus + max** | net-new clarity loop |
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
- `recent_turns` same persona fail ≥2
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
- `max` = **Step 1 routing only**. Not reachable via Strike 2 model-up escalation (see `escalation.md`).
- `max` auto-trigger: PRD R1 MVP (`A ≤ 0.05`) · net-new system DS · system architecture.
- `xhigh` auto-trigger: any opus call · developer plan L≥4 · Strike 2 (model-up) retry from `high`.
- Flag separately in `recent_turns` (`effort:"xhigh"` / `"max"`) for cost retro.

## Escalation ladder (3-strike → see `escalation.md`)

Strike 1 = skill search (auto-install top match, re-invoke same session).
Strike 2 = model up + effort up (haiku→sonnet→opus, low→medium→high→xhigh; **never max**).
Strike 3 = user surface (present alternatives, user chooses).
Strikes 1–2 automatic; user asked only at Strike 3. One attempt per strike, auto 1→2→3.

## Decision algorithm

1. Collect signals (artifacts, risk, recent_turns, keywords, decompose).
2. Start at persona_floor.
3. Apply signals (cap L1, L7).
4. L → tier (table above).
5. Effort per-model default → adjust.
6. `recent_turns` auto-weight: same task/persona fail ≥2 → tier+1.
7. `xhigh` auto-trigger: opus default · plan L≥4 · Strike 2 model-up retry from high.
8. `max` auto-trigger: PRD R1 / net-new DS / system arch (Step 1 only).
9. User prefix override (`/model`, `/effort`, `/dev:opus/max`).
10. Emit trace.

Trace: `→ delegating pdt-<persona> (L<n> <name>, model=<tier>, effort=<level> — reason: <line>)`.

User-facing phrasing (render in user lang):
- effort: low="quick" · medium="balanced" · high="careful" · xhigh="very careful" · max="exhaustive"
- confidence: low="not sure" · medium="somewhat sure" · high="confident"
