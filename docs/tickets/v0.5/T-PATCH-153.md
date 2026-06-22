---
ticket_id: T-PATCH-153
version: v0.5
slug: po-state-active-scratch-hooks
title: po-state 훅 — 활성 current_task scratch 보존 (migrate 미strip + write-guard 허용), past_tickets/schema/status는 유지
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [core-tooling, session-start-hook, pretooluse-guard, all-project-affecting]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-153: 활성 task scratch 보존 (2 훅)

## 결정 (user 2026-06-16)

po-state `current_task`는 **활성 task 동안 work-state scratch(progress/decisions/next/carry 등)를 들고 있어도 됨**. canonical-14는 **rest 상태(task 없음)** 의 shape. task close 시 `current_task → null`(기존 doctrine)이라 scratch는 그때 사라짐. **durable/cross-session SoT는 여전히 brief** — po-state scratch는 same-session 편의 캐시.

근본 문제: migrate 훅(세션시작)이 매번 활성 scratch를 strip → PO가 복원 → 루프. + write-guard가 비표준 current_task 필드 write를 block → scratch 쓰기 자체가 막힘.

## 변경 1 — migrate 훅: 활성 current_task strip 중단

`packages/core/scripts/hooks/session-start-po-state-migrate.sh`:
- shape 게이트의 `needs_cleanup` 조건에서 **"current_task가 canonical-14 밖 key 보유"** + **"current_task has stage"** 조건 **제거**. → needs_cleanup = `schema_version<2 (or non-numeric/float, T-146 유지)` OR `past_tickets present` 만.
- jq 변환에서 **current_task whitelist strip(`with_entries(...)`) 제거**. stage→type rename도 제거(이제 scratch 보존이므로 불필요 — stage 그대로 둠). 변환 = `del(.past_tickets) | .schema_version = 2` 만.
- past_tickets drop + schema stamp + 모든 안전장치(.bak/검증/복원/no-op/reworded 메시지 T-151) **유지**. clean(past_tickets 없고 schema=2 numeric) = strict no-op 유지.

## 변경 2 — write-guard: 비표준 current_task 필드 허용

`packages/core/scripts/hooks/pre-po-state-shape-guard.sh`:
- **"unknown current_task sub-field outside canonical-14 whitelist" block(field:* / emit_block_field) 제거** — 활성 scratch 필드 write 허용.
- **유지(계속 block)**: `schema_version < 2`(non-2), `past_tickets` write, `current_task.status` 비-canonical enum. 이 셋은 그대로 가드.
- canonical-14 whitelist 상수가 더이상 안 쓰이면 정리(status enum 가드는 별개로 유지).
- cardinal rule(over-block = outage) 준수 — 허용 넓히는 방향이라 안전.

## Acceptance
- AC-1: migrate 훅 — v2 + past_tickets fixture → past_tickets만 drop, current_task scratch(progress 등) **보존**. clean(no past_tickets, schema=2) = strict no-op.
- AC-2: migrate 훅 — v1 fixture → schema=2 stamp + past_tickets drop, current_task scratch 보존.
- AC-3: write-guard — current_task에 비표준 필드(progress 등) 있는 Write → **허용(exit 0)**.
- AC-4: write-guard — schema_version:1 / past_tickets write / current_task.status="qa"(비enum) → 여전히 **block(exit 2)**.
- AC-5: 둘 다 `bash -n` PASS + 임시 fixture 스모크. 실제 .productune 무수정.

## Note
- 훅은 repo 경로 실행 → 즉시 적용(GUI 재빌드 불필요). paepyeong 다음 세션 시작/write부터 루프 종료.
- doctrine 정합 = T-PATCH-154(병행).
