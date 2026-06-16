---
ticket_id: T-PATCH-154
version: v0.5
slug: doctrine-active-scratch-reconcile
title: doctrine 정합 — 활성 current_task scratch 허용 (canonical-14=rest shape, brief=durable home), §84/§90/v2 invariant/T-152 일관화
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [core-doctrine, tier0-edit, mirror-sync, walks-back-recent]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-154: doctrine 정합 — 활성 scratch 허용

doctrine 편집 = designer. 최근 변경(T-139 canonical-14, T-146 shape-gate, T-152 work-state-home)을 **일관된 최종 상태**로 정합. PO가 반환 후 Tier0 mirror 동기화 + grill(walks-back이라 GRILL 필수).

## 일관된 최종 상태 (이것으로 통일)

- po-state `current_task`는 **활성 task 동안 work-state scratch(progress/decisions/next/carry/plan)를 추가로 들고 있어도 됨**. canonical-14는 **포인터 필드 집합 + rest(task 없음) shape** 으로 재정의 — 활성 task엔 추가 scratch 허용.
- task close 시 `current_task → null`(기존) → scratch 소멸. 그래서 누적 drift 없음(past_tickets 클래스와 다름).
- **durable/cross-session SoT = brief(`briefs/<slug>.md`)** — po-state scratch는 same-session 편의 캐시(권위 아님). resume 신뢰성은 brief에서.
- **past_tickets = 여전히 금지**(ticket .md = SoT), schema_version=2 강제, current_task.status canonical enum 강제 — 불변.

## Edits (designer가 실제 문구/배치 판단)

1. **delegation.md §84/§90** (Tier0): "current_task 정확히 14필드 / write nothing outside it / no freeform scratchpad" → "14필드 = 포인터; 활성 task는 work-state scratch 추가 허용(close 시 null로 소멸); durable home은 brief" 로 정정. (이전의 엄격 금지 문구 완화.)
2. **state-hygiene.md v2 invariant + T-152 'Work-state home=brief' 절** (Tier0): migrate가 **활성 current_task scratch를 strip하지 않음**(past_tickets만 drop)으로 정정. "shrink expected/복원금지" 서술은 **past_tickets/v1→v2 한정**으로 축소(활성 scratch는 이제 안 줄어듦). brief=durable home은 유지하되 "po-state scratch 금지"는 "scratch는 ephemeral 캐시로 허용, brief가 SoT"로 완화.
3. 세 군데(§84/§90, v2 invariant, T-152절)가 **서로 모순 없게** — 한 번에 일관화. T-139/T-146/T-151/T-152 참조 주석 갱신.

## Acceptance
- AC-1: 위 일관 상태가 delegation.md + state-hygiene.md에 반영, 세 절 상호 모순 0.
- AC-2: past_tickets 금지 / schema=2 / status enum 강제는 명확히 유지(완화 대상 아님).
- AC-3: Tier0 변경분 ~/.productune mirror byte-identical(PO cp+diff, 변경된 모든 파일).
- AC-4: T-PATCH-153(훅) 동작과 doctrine 서술 일치.

## Note
- walks-back recent doctrine → PO가 GRILL로 검증(loss-risk/모순 점검). additive 아님(기존 문구 정정 포함).
- designer는 SoT만; mirror는 PO.
