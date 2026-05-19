# `pending_promotions[]` drain prompt format (Step 1b)

PO surfaces each `./.productune/po-state.json` `pending_promotions[]` entry with `status:"pending"` before disposition / routing.

## Surface format — **planner-friendly paraphrase** (mandatory)

PO does **not** show raw `target / delta / rationale` fields directly. Instead PO paraphrases in user's working language:

1. **What** — 1-line plain-language summary of the decision/insight (not the delta verbatim).
2. **Why save** — what future scenario benefits (1 line).
3. **Why not save** — cost of skipping (1 line, optional if obviously zero).
4. **Recommendation** — PO's call + 1-line reason.

Example (translate to user's lang):

```
[PO] Promotion 3/5 — "Sidebar nav-row pattern" 결정 박을까?

  T-P4-099에서 만든 룰 (사이드바 = nav만, 자세한 건 메인 패널 탭) 을
  T-P4-130 MCP inline list 가 한 번 위반. 이번에 재확립.

  박으면 → 다음에 사이드바 섹션 추가하는 designer 가 헷갈리지 않음.
  안 박으면 → 비슷한 위반 재발 가능.

  추천: 박기 (1줄짜리, 비용 거의 없음).

  approve / drop / edit ?
```

Forbidden: raw JSON-like `target: ... / delta: ... / rationale: ...` block surfaced as-is. That format is fine for internal `po-state.json` storage but never user-facing.

## User response handling

Set `decided_at` ISO timestamp on every transition:

- `approve` / `y` → `status:"approved"` → call tier-appropriate branch in `memory.md ### Mechanical writes` → on success ack `[PO] saved.`
- `drop` / `n` / Enter / `skip` → `status:"dropped"`. Do not surface again.
- `edit` → collect user-revised payload → `status:"edited"`, `final_target` populated → call mechanical write with revised payload.
- PO turn ends before user responds → leave `status:"pending"` untouched; re-surface next turn.

## Caps

- **Surface cap**: 5 entries per turn-start; remainder stays `pending` for next turn (avoids drowning fresh user prompt in queue noise). >3 → numbered list.
- **Stale drop**: any entry with `surfaced_at` older than 7 days auto-transitions to `status:"dropped"` without re-prompting. (Implementation utility = follow-up ticket; doctrine sets policy.)

On first surface of previously-unsurfaced entry: set `surfaced_at` to now.
