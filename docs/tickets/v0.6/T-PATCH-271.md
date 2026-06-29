---
ticket_id: T-PATCH-271
version: v0.6
slug: classify-claude-exit-error
title: claude exit code≠0 분류 — session/usage limit·auth·quota를 actionable 에러 상태로 (#17)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-30T00:00:00Z
---

# T-PATCH-271 (#17): classify claude exit error

## Request
shawn(dogfood): claude가 exit code 1로 죽으면 GUI가 "claude가 오류로 종료되었습니다 (코드 1)" raw만 표시 → 유저는 이유(아마 session/usage limit) 모름. 에러 분류 + 제대로 된 에러 상태/안내 필요.

## 진단
po-runner.ts:852 — exit≠0 경로가 stderr 미분류 → 제네릭 `claude exited with code ${code}` + emitHealth('error-other'). stream 중 rate-limit/quota 분류기(line 501-522)는 있으나 **exit-code 경로는 그 분류를 안 탐**.

## Acceptance
- **AC-1**: claude 프로세스 exit≠0 시, 제네릭 메시지 전에 **최근 stderr/마지막 라인 검사 → 분류**: usage/session limit(예: "usage limit", "session limit", "5-hour", "limit reached", "quota") → `capped`(또는 전용 상태) + "사용량 한도 도달 + (가능하면)리셋 시점 + 다음 행동"; auth/login(예: "unauthorized", "login", "auth") → `auth-required`; rate-limit/429 → `rate-limited`(reset 추출 재사용). 매칭 없으면 현 제네릭 exit-error 유지.
- **AC-2**: 분류된 케이스는 유저에게 **평이한 actionable 메시지**(왜 + 무엇을). 기존 SessionHealthBanner/health-state 재사용(T-231). raw "코드 1"만 노출 금지.
- **AC-3**: 정상 exit(code 0) 무회귀. 기존 rate-limited(stream) / capped / auth-required 경로 무회귀. 분류 패턴은 튜너블(향후 추가 쉽게).

## Out of scope
- claude CLI 자체 stderr 공지 전반 중재(별 backlog "claude CLI 시스템 메시지 해석·중재"). 여긴 exit-code≠0 분류만.

## Plan
dev: po-runner exit/close 핸들러(~:811-859)에서 child stderr 버퍼(또는 마지막 N라인) 유지 → exit≠0 시 패턴 분류 → emitHealth(적절 상태)+actionable announce, 그 후에만 제네릭 fallback. stream 분류기(501-522)와 패턴 공유 가능. QA: 모킹/유닛으로 분류 매핑 검증 + 정상 exit 무회귀(라이브 limit 재현은 cua/hands-on flag).

## Outcome
done — po-runner exit≠0 경로에 stderr tail 버퍼(STDERR_TAIL_MAX=20) + 튜너블 EXIT_ERROR_PATTERNS 테이블 + classifyExitError. usage/session limit·rate/quota → emitHealth('rate-limited')(+resetAt 공유 extractRateLimitReset, RateLimitBanner) + ko actionable; auth/401 → error-other(SessionHealthBanner) + ko actionable; no-match → 기존 generic exit-error 유지. code 0 무손상. QA pass(conf 0.91): build green, dedup(emitHealth state-guard), T-268 silent-fail 블록이 T-271보다 먼저(TCC 오분류 불가 — TCC 문자열은 패턴 0매칭), auth regex word-boundary safe. cap→rate-limited는 v0.6 scope 결정(전용 usage-capped 상태=v0.7 design debt). 라이브 cap/auth exit 메시지 매칭=cua flag.

## Persona Activity
(PO-managed)
