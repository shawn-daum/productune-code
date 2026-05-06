# Model + Effort routing

PO picks model (haiku/sonnet/opus) + effort (low/medium/high/xhigh/max) per persona call. Dynamic — frontmatter `model:` = fallback.

## 7-level task complexity (OSS standard)

| Level | Definition | Model | Effort |
|---|---|---|---|
| L1 Extraction | Pull structured data | haiku | low |
| L2 Classification | Fixed categories | haiku | low |
| L3 Transformation | Reformat/translate | haiku | low–med |
| L4 Summarization | Compression | sonnet | low–med |
| L5 Generation | New content | sonnet | medium |
| L6 Analysis | Multi-factor reasoning | opus | medium–high |
| L7 Synthesis | Combine multiple sources | opus | high–⚡xhigh |

OSS ref: LLMRouter, vLLM Semantic Router, LiteLLM, NVIDIA llm-router.

## Per-persona complexity floor

| Persona | Floor | Default | Rationale |
|---|---|---|---|
| **PO** | L4 | sonnet/medium | Routing/synthesis only |
| **pdt-designer (PRD R1 MVP)** | L7 | **opus + ⚡max** | Net-new with clarity loop |
| **pdt-designer (PRD R2+)** | L6 | opus + ⚡xhigh | Incremental on settled vision |
| **pdt-designer (design docs single screen)** | L6 | opus + ⚡xhigh | Spec authoring |
| **pdt-designer (token/DS compliance)** | L4 | sonnet/medium | Plan-driven simple |
| **pdt-developer** | L5 | sonnet/medium | Code authoring. Plan phase L4+ → opus + ⚡xhigh |
| **pdt-qa** | L2 | haiku/low | Pass/fail + cmd exec |

PO defaults sonnet/medium — orchestrator role. Sub-agent calls explicitly elevate.

## Step-up / step-down signals

**Step-up** (L → L+1 / L+2):
- artifacts ≥3 / cross-cutting dirs
- risk-area (auth / payments / PII / migration / DS / public API)
- keywords: "아키텍처", "리팩터", "전반", "시스템", "i18n", "디자인 시스템", "마이그레이션"
- own decompose L≥6
- recent_turns same persona fail ≥2
- risk-area + cross-cutting → auto ⚡xhigh

**Step-down** (L → L-1):
- single file/string/line, obvious typo
- user tone ("간단", "빠르게", "그냥", "단순")
- decompose 1-step trivial
- recent_turns passing at default ≥3 times

## Effort 5-tier

| Effort | Thinking budget | Use |
|---|---|---|
| `low` | nearly off | smoke, lint/build/test, L1–L3 trivial |
| `medium` | default extended | sonnet baseline, ordinary |
| `high` | extended | hypothesis testing, **sonnet impl-after-plan**, opus standard |
| `xhigh` | max + multi-pass | **opus default**, plan authoring, refactor, repeated debug |
| **`max`** | **deepest beyond xhigh** | **R1 MVP PRD, net-new DS / brand identity, system arch** |

### Per-model defaults

| Model | Default effort |
|---|---|
| `haiku` | `low` — classification / simple ops |
| `sonnet` | `medium` — spec-driven impl / 일반 |
| `opus` | **`xhigh`** — every opus call xhigh by default |

### `xhigh` / `max` rules

- Both opus-only. sonnet/haiku + xhigh|max → PO confirms once + auto-promote opus.
- `max` reserved for **Stage 1 routing only** (net-new product/system thinking). **Not** reachable via Path 1 escalation (`escalation.md`).
- `max` auto-trigger:
  - **pdt-designer Why-essential — R1 MVP PRD** (`docs/prd/<slug>.md`) with clarity A ≤ 0.05
  - pdt-designer Why-essential — net-new system-level design (UX + brand + DS from scratch)
  - pdt-developer How — system-level architecture, post-3-turn debug where xhigh fails
- `xhigh` auto-trigger: any opus call · pdt-developer plan-only L≥4 · Path 1 retry from `high`
- Trace:
  ```
  → delegating to pdt-developer (model=opus, effort=⚡max — net-new architecture)
  → delegating to pdt-developer (model=opus, effort=⚡xhigh — plan phase L5)
  ```
- Both flagged separately in `recent_turns` (`effort:"xhigh"` / `"max"`) for cost retro.

## Decision algorithm

```
1. Collect task_signals (artifacts, risk, recent_turns, keywords, decompose).
2. Start at persona_floor (L).
3. Apply signals (cap: L1, L7).
4. L → tier (table).
5. Effort: per-model default → adjust.
6. recent_turns auto-weight: same task/persona fail ≥2 → tier+1.
7. xhigh auto-trigger: opus default, plan L≥4, Path 1 second retry.
8. max auto-trigger: PRD R1 / net-new DS / system arch (Stage 1 only).
9. User prefix override (`/model`, `/effort`, `/dev:opus/max`).
10. Emit trace.
11. Append to po-state.json `persona_session_meta.<X>.{model_history, effort_history, complexity_level}`.
```

Trace: `→ delegating to pdt-<persona> (L<n> <name>, model=<tier>, effort=<level> — reason: <one-line>)`

Synonyms: low="빠르게", medium="보통", high="신중히", xhigh="아주 신중히 / 깊이", max="끝까지 / 깊게 사고". confidence: low="자신 없어요", medium="조금 자신 없어요", high="자신 있어요".

OSS ref (cascade): RouteLLM, C3PO, Maxim AI 3-tier.
