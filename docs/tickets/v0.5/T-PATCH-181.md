---
ticket_id: T-PATCH-181
version: v0.5
slug: md-viewer-notion-readability-and-codeblock-overflow
title: MD 뷰어 노션식 가독성 — heading 간격 리듬(D) + 코드블록 overflow 방지(C)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer
risk_flags: shared-primitive
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 10
---

## Problem
PRD/문서 본문 렌더 가독성 — (D) heading 위·아래 간격 리듬이 노션 대비 부족해 섹션 구분이 약함. (C) 긴 코드블록/inline-code가 780px 컬럼에서 wrap/scroll 미처리로 우측 잘림 가능성(미확인, 방지차).

## C — 코드블록 overflow 방지
`packages/gui/src/styles/md-recipes.css` `.md-code-block`(현 bg #0A0A0A/border/padding 12px) + `.md-code-inline` 확인. 가로 overflow 시 `overflow-x: auto`(블록) 처리해 컬럼 밖 잘림 방지. inline-code는 `word-break`/`overflow-wrap` 로 줄바꿈 허용. 표(`.md-table`)도 컨테이너 가로 스크롤 점검.

## D — 노션식 간격 리듬
`md-recipes.css` heading recipe(`.md-h1`/`.md-h2`/`.md-h3`) margin-top 강화로 섹션 호흡 확보(노션식: heading 위 여백 큼, 아래 여백 작음). 문단(`.md-body`) 간 간격, 리스트 spacing 점검. 값은 기존 design-system 토큰 재사용(신규 hex 금지).

## CRITICAL — shared-primitive
`md-recipes.css`는 **chat 버블도 공유**(MdRenderer SoT). heading margin 강화가 chat 메시지 렌더를 망가뜨리지 않는지 회귀 확인 필수. 필요 시 doc-뷰 전용 스코프(`viewerWrap` 하위 셀렉터)로 한정해 chat 영향 0으로.

## AC
- 코드블록/긴 inline-code/표가 780px 컬럼 밖으로 텍스트 잘리지 않음 (wrap 또는 scroll)
- heading 간 섹션 구분이 시각적으로 명확 (노션식 top-margin 리듬)
- **chat 버블 렌더 회귀 0** (간격 변화가 chat 말풍선 안 깨뜨림)
- 신규 hex 0 (design-system 토큰만), GUI tsc 통과

## Scope guard
`md-recipes.css` 중심. 필요 시 `MarkdownViewer.tsx` 스코프 셀렉터만. MdRenderer 컴포넌트 로직 변경 금지.
