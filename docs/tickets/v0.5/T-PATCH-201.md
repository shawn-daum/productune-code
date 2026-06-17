---
ticket_id: T-PATCH-201
version: v0.5
slug: cost-archive-cumulative-fix
title: Cost archive — 누적 스냅샷 합산 버그(총액 뻥튀기) + main usage 미캡처 수정
type: bugfix
status: in-progress
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: cost-archive
risk_flags: >
  aggregator 가 표시 총액을 바꾸므로 dedup 로직이 세션 경계를 정확히 잡아야 한다
  (session_id 별 last/max). subagent_total 행과 main_session_cumulative 행을
  서로 다르게 합산 — 혼동 시 또 틀린 총액. statusline usage 캡처는 statusLine
  훅 페이로드 스키마(usage 필드 존재 여부)에 의존.
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

`.productune/turns.jsonl` 진단 결과(1050행):
- **전부 `(persona=pdt-po, scope=main)`** 행이고 `cost_basis: "main_session_cumulative"`.
  이건 statusline(`statusline-productune.sh:302-386`)이 PO 턴마다 찍는 **누적 스냅샷**.
- aggregator(`cost:aggregate` / `cost:aggregatePivot`, `costArchive.ts`)가 이 1050개
  누적 스냅샷을 **그냥 합산** → 총 **≈ $31,455**. 누적값을 더했으니 심각한 중복계상.
  실제 프로젝트 총비용 표시가 의미 없는 숫자다.
- main 행 `usage: {}` 전부 비어있음 → statusline 이 cost 만 잡고 토큰(in/out/cache)은
  안 잡음 → 토큰 단위 표시 불가.

(per-persona 미집계는 별건 — T-PATCH-202. 본 티켓은 **총액 정상화 + 토큰 캡처**만,
저위험·독립.)

---

## 설계 결정

| 항목 | 결정 |
|------|------|
| **누적 행 합산 금지** | `cost_basis === 'main_session_cumulative'` 행은 **session_id 별로 last(또는 max cost_usd) 하나만** 채택. 합산하지 않음. |
| **subagent 행** | `cost_basis === 'subagent_total'` 행은 per-turn 실비 → **정상 합산**(현재 0건이지만 T-202 후 생김). |
| **프로젝트 총액** | `Σ(subagent_total) + Σ_session(main_cumulative 의 세션별 최종값)`. |
| **usage 캡처** | statusline 에서 가능한 경우 `usage{input,output,cache}` 를 채워 기록. 페이로드에 없으면 graceful null 유지(빈 {} 회피). |

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/gui/electron/ipc/costArchive.ts` | `cost:aggregate` / `cost:aggregatePivot` — cumulative-basis 행 세션별 dedup, basis별 분기 합산. |
| `packages/core/scripts/productune` (`:393-600` 아카이브 집계 CLI) | 동일한 dedup 규칙 반영(GUI/CLI 총액 일치). |
| `packages/core/scripts/statusline-productune.sh` (`:302-386`) | usage 토큰 필드 캡처 추가(가능 시). |

---

## Acceptance Criteria

- **AC-1**: 프로젝트 총액이 누적 스냅샷 합산이 아니라 `Σ(subagent_total) + 세션별 main 최종값` 으로 산출된다 — 현재 ≈$31,455 의 뻥튀기가 사라진다.
- **AC-2**: 동일 main 세션의 누적 행이 여러 개여도 총액에 1회만(세션 최종값) 반영된다.
- **AC-3**: `cost:aggregatePivot` 의 main scope 행이 세션별 dedup 된 값을 반환한다.
- **AC-4**: GUI 아카이브 총액과 CLI(`productune` 집계) 총액이 일치한다.
- **AC-5**: statusline 이 usage 를 채울 수 있는 경우 main 행 `usage` 가 빈 {} 가 아니다(불가 시 graceful — 회귀 없음).

---

## QA 노트

`turns.jsonl` 픽스처(누적 행 다수 + subagent 행 혼합)로 aggregator 단위 검증 가능 →
**자동 테스트 권장**(헤드리스 가능 영역). 체크: 누적 3행/1세션 → 총액 1회 반영,
subagent 2행 → 합산, 혼합 시 합계 정확. usage 캡처는 hands-on(실 세션) 보조 확인.
