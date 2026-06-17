---
ticket_id: T-PATCH-188
version: v0.5
slug: run-ux-reopen-preview-and-blank-browser
title: Run UX — Preview 다시 열기 버튼 + Cmd+T 빈 브라우저
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: run-launcher
risk_flags: none
estimated_complexity: L1
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 20
---

## Problem
1. Run 중 Preview(웹) 탭을 닫으면 다시 열 방법이 없음(서버는 살아있는데).
2. Cmd+T가 빈 markdown 'Untitled' 탭을 열어 쓸모가 적음 — 빈 브라우저가 더 자연스러움.

## Fix
1. `BuildOutputTab`(run kind): server running + 감지 URL 있으면 헤더에 "웹 다시 열기" 버튼 → Preview 탭 재오픈. 감지 URL은 runId 키의 모듈 맵에 보관해 탭 전환(unmount) 후에도 버튼 유지. 기존 하드코딩 '취소'도 `common.cancel`로 i18n화.
2. `addNewTab`(Cmd+T) → 빈 'browser' 탭(about:blank + URL바).

## QA
Preview 닫고 재오픈 / Cmd+T 빈 브라우저 — 사용자 확인 + 빌드 통과.
