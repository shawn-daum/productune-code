---
ticket_id: T-PATCH-162
version: v0.5
slug: ticket-sort-per-status
title: 티켓 정렬 — todo=작업순서↑, done=최근완료↑, 나머지=최근업데이트↑
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: ticket-sort
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-162: 티켓 상태별 정렬

## 현 상태 (조사 완료)
- `TicketDashboardView.tsx` — `groupByStatus()`(114-137)로 status별 그룹핑만, **컬럼 내 정렬 없음**(179행 그대로 map → 스캔 순서=임의).
- Ticket 필드(types.ts:152-179): `ticket_id`, `status`, `started_at`, `completed_at`, `duration_min`. **`updated_at` 없음** ← "최근 업데이트" 정렬의 갭.

## 원하는 정렬 (user)
- **todo**: 다음 작업 순서가 위 → `ticket_id` 오름차순(localeCompare; T-002 < T-010 자연정렬 필요 시 숫자 파싱).
- **done**: 최근 완료가 위 → `completed_at` 내림차순.
- **나머지**(in-progress/review/user-verify/blocked/abandoned): 최근 상태 업데이트가 위 → 내림차순.

## "최근 업데이트" 신호 (갭 해소)
`updated_at` 필드가 없음. 권장: **티켓 .md 파일 mtime**을 "마지막 터치" 신호로 사용(상태/frontmatter 편집 시 파일이 touch됨). 스캐너(useTicketScan/IPC)가 파일 읽을 때 `mtime`을 Ticket에 실어 surface하도록 추가 → 나머지 컬럼은 mtime 내림차순. (fallback: `started_at` → `ticket_id`.)
- 대안(가벼움): mtime 배선 없이 `started_at` 내림차순 fallback만. 단 review/blocked 등 started_at 없는 경우 약함 → mtime 권장.

## Fix
1. (필요시) 티켓 스캐너 IPC가 각 티켓에 `mtime`(파일 수정시각) 포함 → Ticket 타입에 `mtime?: number` 추가.
2. `TicketDashboardView.tsx` `Column`(또는 groupByStatus 후) status별 comparator:
   - todo → ticket_id asc (자연정렬)
   - done → completed_at desc
   - else → mtime desc (fallback started_at desc → ticket_id)
   - `useMemo`로 정렬, 안정 정렬.

## Acceptance
- AC-1: todo 컬럼 = ticket_id 오름차순(다음 작업 위).
- AC-2: done 컬럼 = completed_at 최근순(위).
- AC-3: 나머지 = 최근 업데이트(mtime) 위. 동률 안정.
- AC-4: build PASS. 정렬은 표시-only(상태/데이터 불변).
