---
ticket_id: T-PATCH-266
version: v0.6
slug: vitest-runner-wiring
title: 테스트 러너 배선 — vitest 도입, 기존 .test.ts 실제 실행 (#4 code)
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: test-infra
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-266 (#4 code): vitest runner wiring

## Request
`.test.ts`들(core/gui: costArchive·useTicketScan·dedupe·vocabulary·schema-v-guard·smoke.spec 등)이 vitest/jest 미설치로 **실행 안 됨**. `turbo test` → core는 `.mjs` 2개만 실행. (#4 doctrine 트리거 재조정은 T-261서 done — 여긴 code 배선.)

## Acceptance
- AC-1: vitest 도입 + per-package `test` 스크립트 + turbo `test` 연결 → 기존 `.test.ts`/`.spec.ts` 6개가 실제로 실행됨.
- AC-2: `turbo run test` 그린(기존 .mjs 테스트 + 새로 배선된 .test.ts 모두 실행·통과, 깨진 테스트는 수정 or 격리 명시).
- AC-3: gui playwright smoke(smoke.spec.ts)와 vitest 유닛 러너 구분(충돌 없게).

## Plan
dev: vitest devDep + vitest.config(packages/core, packages/gui) + package.json test 스크립트 + turbo.json test task. 기존 .mjs는 유지 or vitest로 통합 판단. 실행 안 되던 .test.ts 그린 확인. QA: `turbo run test` 실제 6개 실행 검증.

## Outcome
(pending)

## Persona Activity
(PO-managed)
