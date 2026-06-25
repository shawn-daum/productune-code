---
ticket_id: T-PATCH-266
version: v0.6
slug: vitest-runner-wiring
title: 테스트 러너 배선 — vitest 도입, 기존 .test.ts 실제 실행 (#4 code)
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
vitest@4 installed in packages/core and packages/gui. per-package vitest.config.ts wired; gui vitest.setup.ts stubs electron/zustand/i18n for Node test env. Previously-dead .test.ts files now execute under `turbo run test`:

**core (2 vitest files, 10 tests):**
- `test/schema-v-guard.test.ts` — 2 tests (FALLBACK_LATEST_SCHEMA_V guard + latestSchemaV() derive). Fixed 3 latent wrong-path bugs (`../../` → `../`) in file that was never run before.
- `test/lint/vocabulary.test.ts` — 8 tests. Replaced custom test() runner with vitest test()/expect().

**core (2 .mjs files, retained):**
- `test/schema-v-guard.mjs` — 2 checks (dist/ import path). Retained.
- `test/init-parity.mjs` — 1 CLI vs GUI parity check. Fixed latent macOS `/private/tmp` normalization regex bug that only manifested under turbo parallel execution.

**gui (3 vitest files, 3 tests):**
- `electron/ipc/costArchive.test.ts` — 1 vitest test (runs 13 sub-cases). Electron stub in vitest.setup.ts.
- `src/lib/useTicketScan.test.ts` — 1 vitest test (runs 12 sub-cases).
- `src/store/dedupeMessagesById.test.ts` — 1 vitest test (runs 6 sub-cases).

**Playwright smoke.spec.ts**: excluded from vitest via `exclude: ['tests/**']` in gui vitest.config.ts. No conflict.

`turbo run test` exits 0. `turbo run build` exits 0. No regressions.

## Persona Activity
(PO-managed)
