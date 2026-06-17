---
ticket_id: T-PATCH-190
version: v0.5
slug: browser-mainframe-only-urlbar
title: 인앱 브라우저 — 주소창/실패오버레이를 메인프레임만 반영
type: fix
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
duration_min: 10
---

## Problem
사용자: "naver.com 갔는데 주소창은 `shopsquare.naver.com/newshopping`인데 화면은 네이버 그대로." 네이버 메인이 shopsquare를 iframe으로 임베드 → 그 하위 프레임의 `did-navigate-in-page`가 주소창을 덮어씀.

## Fix
- `onNavigate`: `e.isMainFrame === false`면 무시 → 메인 프레임 네비게이션만 주소창 반영(`did-navigate`는 메인프레임 전용이라 isMainFrame undefined → 그대로).
- `onFailLoad`: 하위 프레임(iframe) 로드 실패가 전체 페이지 "로드 실패" 오버레이를 띄우지 않도록 동일 가드.

## QA
naver.com 이동 시 주소창 naver.com 유지 — 사용자 확인 + 빌드 통과.
