---
ticket_id: T-PATCH-184
version: v0.5
slug: sticky-heading-h4-and-scaled-typography
title: sticky 헤딩 breadcrumb — H4 포함 + 레벨별 스케일다운 타이포(계층 스택)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 6
---

## Problem
`MarkdownViewer.tsx`의 sticky 헤딩 breadcrumb(상단 VS Code식 조상-헤딩 밴드, T-PATCH-095)가 (1) H4(`.md-h4`, T-182에서 추가)를 제외하고, (2) 모든 레벨을 uniform 11px #B0B0B4로 평탄화 표시. 사용자 요청: H4 포함 + 레벨별 타이포 살려 계층적으로 쌓기(옵션 2 = 스케일다운).

## Fix — A. H4 포함
- 헤딩 수집 셀렉터 `'.md-h1, .md-h2, .md-h3'` → `'.md-h1, .md-h2, .md-h3, .md-h4'` (collectHeadings ~L245 **및** jumpToHeading ~L311 둘 다).
- level 결정 로직 → `...md-h3 ? 3 : 4` (4 추가).
- `MAX_STICKY_DEPTH` 3 → 4 (H1>H2>H3>H4 4단계 다 보이도록; 밴드 높이 +22px 허용).

## Fix — B. 레벨별 스케일다운 타이포 (옵션 2)
sticky-row 렌더(~L400-409)에서 현 uniform 스타일 대신 `h.level` 기반 스타일 맵 적용. 계층 차이는 size·weight·color로 살리되 **압축**(원본 18/15/14/13 아님). 권장값(design-system 토큰 사용, 신규 hex 금지):
- L1: `--text-base`(13) / weight 600 / `--text-emphasis`
- L2: `--text-sm`(12) / weight 600 / `--text-primary`
- L3: `--text-sm`(12) / weight 500 / `--text-secondary`
- L4: `--text-xs`(11) / weight 400 / `--text-muted`

row 높이는 콘텐츠에 맞춰 compact 유지(고정 22px가 size 차이로 잘리면 min-height + 패딩으로). indent(`16 + i*14`)는 그대로. ChevronRight 분리자 유지.

## AC
- sticky 밴드에 H4 섹션 진입 시 H4가 조상 체인에 표시됨
- 4단계(H1~H4) 중첩 시 캡 4까지 표시
- 각 레벨이 size/weight/color로 시각 구분(계층 스택), 밴드는 여전히 compact
- 헤딩 클릭 점프가 H4에도 동작(jumpToHeading 셀렉터 동기화)
- 신규 hex 0(토큰만), GUI tsc 통과
- sticky 밴드는 doc 뷰어 전용 — chat 영향 없음(확인)

## Scope guard
`MarkdownViewer.tsx`만. MdRenderer/md-recipes 변경 불필요(이미 .md-h4 recipe 존재). 밴드 동작(조상-체인 알고리즘) 로직 변경 금지 — 셀렉터/레벨/캡/row 스타일만.
