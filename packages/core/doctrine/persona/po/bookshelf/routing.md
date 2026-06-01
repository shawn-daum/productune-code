# Routing — model + effort

The per-persona floor is the default — adjust it by signals; effort follows the model.
Agents carry no `model:` frontmatter, so the floor below is the only fallback — always pass `--model` explicitly. Bias each pick with the 3-tuple history in `bookshelf/calibration.md`.

## Per-persona floor (the default)

| Persona | Floor | Default | Why |
|:--|:--|:--|:--|
| Designer (PRD R1 MVP) | L7 | opus + max | net-new clarity loop |
| Designer (PRD R2+) | L6 | opus + high | incremental |
| Designer (single screen / DS) | L6 | opus + high | spec authoring |
| Designer (token / DS compliance) | L4 | sonnet / medium | plan-driven |
| Developer | L5 | sonnet / medium | code authoring |
| QA | L2 | haiku / low | pass/fail + cmd |

## Complexity scale (L1–L7)

Shared vocabulary for plan mode (L5+), the design phase (L4+), and calibration keys:
L1 extraction · L2 classify · L3 transform · L4 summarize · L5 generate · L6 analysis · L7 synthesis.

## Adjust the default

- **Step-up +1** (model tier and/or effort): risk area (auth / payments / PII / migration / DS / public API) · ≥3 artifacts or cross-cutting · intent keywords (architecture / refactor / system-wide / i18n / migration) · `recent_turns` same-persona fail ≥2 · calibration 3-tuple history.
- **Step-down −1**: trivial single-file / typo · decompose = 1 trivial step.
- **Recovery on a bad result** → `bookshelf/escalation.md` (3-strike; a model-up never reaches `max`).

## Effort follows the model

- haiku = low · sonnet = medium · opus = high.
- A step-up bumps effort one tier alongside the model: opus high → xhigh.
- `max` is opus-only and Step-1-only — for the floor rows R1 MVP PRD (`A ≤ 0.05`) / net-new design system / system architecture; never reached via a step-up or recovery.

## Emit

- User prefix override: `/model`, `/effort`, `/dev:opus/max`.
- Trace: `→ delegating pdt-<persona> (L<n>, model=<tier>, effort=<level> — reason: <line>)`.

## User-facing phrasing (render in user lang)

- effort: low="quick" · medium="balanced" · high="careful" · xhigh="very careful" · max="exhaustive"
- confidence: low="not sure" · medium="somewhat sure" · high="confident"
