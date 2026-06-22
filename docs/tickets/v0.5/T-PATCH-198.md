---
ticket_id: T-PATCH-198
version: v0.5
slug: md-viewer-fill-width-centered-column
title: 마크다운 뷰어 — 페이퍼 전체 너비 채우기 + 산문 컬럼 780px 중앙 정렬
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
qa_status: pending
requires_user_gate: false
area_tag: gui-layout
risk_flags: none
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 15
---

## 버그 설명

마크다운 뷰어의 흰 종이(페이퍼) 표면이 780px에서 잘리고 **좌측 정렬**되어 있어, 넓은 패널에서 오른쪽에 어두운 배경이 "거터"처럼 노출됐다.

- 원인 1: `viewerWrap` (`packages/gui/src/components/workspace/main/panes/MarkdownViewer.tsx` ~700번째 줄)에 `maxWidth: 780`이 있고 `margin: 0 auto`가 없음.
- 원인 2: `.md-doc.md-light`의 `background: var(--surface-body)` (종이 배경)이 같은 너비 제한 요소에 칠해지므로 페이퍼가 780px에서 끝남.

## 유저 선택 픽스 (Notion/Typora 스타일)

- 페이퍼(`.md-doc` = `viewerWrap`) → 패인 **전체 너비 채움**. `maxWidth` 제거.
- 페이퍼 배경이 짧은 문서에도 스크롤 영역 전체를 채우도록 `minHeight: '100%'` 추가.
- **내부 컨텐츠 컬럼** 신규 래퍼(`viewerColumn`) 도입 → `maxWidth: 780`, `margin: '0 auto'`, 좌우 패딩 이전.
- 기존 `viewerWrap`의 좌우 패딩 → `viewerColumn`으로 이동. 상하 패딩은 `viewerWrap`에 유지.
- `zoom` 연동 유지: `viewerWrap`에 `zoom` 속성 적용 유지 → 내부 컬럼이 줌 후에도 정상 중앙 정렬.
- 편집 모드(`editWrap` / `textarea`) 미변경.
- `.md-doc .md-*` 하위 선택자: 내부 래퍼는 `.md-doc`의 자손이므로 영향 없음.
- 테이블(`width: max-content; max-width: 100%`) 및 sticky-heading 밴드(`.md-doc`의 형제)도 영향 없음.

## BDD ACs

- [x] 라이트 모드: 페이퍼 배경이 패인 전체 너비를 채움 — 우측 어두운 거터 없음.
- [x] 다크 모드: 전체 너비 채움, 컬럼 중앙 정렬 일관성 유지.
- [x] 산문 읽기 컬럼 780px 상한 유지, 양측 균등 여백으로 중앙 정렬.
- [x] 짧은 문서(스크롤 없음)에서도 페이퍼 배경이 스크롤 영역 하단까지 채움.
- [x] `zoom` 슬라이더 동작 시 컬럼이 여전히 중앙 정렬됨.
- [x] `pnpm tsc --noEmit` 통과.
- [x] `pnpm build` 통과.
- [ ] shawn 핸즈온 시각 QA (라이트/다크/줌 확인).

## 변경 파일

- `packages/gui/src/components/workspace/main/panes/MarkdownViewer.tsx`
  - `viewerWrap`: `maxWidth` 제거, 상하 패딩만 유지, `minHeight: '100%'` 추가.
  - `viewerColumn` (신규): `maxWidth: 780`, `margin: '0 auto'`, 좌우 패딩 28px.
  - JSX: `.md-doc` div 내부에 `<div style={viewerColumn}>` 래퍼 추가.
