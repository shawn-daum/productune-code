# Model + Effort routing

PO picks model (haiku/sonnet/opus) + effort (low/medium/high/xhigh) per persona call. Decision is dynamic — frontmatter `model:` is just fallback.

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

OSS reference: LLMRouter, vLLM Semantic Router, LiteLLM, NVIDIA llm-router all use the same 7-level hierarchy.

## Per-persona complexity floor

| Persona | Floor | Default tier | Rationale |
|---|---|---|---|
| **productune** (PO) | L6 Analysis | opus (Why-essential only; sonnet otherwise) | routing / impact mapping / risk judgement |
| **pdt-designer** | L5 Generation | sonnet (Why-essential → opus + ⚡xhigh) | design docs / specs |
| **pdt-developer** | L5 Generation | sonnet | code authoring |
| **pdt-qa** | L2 Classification | haiku | pass/fail classification + command execution |

Each persona's frontmatter `model:` is a direct-call fallback. PO uses floor + signals for dynamic selection.

## Step-up / step-down signals

**Step-up** (L → L+1 or L+2):
- artifacts ≥3 files or different directory trees (cross-cutting)
- risk-area flag (auth / payments / PII / migration / design system / public API)
- task keywords: "아키텍처", "리팩터", "전반", "시스템", "i18n", "디자인 시스템", "마이그레이션"
- own decompose result is L≥6
- recent_turns has same persona fail accumulation ≥2 (auto weight)
- risk-area + cross-cutting together → auto-escalate to ⚡xhigh

**Step-down** (L → L-1):
- single file / single string / one line / obvious typo
- user tone ("간단", "빠르게", "그냥", "단순")
- own decompose returns 1-step trivial
- recent_turns shows same task class passing at default tier ≥3 times

## Effort 4-tier (xhigh protection)

| Effort | Thinking budget | Use |
|---|---|---|
| `low` | nearly off | simple sweep, smoke test |
| `medium` | default extended thinking | normal cases |
| `high` | extended thinking budget | hypothesis test, trade-off |
| **`xhigh`** | **max thinking + multi-pass reasoning** | **product design (PRD/UX/DS net-new), repeated debugging, system-level decisions** |

`xhigh` protection rules:
- `xhigh` is **opus-only**. sonnet+xhigh / haiku+xhigh: PO confirms once and auto-promotes to opus.
- `xhigh` trace emphasizes the choice: `→ delegating to pdt-developer (model=opus, effort=⚡xhigh — turn-3 debugging)`.
- `xhigh` calls flag separately in `recent_turns` (`effort: "xhigh"`) for cost retrospectives.

## Decision algorithm (per call)

```
1. Collect task_signals (artifacts, risk flags, recent_turns, keywords, own decompose).
2. Start at persona_floor (L).
3. Apply signals to adjust L (cap: L1, L7).
4. Map L → tier (table above).
5. Decide effort (right column).
6. recent_turns auto-weight: same task / same persona fail ≥2 → tier+1.
7. xhigh auto-trigger: risk+cross-cutting / Why-essential / 3-turn debug / Path 1 second retry.
8. Apply user prefix override (`/model`, `/effort`, `/dev:opus/xhigh`, etc.).
9. Emit trace.
10. Append to po-state.json `persona_session_meta.<X>.{model_history, effort_history, complexity_level}`.
```

Trace format:
```
→ delegating to pdt-<persona> (L<n> <name>, model=<tier>, effort=<level> — reason: <one-line>)
```

User-friendly synonyms (optional):
- low="빠르게", medium="보통", high="신중히", xhigh="아주 신중히 / 깊이"
- confidence: low="자신 없어요", medium="조금 자신 없어요", high="자신 있어요"

OSS reference (cascade routing): RouteLLM, C3PO, Maxim AI 3-tier cascade.
