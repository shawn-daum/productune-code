---
ticket_id: T-PATCH-137
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L1
risk_flags: []
qa: true
qa_status: pass
slug: status-synonym-in-progress-qa
depends_on: []
lane: patch
round: dogfood-paepyeong
---

# T-PATCH-137 — board status synonym map에 `in_progress` / `qa` 추가 (todo 오표시)

## Request

PO 도그푸딩(paepyeong)에서 확인: GUI 티켓 보드가 "스키마 mismatch — 알 수 없는 status 3개
todo fallback (qa, in_progress)" 배너를 띄움. 실제 티켓:
- `T-109` / `T-111` (06-10 생성): `type: impl`, `status: qa`
- `T-112` (06-15 생성): `type: impl`, `status: in_progress`

근본(확정): board read 정규화 choke point인 `packages/gui/src/lib/useTicketScan.ts` 의
`LEGACY_STATUS_SYNONYMS` 가 이 두 값을 미커버 → `normalizeStatus` 통과 후
`TicketDashboardView.groupByStatus` 에서 미지값 → `todo` fallback + 배너.

T-PATCH-136 가 `superseded → abandoned` 를 같은 맵에 흡수한 선례 그대로, 이 맵은
"디스크의 비-canonical status → canonical 7-status" 정규화의 단일 지점이다. 두 값을 추가한다:
- `in_progress` → `in-progress` (snake/kebab 변형. canonical 은 kebab — `ticket-schema.md:14`)
- `qa` → `review` (`qa` 는 canonical status 아님 = ticket **type**. "impl done, awaiting QA"
  의 canonical status 는 `review` — `ticket-schema.md:53`. `review` 는 board 에서
  `DISPLAY_BUCKET` 으로 `in-progress` 컬럼에 접힘 = T-PATCH-130)

이는 read-time band-aid다 — write 시점에 비-canonical status 가 디스크에 박히는 근본 원인은
별 티켓(write-guard, L2)에서 다룬다. 이 티켓 범위는 표시 정규화만.

## 코드 사실 (착수 전 재검증 — 라인 스냅샷)

- `packages/gui/src/lib/useTicketScan.ts:30-40` — `LEGACY_STATUS_SYNONYMS: Record<string, Status>`
- `:42-45` — `normalizeStatus(raw)` = `LEGACY_STATUS_SYNONYMS[raw] ?? raw`
- 소비자: `useTicketScan` 스캔 결과(`:81`) + `TicketDashboardView.collectAllTickets`
  current_task.status(`:93`) 둘 다 이 함수를 탄다.
- `KNOWN_STATUS_SET`(`TicketDashboardView.tsx:24`) = STATUS_ORDER + `review` — 정규화 후
  값이 여기 들면 unknown 카운트 안 됨.

## Acceptance

- AC-1: `LEGACY_STATUS_SYNONYMS` 에 `in_progress: 'in-progress'`, `qa: 'review'` 두 항목 추가.
  추가 이유 1-line 주석 (T-PATCH-137 태그) — 기존 맵 주석 스타일 따름.
- AC-2: `normalizeStatus('in_progress') === 'in-progress'`, `normalizeStatus('qa') === 'review'`.
- AC-3: 회귀 없음 — 기존 항목(planned/qa-pending/user-pending/cancelled/design-proposal/
  superseded) 매핑 불변. canonical 값(`in-progress`, `done` 등)은 pass-through 유지.
- AC-4: 단위 테스트가 있으면 위 3건 케이스 추가; 없으면 normalizeStatus 최소 테스트 신설.
- AC-5: typecheck + 기존 GUI 빌드 green.

## Outcome

`packages/gui/src/lib/useTicketScan.ts` `LEGACY_STATUS_SYNONYMS` 에 `in_progress: 'in-progress'`,
`qa: 'review'` 2항목 추가(각 T-PATCH-137 주석). `useTicketScan.test.ts` 신설(12 케이스).
typecheck + GUI build green. QA basic pass (AC-1~5 전부). 기존 6개 synonym 불변 확인.
read-side band-aid 완료 — write-side 근본 fix 는 T-PATCH-138.
