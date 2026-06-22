---
ticket_id: T-PATCH-235
version: v0.5
slug: codex-dead-code-cleanup
title: codex 폐기 dead-code cleanup — preload/onboarding/types/styles/OnboardingWizard 잔여 제거
type: refactor
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: codex-deprecation
estimated_complexity: L2
risk_flags: [multi-file-edit]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-235: codex dead-code cleanup

## Request

2026-06-09 shawn 결정: Claude Code only. T-PATCH-220 QA(2026-06-22) 후속으로
codex 관련 잔여 dead-code가 다음 위치에 확인됨(런타임 영향 0, 무해 잔여이나 
codebase 혼란 제거):

| 파일 | 잔여 항목 |
|------|-----------|
| `packages/gui/electron/preload.ts` | `checkCodex`·`codexLogin` IPC stub |
| `packages/gui/src/onboarding.ts` | codex 핸들러 (Step1_Engine / Step2_EngineConnect 등) |
| `packages/gui/src/types.ts` | `Engine` union에 `'codex'`·`'both'` |
| `packages/gui/src/styles.ts` | `btnSkip` orphan selector |
| `packages/gui/src/OnboardingWizard` | `onSelectEngine` dead-wire |

T-PATCH-077(Claude Code 연결상태)이 단일 엔진 전제로 자리잡음 → 미러 불필요.

## Acceptance

- **AC-1**: 위 5개 항목의 codex 관련 코드 제거. `Engine` union = `'claude'` 단일값
  (또는 union 자체 제거 후 literal type으로 단순화).
- **AC-2**: dangling 참조 0 — `checkCodex`·`codexLogin`·`btnSkip`·`onSelectEngine`
  심볼이 코드베이스 어디에도 남지 않음(`grep` 검증).
- **AC-3**: `npm run build` (또는 동등 GUI 빌드) green — TypeScript 컴파일 에러 0.
- **AC-4**: 런타임 무영향 — onboarding 정상 플로우(T-PATCH-077 연결 플로우)
  회귀 없음.

## Out of scope

- i18n codex 키 제거(별도 수반 여부 확인 필요, 범위에 따라 이 티켓 추가 or 후속).
- MY_PO_ENGINE env 옵션 정리(backlog 별도 항목).
- onboarding 플로우 UX 변경 — 코드 제거만, 재설계 없음.

## 의존성

- T-PATCH-220(codex IPC 제거 1차, 완료) — 이 티켓은 QA가 발견한 잔여 cleanup.
- T-PATCH-077(Claude Code 단일 엔진 전제, 완료) — 이 티켓의 근거.
