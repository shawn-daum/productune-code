---
ticket_id: T-PATCH-146
version: v0.5
slug: po-state-migrate-shape-gate
title: po-state migrate 훅 idempotency 게이트 version-기반 → shape-기반 (v2-stamped-but-dirty 누락 차단)
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [core-tooling, session-start-hook, all-project-affecting]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-146: migrate 훅 shape-기반 idempotency

## 버그 (관측: paepyeong)

`packages/core/scripts/hooks/session-start-po-state-migrate.sh` 는 v1→v2 마이그레이션(past_tickets drop + current_task canonical-14 whitelist strip + stage→type)을 올바르게 수행한다. 그러나 **idempotency 게이트가 `schema_version` 만 본다**:

- 외부 bash 게이트: `[ "$SCHEMA_V" -ge 2 ] && exit 0`
- 내부 jq 게이트: `if (.schema_version // 1) >= 2 then . else …`

paepyeong po-state는 `schema_version: 2` 로 찍혀 있으면서도 `past_tickets`(12건) + 비표준 `current_task` 필드(`stage`/`resume_brief`/`decisions`/`progress`/`next`/`close_residuals`/`env`)가 그대로 남아 있었다 → **버전 스탬프 ↔ 실제 shape 불일치**. 게이트가 "2니까 깨끗" 으로 단정 → **strict no-op**, 오염이 영구 잔존. 라이브 PO 세션이 v2-stamped 파일에 freeform 필드를 계속 덮어써도 매 세션 시작 시 재정리가 안 됨.

## Fix — 게이트를 "버전" 이 아니라 "실제 shape 위반 존재 여부" 로

**needs_cleanup = TRUE** when ANY of:
1. `(.schema_version // 1) < 2`, OR
2. `has("past_tickets")`, OR
3. `.current_task` 가 object 이고 canonical-14 whitelist 밖 key 가 하나라도 있음 (`stage` 포함 — stage는 type으로 rename 후 제거), OR
4. (안전망) `.current_task` object 가 `stage` key 보유.

- needs_cleanup = FALSE → **strict no-op** (출력 없음, clean exit) — 진짜 깨끗한 v2 파일엔 무동작 (idempotent 유지).
- needs_cleanup = TRUE → 기존 jq 변환 실행(stage→type rename → canonical strip → past_tickets drop → schema_version=2 stamp). **내부 jq의 `if (.schema_version//1) >= 2` 분기도 제거/완화** — 이미 v2여도 dirty면 변환이 돌아야 함. 변환 자체는 이미 idempotent(이미 strip된 필드 재strip = 무변화).

canonical-14 whitelist 상수(`CANONICAL`)는 기존 것 재사용.

## 보존 (변경 금지)

- 기존 안전장치 전부 유지: `.bak` 선기록, jq merge-only(full-rewrite 금지), load-bearing 필드 생존 검증(slug/request_summary/artifacts/persona_sessions/version/current_phase) + 실패 시 `.bak` 복원, 빈출력/schema!=2 abort.
- SessionStart matcher(startup|resume), additionalContext emit 포맷.
- 멱등성: clean v2 파일 = no-op (위 needs_cleanup FALSE 경로).

## 검증

- AC-1: `schema_version:2` + `past_tickets` 존재하는 fixture → 훅 실행 후 past_tickets drop + schema_version 유지 2 + 변경 additionalContext emit.
- AC-2: `schema_version:2` + `current_task`에 비표준 key(progress 등) fixture → 훅 실행 후 canonical-14만 잔존.
- AC-3: 완전 clean v2 fixture(past_tickets 없음, current_task canonical-only) → strict no-op(출력 0, 파일 unchanged, .bak 미생성).
- AC-4: v1 fixture(schema_version 없음/1) → 기존대로 full 마이그레이션.
- AC-5: 변환 중 load-bearing 필드 유실 시 .bak 복원 동작(기존 가드) 회귀 없음.
- AC-6: bash 문법 검사 `bash -n` PASS + 셸 실행 스모크(임시 디렉토리 fixture 4종 통과).

## Note

- 라이브 PO 세션이 애초에 freeform 필드를 **쓰지 않도록** 하는 건 별개(delegation.md §90 doctrine 준수 문제 / 추후 write-guard 검토) — 본 티켓은 매 세션 시작 결정적 재정리 backstop 까지.
- doctrine state-hygiene.md 의 invariant 문구는 이미 "idempotent" 만 명시(version-gate 강제 아님) → markdown 변경 불필요. 단 스크립트 헤더 주석의 "gate: schema_version >= 2" 문구는 shape-기반으로 갱신.
