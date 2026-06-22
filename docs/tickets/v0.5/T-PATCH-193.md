---
ticket_id: T-PATCH-193
version: v0.5
slug: browser-page-title-and-url-persist
title: 브라우저 탭 — 페이지 타이틀 반영 + Cmd+R 후 URL 보존
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: browser-tab
risk_flags: none
estimated_complexity: L1
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 15
---

## Problem
1. 브라우저 탭 제목이 페이지 이동과 무관하게 "Browser" 고정.
2. 앱 새로고침(Cmd+R) 시 브라우저 탭이 열 때의 원래/빈 URL로 되돌아감(탐색 위치 유실).

## Fix
- `store.setTabMeta(tabId, {title?, url?})` 신설 — id 변경 없이 탭 title/props.url 패치.
- `BrowserTab`: webview `page-title-updated` → 탭 title = 문서 제목(네비게이션 따라 갱신).
- 메인프레임 네비게이션마다 현재 URL을 `tab.props.url`에 저장. `panes`는 sessionStorage에 persist되므로 Cmd+R 후 마지막 URL로 복원.

## Notes
부수 발견한 ChatPanel 메시지 목록 중복 key 경고는 범위 밖 → T-PATCH-192(backlog)로 분리.

## QA
페이지 제목 탭 반영 / Cmd+R 후 URL 유지 — 빌드 통과.
