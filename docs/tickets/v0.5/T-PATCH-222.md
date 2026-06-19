---
ticket_id: T-PATCH-222
version: v0.5
slug: right-panel-scrollbar-style
title: 우측 PO Chat 패널 스크롤바 스타일 (OS 기본 → 얇은 오버레이)
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: ui
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-222: 우측 패널 스크롤바 스타일

## Request

shawn 보고: 우측 PO Chat 패널 스크롤바가 못생김. 커스텀 스크롤바 CSS가 탭 스트립
(`index.css` `.tab-strip-scroll::-webkit-scrollbar`)에만 있고 채팅/우측 패널 스크롤
컨테이너엔 미적용 → OS 기본(굵은 회색)이 그대로 노출.

## 설계 방향

탭 스트립과 동일 스타일(얇은 오버레이: `::-webkit-scrollbar` 3~8px + 투명 트랙 +
둥근 thumb, Firefox `scrollbar-width: thin` / `scrollbar-color`)을 우측 패널/채팅
스크롤 컨테이너에 적용. 토큰/색은 디자인 시스템 변수 사용.

## Acceptance

- **AC-1**: 우측 PO Chat 패널 스크롤바가 얇은 오버레이 스타일로 렌더(렌더 스크린샷 기준).
- **AC-2**: 스크롤 기능 회귀 없음(over­flow 동작 유지).
- **AC-3**: 라이트/다크 및 다른 스크롤 컨테이너와 시각 일관.

## Out of scope
PO chat 레이아웃(좌측 윙) 변경(별도).
