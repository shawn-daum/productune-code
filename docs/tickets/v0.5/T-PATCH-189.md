---
ticket_id: T-PATCH-189
version: v0.5
slug: i18n-audit-missing-keys-and-blank-url
title: i18n 점검 — 누락 키 채움 + used-but-missing 빌드게이트 + 빈 브라우저 URL바 정리
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: i18n
risk_flags: none
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 30
---

## Problem
빈 브라우저 URL바가 `about:blank` 리터럴을 보여주고, placeholder가 **정의 안 된 키** `workspace.browser.navPlaceholder`를 참조해 raw 키가 노출됨. 사용자 요청으로 i18n 전수 점검 → `check-locale-keys`는 en/ko parity만 보고 "쓰였지만 미정의" 키는 못 잡음을 확인.

## Fix
- URL바: about:blank면 빈 입력 + placeholder. placeholder는 기존 `addressPlaceholder` 재사용.
- 누락 키 채움: `browser.refresh/openExternal`(미정의)→기존 `reload`/`popout` 재사용, `sidebar.refresh`·`artifacts.autoOpenToast`·`backgroundTasks.*`(10키) 추가.
- `check-locale-keys.js`에 **used-but-missing 검사** 통합(빌드 게이트화) — 정적 `t('…')` 키가 카탈로그에 없으면 빌드 실패. dynamic 키(`t('a.b.'+x)`)는 namespace prefix로 인정해 오탐 없음.
- 빈 값(empty string) 0건, dynamic 키 패밀리 전부 존재 확인.

## QA
843 keys / 632 used 전부 resolve, en/ko parity OK, 빌드 통과.
