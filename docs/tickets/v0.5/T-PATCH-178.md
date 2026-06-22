---
ticket_id: T-PATCH-178
version: v0.5
slug: version-history-prd-horizontal-margin
title: 버전히스토리 PRD 영역 좌우 마진 추가 (sibling 정렬)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: version-history
risk_flags: []
estimated_complexity: L1
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 2
---

## Problem
`VersionHistoryView`에서 `PrdSection`이 좌우 padding 없는 `viewWrap`에 직접 렌더링돼서 PRD 영역에만 좌우 여백이 없음. 같은 화면의 형제 요소(`headerWrap` `14px 16px`, `cardListWrap` `12px 16px`)는 16px 가로 padding 보유.

다른 화면에서 동일 `PrdSection`은 padding 래퍼와 함께 쓰임:
- `VersionDetailView` → `padding: 20px 28px`
- `TicketReviewTab` → `padding: 16px 20px 0`

## Fix
`packages/gui/src/views/VersionHistoryView.tsx` 의 `<PrdSection versionId={selectedVersionId} />` (line 78) 를 가로 padding 래퍼로 감쌀 것. 형제 요소와 16px 가로 정렬 맞춤 (`padding: '12px 16px 0'` 권장). 스타일은 `views/versionHistory/styles.ts` 컨벤션 따라 추가 (인라인 신규 객체 금지).

## AC
- 버전히스토리 탭 PRD 영역 좌우 여백이 header/card-list(16px)와 정렬됨
- 기존 다른 화면(VersionDetailView/TicketReviewTab)의 PrdSection 렌더링 영향 없음
- GUI tsc 통과

## Scope guard
single-file 의도. `VersionHistoryView.tsx` + `versionHistory/styles.ts` 만 수정. PrdSection 컴포넌트 자체 수정 금지 (공유 컴포넌트 — 다른 화면 회귀 위험).
