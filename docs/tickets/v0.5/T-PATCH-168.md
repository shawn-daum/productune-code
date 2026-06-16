---
ticket_id: T-PATCH-168
version: v0.5
slug: postate-write-safety-jq-atomic
title: po-state 쓰기 안전성 — 손편집(append/sed) JSON 손상 방지 (jq atomic) + active-scratch trade-off
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [core-doctrine, write-safety]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-168: po-state 쓰기 안전성

## 배경 (paepyeong repro)
PO가 po-state의 `current_task.progress.done[]` 배열에 항목을 **문자열 append(sed/heredoc 등)로 손편집**하다 **쉼표 누락** → 파일 전체 JSON 파싱 불가 → GUI 버전 표시 깨짐(T-167). 1글자 실수가 전체 po-state를 무력화.

## 근본 + trade-off
- active-scratch 허용(T-153/154)으로 PO가 current_task에 rich progress를 유지 → 그걸 **손편집**하면 JSON 손상 위험이 큼.
- 규칙 부재: PO가 po-state를 raw 텍스트로 편집(Write/sed/heredoc) 가능 → 문법 깨짐.

## Edit (doctrine — Tier0/1)
1. **po-state 쓰기는 jq(또는 python json) atomic merge로만** — 문자열 append/sed/heredoc로 JSON 구조(배열/객체) 손편집 금지. (calibration "po-state 손편집 금지" 류 강화.) delegation.md/state-hygiene.md에 1줄 룰.
2. **active-scratch 손편집 위험 명시**: progress 등 배열 scratch를 손으로 늘릴 때 jq `.current_task.progress.done += [...]` 처럼 구조-안전 연산만.
3. (검토) active-scratch(T-153/154) trade-off 재고: 손편집 위험 vs brief-only. → 본 티켓은 "쓰면 jq로"로 위험 완화(전면 재고는 별도). designer 판단.

## Acceptance
- AC-1: doctrine에 "po-state JSON 쓰기 = jq/atomic only, 문자열 손편집 금지" 룰 추가.
- AC-2: active-scratch 배열 갱신 시 구조-안전 jq 패턴 명시.
- AC-3: Tier0 변경 시 mirror 동기화(PO).

## Note
- 짝꿍 T-167(GUI는 손상에 견고)과 함께 = 방어 2층(쓰기 안전 + 읽기 견고).
