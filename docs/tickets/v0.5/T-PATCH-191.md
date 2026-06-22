---
ticket_id: T-PATCH-191
version: v0.5
slug: browser-url-focus-and-window-open-newtab
title: 인앱 브라우저 — 빈 탭 URL바 자동 포커스 + window.open을 새 탭으로
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: browser-tab
risk_flags: none
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 30
---

## Problem
1. 빈 브라우저 탭이 열려도 URL바에 포커스가 없어 바로 입력 불가.
2. 네이버 타일/기사(window.open / target=_blank) 클릭이 무반응. 원인: `allowpopups={true}`(boolean)를 React 19가 커스텀 엘리먼트 속성으로 안 써줘 webview에 `allowpopups`가 **아예 없어** popup 차단 → 핸들러도 미호출(콘솔 무반응). 구글(같은 탭 `<a>`)은 정상.

## Fix
1. `about:blank` 탭은 마운트 시 URL바 자동 포커스/select. URL 갖고 열린 탭(Run Preview)은 페이지 포커스 유지.
2. `allowpopups`를 문자열 `"true"`로(`{...({allowpopups:'true'} as any)}` — 인트린식 타입 boolean 회피). 속성 부착 → popup 허용.
3. main `web-contents-created` → webview `setWindowOpenHandler`로 popup deny + URL을 렌더러로 전달 → 새 인앱 브라우저 탭 오픈(현재 페이지 보존, OAuth 팝업 안전). preload `onBrowserOpenUrl` + `useIpcSubscriptions` 구독.

## QA
빈 탭 URL바 포커스 / 네이버 타일 클릭 → 새 탭 — 사용자 확인 + 빌드 통과.
