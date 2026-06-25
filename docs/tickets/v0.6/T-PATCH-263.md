---
ticket_id: T-PATCH-263
version: v0.6
slug: leading-dash-input-crash
title: 유저 메시지 리딩 '-'/'--' → claude CLI 옵션 오파싱 crash 안전처리 (#8)
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
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-263 (#8): leading-dash input crash

## Request
유저 메시지가 `-`/`--`로 시작하면 claude CLI가 옵션으로 오파싱 → `error: unknown option '- ...'` + exit code 1로 턴 crash. po-runner.ts:557 부근이 유저 텍스트를 마지막 positional arg로 `--` 없이 push.

## Acceptance
- AC-1: 리딩 `-`/`--`(및 옵션처럼 보이는) 메시지가 정상 전송·처리(crash 0). 근본: arg 전달에 `--` end-of-options 구분자 또는 stdin 전달.
- AC-2: 기존 정상 메시지 무회귀. first-call + resume 양 경로 적용(po-runner args 빌드).

## Plan
dev: po-runner.ts arg 빌드(~557, 533-560 args.push)에서 user text 앞에 `--` 추가 or stdin 경로. **주의: T-PATCH-268(#6, 같은 po-runner.ts)과 동일 파일 — 한 dev가 263→268 순차 처리.** QA: cua-vm 리딩-`-` 입력 재현(crash→정상).

## Outcome
done — po-runner.ts arg 빌드에 `--` end-of-options sentinel 추가(line ~614, first-call+resume 공통 경로). 리딩 `-`/`--` 메시지가 positional로 전달. QA: tsc EXIT0 + turbo build 클린 + AC 정적 pass. 런타임 cua-vm 확인 flag(리딩-`-` 입력 crash→정상).

## Persona Activity
(PO-managed)
