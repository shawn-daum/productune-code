---
ticket_id: T-PATCH-239
version: v0.5
slug: lesson-capture-routing
title: PO turn-lifecycle에 무조건 lesson→destination classify-then-route 분기 추가
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L1
risk_flags: [tier0-behavior-change, lifecycle]
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-239: lesson capture routing — calibration-log vs Tier1/2 promotion 무조건 분기

## Request

durable lesson/decision가 gate 없이 calibration-log로 auto-dump되고, PO가 이를
Tier1/2 promotion 후보로 surface하거나 "프로젝트 기억에 넣을까요?"를 묻지 않는
discretionary-skip 실패를 Tier0 PO turn-lifecycle에서 차단한다.

배경:
- calibration-log.md = PO mechanical-write whitelist → auto-append, gate 없음.
  project Tier1 habit(`docs/po/habit.md`)은 whitelist 아님 → promotion gate(ask first) 필요.
- 관측 실패: durable operational decision(deploy-infra fix류)이 calibration-log로
  auto-write됐고 PO가 Tier1/2 후보로 안 띄움 + ask 생략. user가 수동 요청해야 했음.
- calibration-log header schema는 이미 routing-bias 1-liner 전용이라고 명시
  ("교훈/essay는 project-notes로") → lesson dump는 schema 위반.
- 동형 실패: 194(additive≠safe) / 211·212 / 215 — frictionless auto-write 경로 옆의
  discretionary gate("ask first")가 합리화로 우회됨. 검증된 fix = gate를 UNCONDITIONAL로
  만들어 discretion 제거.

SoT 변경: `packages/core/doctrine/persona/po/habit.md`, anchor = `## Turn lifecycle
→ 5. Report to user`의 "On task close: ... calibration-log ... hygiene close" 불릿(line ~46).
whitelist semantics나 새 write 경로는 건드리지 않음 — classify-then-route 행동 + ask만 추가.

## Acceptance

- **AC-1 (무조건 분기)**: anchor에 UNCONDITIONAL classify-then-route 불릿이 존재한다.
  durable lesson/rule/decision/preference surface 시 write BEFORE에 destination을 분류:
  routing-bias 1-liner → calibration-log(auto); rule/decision/preference(esp.
  operational/infra/product) → Tier1/2 promotion candidate → surface + ASK
  "add to project memory?" (never auto-write, calibration-log line으로 대체 금지).
  "if it seems durable enough" 식 discretionary skip 없음 — unconditional(194/211/215 해소와 동형).
- **AC-2 (calibration-log scope)**: doctrine 본문이 calibration-log를 routing-bias
  1-liner ONLY로 명시하고 lesson/decision dump가 아님을 명시한다(close 불릿의 calibration
  line도 routing-bias로 한정).
- **AC-3 (mirror byte-identical)**: `~/.productune/doctrine/persona/po/habit.md`가 SoT와
  byte-identical (`cmp` rc0).
- **AC-4 (cap)**: SoT habit.md ≤100 lines 유지(변경 후 48).
- **AC-5 (QA)**: 독립 QA — anchor 분기 present + actor-voice(leak category 없음) +
  calibration-log scope 명시 + mirror cmp rc0 + cap ≤100 확인.

## 참고

- 선행 동형 계보: calibration entries T-PATCH-194 / 211·212 / 215 (discretionary→unconditional).
- whitelist 항목(c) project calibration-log는 그대로 — auto-write 자격 유지, dump 용도만 차단.
