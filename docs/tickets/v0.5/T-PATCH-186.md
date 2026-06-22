---
ticket_id: T-PATCH-186
version: v0.5
slug: run-launcher-usability-fixes
title: Build 런처 실사용 픽스 — 드롭업 clip 해제 + PATH 보강 + amber focus + 기본 최대화
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: gui-chrome
risk_flags: none
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 20
---

## Problem
사용자 directive (2026-06-17): "가끔 tab 누르면 amber로 highlight됨, 방지해줘 / Build 버튼이 아무 작동 안 함." 조사 중 추가로 2건 더 발견.

1. **amber focus ring** — 전역 focus 스타일 부재로 포커스 요소가 Chromium 기본 `outline:auto` → macOS 시스템 강조색(amber 테마)으로 렌더.
2. **Build 버튼 무반응** — `BuildSegment` 드롭업이 위로 열리는데(`bottom:28`) StatusBar 래퍼 `overflow:hidden`(34px)에 clip되어 보이지 않음.
3. **exit 127** — surface spawn이 `node_modules/.bin` 없는 PATH라 `next`/`vite` 미해결.
4. 앱이 1280×800로 떠 화면을 안 채움.

## Fix
1. `index.css` `:focus-visible` 앱 accent(#8B5CF6) 고정 + `:focus:not(:focus-visible)` outline 제거(키보드 전용).
2. `WorkspaceShell` status 래퍼 `overflow`를 `statusBarVisible ? 'visible' : 'hidden'`.
3. `surface-runner` PATH에 projectDir→root `node_modules/.bin` + 로그인 셸 PATH(`$SHELL -ilc`) 병합.
4. `main.ts` `win.maximize()`.

## QA
amber 미노출 / Build 드롭업 표시 / next 빌드 실행 / 최대화 — 사용자 확인 + 빌드 통과.
