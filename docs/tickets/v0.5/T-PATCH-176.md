---
ticket_id: T-PATCH-176
version: v0.5
slug: statusline-gate-nonproductune
title: statusline이 비-productune 디렉토리에서도 "productune" 표시 — productune 프로젝트에서만 출력
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: statusline
risk_flags: [global-statusline]
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-176: statusline 비-productune gate

## 증상 (user)
productune 설치 후, **productune와 무관한 디렉토리에서 `claude` 실행해도** 입력창 아래 statusline에 "productune ..." 가 나옴. (statusline-productune.sh 가 전역 statusLine으로 박혀 모든 세션에서 발화.)

## Fix
`packages/core/scripts/statusline-productune.sh`: **productune 프로젝트일 때만** productune 세그먼트 출력. cwd(또는 event cwd) walk-up에 `.productune/po-state.json`(또는 config.json) 없으면 — productune 파트 **빈 출력**(또는 statusline 자체 silent), 다른 디렉토리 claude 세션을 오염시키지 않게.
- 이미 STATE 탐색 로직 있으면(walk-up), STATE 없을 때 early-exit로 productune 세그먼트 생략. (기본 claude statusline은 그대로 두고 productune 부분만 조건부.)

## Acceptance
- AC-1: `.productune/` 없는 디렉토리에서 claude 실행 시 statusline에 productune 표시 안 됨.
- AC-2: productune 프로젝트에선 종전대로 `vX | phase N: ... | branch` 표시.
- AC-3: `bash -n` PASS + 두 케이스(productune dir / 일반 dir) 스모크.

## Note
- 전역 영향(모든 claude 세션 statusline) — 보수적으로 productune dir 아니면 무출력.
