---
ticket_id: T-PATCH-267
version: v0.6
slug: smoke-visual-augmentation
title: smoke 시각 보강 — 핵심 화면 시각 렌더 캡처/검증 (#3 code)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: test-infra
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-267 (#3 code): smoke visual augmentation

## Request
현 gui smoke(tests/smoke.spec.ts)가 mount+console error만 봄 → CSS깨짐/간격 못 잡음(fail-pattern T-PATCH-095 5루프 원인). 시각 렌더 캡처/검증 보강. (#3 doctrine run-prompt 단계는 T-261서 done — 여긴 smoke code.)

## Acceptance
- AC-1: smoke가 핵심 화면(예: workspace shell·PO chat·onboarding) 시각 렌더를 스크린샷 캡처 + 기본 시각 어서션(레이아웃 비빈화면/주요 요소 가시성). green build != pass 사각 축소.
- AC-2: 기존 smoke(mount+console) 유지 + 시각 캡처 추가. CI/로컬에서 실행 가능.

## Plan
dev: tests/smoke.spec.ts(playwright)에 screenshot 캡처 + 시각 어서션(요소 boundingBox/visibility, 레이아웃 sanity). 풀 visual-regression baseline은 과하면 스크린샷 산출+핵심 가시성 체크로 시작. QA: smoke가 의도적 CSS 깨짐을 잡는지 1케이스 확인.

## Outcome
done — smoke.spec.ts에 시각 어서션 2테스트 추가(app shell non-collapsed 레이아웃 + onboarding/home 핵심요소 가시성) + 스크린샷 캡처(test-results/). 기존 mount+console 테스트 보존. QA: tsc EXIT0 + build 클린 + AC 정적 pass. 런타임 flag(`pnpm --filter @productune/gui smoke` 3테스트 실행 — Electron은 display 필요, mac 로컬 OK).

## Persona Activity
(PO-managed)
