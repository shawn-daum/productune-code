---
ticket_id: T-PATCH-151
version: v0.5
slug: migrate-hook-message-alarm-block
title: migrate 훅 additionalContext reword — shrink=정상·work-state는 brief·복원 금지 (PO 오진 차단)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [session-start-hook, all-project-affecting]
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-151: migrate 훅 메시지 alarm-block

## 배경 (paepyeong 관측)

`session-start-po-state-migrate.sh` 가 po-state를 canonical로 정리하면 emit하는 additionalContext 메시지가 모호("non-canonical current_task fields removed … Backup preserved")해서, **별도 PO 세션이 이걸 "위생 오작동/work-state 유실"로 오진 → .bak 복원 → 비표준 재오염 → 다음 세션 시작 때 또 shrink** 의 알람 루프 유발. (pointer-only doctrine 확정 — work-state home = brief.)

## Fix

`packages/core/scripts/hooks/session-start-po-state-migrate.sh` 의 additionalContext emit 메시지(`MSG=...` 구간)를 reword. 담을 내용:

- 이 shrink는 **정상(EXPECTED) · 에러 아님 · 무손실(LOSSLESS)**.
- 드롭된 것: `past_tickets`(ticket `.md`가 SoT) + 비표준 `current_task` freeform 필드.
- **활성 task work-state(progress/decisions/next/carry)는 `briefs/<slug>.md`에 있음 — 거기서 resume.**
- ⚠️ **`.bak` 복원 금지** — 복원하면 비표준 필드가 되살아나고(po-state bloat) **다음 세션 시작 때 다시 정리됨**(무한 루프). `.bak`은 디버그용으로만 보존.

영어로(타 메시지와 일관, additionalContext는 PO가 읽음). 메시지 텍스트만 변경 — 마이그레이션 로직/게이트/안전장치 불변.

## Acceptance
- AC-1: dirty 파일 정리 시 emit되는 additionalContext가 위 4요소(정상·무손실·brief가 home·복원 금지+이유)를 명시.
- AC-2: clean v2 = 여전히 strict no-op(메시지 없음). 마이그 로직/게이트/.bak/복원 가드 무변경.
- AC-3: `bash -n` PASS + 임시 fixture 1건으로 reworded 메시지 출력 확인.
