# Model + Effort routing

PO picks model (haiku/sonnet/opus) + effort (low/medium/high/xhigh/max) per persona call. Dynamic — frontmatter `model:` is fallback only.

## 7-level task complexity hierarchy (OSS standard)

| Level | Definition | Model | Effort |
|---|---|---|---|
| L1 Extraction | Pull structured data from text | haiku | low |
| L2 Classification | Classify into fixed categories | haiku | low |
| L3 Transformation | Simple reformat / translation | haiku | low–med |
| L4 Summarization | Information compression | sonnet | low–med |
| L5 Generation | Produce new content | sonnet | medium |
| L6 Analysis | Multi-factor reasoning | opus | medium–high |
| L7 Synthesis | Combine multiple sources | opus | high–⚡xhigh |

OSS reference: LLMRouter, vLLM Semantic Router, LiteLLM, NVIDIA llm-router — all same 7-level hierarchy.

## Per-persona complexity floor

| Persona | Floor | Default | Rationale |
|---|---|---|---|
| **PO (orchestrator)** | L4 Summarization | sonnet (medium) | Routing/synthesis only. Main session cheap. |
| **pdt-designer (PRD R1 MVP)** | L7 Synthesis | **opus + ⚡max** | Net-new product PRD with clarity loop. |
| **pdt-designer (PRD R2+)** | L6 Analysis | opus + ⚡xhigh | Incremental on settled vision. |
| **pdt-designer (design docs, single screen/component)** | L6 Analysis | opus + ⚡xhigh | Spec authoring. |
| **pdt-designer (token-mapping / DS compliance)** | L4 Summarization | sonnet (medium) | Plan-driven simple change. |
| **pdt-developer** | L5 Generation | sonnet (medium) | Code authoring. Plan phase (L4+) bumps to opus + ⚡xhigh. |
| **pdt-qa** | L2 Classification | haiku (low) | Pass/fail + command exec. |

Each persona's frontmatter `model:` = direct-call fallback. PO uses floor + signals for dynamic.

**PO defaults sonnet/medium** — orchestrator role (interview, route, synthesize) needs no deep reasoning. Sub-agent calls explicitly elevate per task. Rework's central gain: model selection follows work, not session.

## Step-up / step-down signals

**Step-up** (L → L+1 or L+2):
- artifacts ≥3 files or different directory trees (cross-cutting)
- risk-area flag (auth / payments / PII / migration / design system / public API)
- task keywords: "아키텍처", "리팩터", "전반", "시스템", "i18n", "디자인 시스템", "마이그레이션"
- own decompose result is L≥6
- recent_turns same persona fail accumulation ≥2 (auto weight)
- risk-area + cross-cutting together → auto-escalate to ⚡xhigh

**Step-down** (L → L-1):
- single file / single string / one line / obvious typo
- user tone ("간단", "빠르게", "그냥", "단순")
- own decompose returns 1-step trivial
- recent_turns same task class passing at default tier ≥3 times

## Effort 5-tier

| Effort | Thinking budget | Use |
|---|---|---|
| `low` | nearly off | smoke tests, lint/build/test, L1–L3 trivials |
| `medium` | default extended thinking | sonnet baseline, ordinary cases |
| `high` | extended thinking | hypothesis testing, trade-offs, **sonnet impl-after-plan**, opus standard |
| `xhigh` | max thinking + multi-pass reasoning | **opus default**, plan authoring, architecture refactor, repeated debugging |
| **`max`** | **deepest reasoning beyond xhigh** | **first-round MVP PRD, net-new design system / brand identity, system-level architecture decisions** |

### Per-model defaults

| Model | Default effort | Notes |
|---|---|---|
| `haiku` | `low` | classification / simple ops |
| `sonnet` | `medium` | spec-driven impl / 일반 |
| `opus` | **`xhigh`** | every opus call is xhigh by default |

### `xhigh` / `max` rules

- Both `xhigh` + `max` are **opus-only**. sonnet/haiku + xhigh|max → PO confirms once + auto-promotes to opus.
- `max` reserved for **Stage 1 routing only** (PO chooses for net-new product/system thinking). **Not** reachable via Path 1 escalation — see `escalation.md`.
- `max` auto-trigger conditions (PO chooses):
  - **pdt-designer Why-essential — first-round MVP PRD authoring** (`docs/prd/<slug>.md`) with clarity loop A ≤ 0.05
  - pdt-designer Why-essential — net-new system-level design (UX principles + brand identity + design system from scratch)
  - pdt-developer How — system-level architecture decisions, post-3-turn debugging where xhigh isn't enough
- `xhigh` auto-trigger:
  - Any opus call (default)
  - pdt-developer plan-only phase for L≥4 (`delegation.md`)
  - Path 1 retry from `high` (`escalation.md`)
- `max` + `xhigh` traces emphasize choice:
  ```
  → delegating to pdt-developer (model=opus, effort=⚡max — net-new architecture)
  → delegating to pdt-developer (model=opus, effort=⚡xhigh — plan phase L5)
  ```
- Both flagged separately in `recent_turns` (`effort:"xhigh"` / `effort:"max"`) for cost retro.

## Decision algorithm (per call)

```
1. Collect task_signals (artifacts, risk, recent_turns, keywords, decompose).
2. Start at persona_floor (L).
3. Apply signals to L (cap: L1, L7).
4. Map L → tier (table).
5. Effort: per-model default → adjust by signals.
6. recent_turns auto-weight: same task / persona fail ≥2 → tier+1.
7. xhigh auto-trigger: opus default, plan phase L≥4, Path 1 second retry.
8. max auto-trigger: PRD R1 / net-new DS / system arch (Stage 1 only — never escalation).
9. User prefix override (`/model`, `/effort`, `/dev:opus/max`, etc.).
10. Emit trace.
11. Append to po-state.json `persona_session_meta.<X>.{model_history, effort_history, complexity_level}`.
```

Trace:
```
→ delegating to pdt-<persona> (L<n> <name>, model=<tier>, effort=<level> — reason: <one-line>)
```

Synonyms (optional):
- low="빠르게", medium="보통", high="신중히", xhigh="아주 신중히 / 깊이", max="끝까지 / 깊게 사고"
- confidence: low="자신 없어요", medium="조금 자신 없어요", high="자신 있어요"

OSS ref (cascade routing): RouteLLM, C3PO, Maxim AI 3-tier cascade.
