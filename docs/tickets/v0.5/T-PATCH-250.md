---
ticket_id: T-PATCH-250
version: v0.5
slug: doctrine-tier-map-crisp-and-calibration-discipline
title: doctrine — Tier 0/1/2 위치 정의 single-source 명문화 + calibration-log≠operational-dump 재강조
type: doctrine
status: done
phase: 4
assignee: pdt-designer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: doctrine
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-250: Tier-map single-source + calibration discipline

## Request

2026-06-24 shawn 보고: 다른 프로젝트(paepyeong) PO가 **tier를 뒤집어 설명**(Tier0=`~/.productune`
habit, Tier2=bookshelf — 실제는 정반대)하고, **operational 규칙(Vercel author-gate)을
calibration-log에 dump**(doctrine `po/habit.md:46` "calibration-log은 routing-bias 1-liner
ONLY" 위반)함. doctrine이 틀린 건 아니나(po/habit.md:46 명확), **tier 위치 정의가 한 곳에
crisp하게 없어** 여기저기(promotion-process·habit) 흩어져 PO가 라벨을 헷갈림. 재발 방지 명문화.

## 정확한 tier 맵 (확정 — doctrine 실파일 검증)
- **Tier 0** = `packages/core/doctrine/` — 코어(common + persona `habit.md` + **bookshelf**). 직접 write 금지(Designer flow).
- **Tier 1** = 프로젝트 `docs/<persona>/` (`docs/po/calibration-log.md`·`docs/designer/design-system.md` 등).
- **Tier 2** = `~/.productune/<persona>/` — 개인/글로벌 cross-project (`$HOME/.productune/po/habit.md` 등).
- reader chain: Tier0→Tier1→Tier2, last wins (promotion-process.md:28).

## Acceptance

- **AC-1**: Tier 0/1/2 **위치 정의를 single-source로 명문화**(위 표) — prominent한 한 곳
  (예: `promotion-process.md` 상단 또는 전용 tier-map 블록). 기존 흩어진 언급은 이를 cross-ref
  하거나 중복 제거. bookshelf=Tier0 / `~/.productune`=Tier2 명시(혼동 지점).
- **AC-2**: **calibration-log 규율 재강조 + 분기 crisp화** — operational/infra/product 규칙·결정·
  preference는 calibration-log가 아니라 **Tier1/2 promotion candidate(+user ASK)** 로 간다는 것을
  명확히(이미 `po/habit.md:46`에 있으나, tier-map 옆에 "calibration-log = routing-bias 1-liner ONLY,
  operational/decision → promotion gate" 한 줄 cross-ref 추가). 라벨 혼동 시에도 destination을 못
  틀리게.
- **AC-3**: cap 준수(promotion-process.md 현재 줄수 확인, breach 시 flag; 흩어진 중복 제거로
  net 증가 최소화). ghost ref 0.

## Out of scope
- promotion gate 로직 자체 변경. paepyeong repo의 잘못 기록된 calibration-log 정정(그 프로젝트에서 처리 — 이번은 productune doctrine만).

## Plan
designer: tier-map single-source 블록 author(promotion-process.md 또는 적절 위치) + calibration 분기
cross-ref + 흩어진 라벨 언급 정합. QA grill(특히 single-source 됐는지·중복/ghost 0·cap).

## Outcome
shipped — `promotion-process.md`(85→97) `## Layer priority — tier map (SINGLE SOURCE)` 블록: Tier0/1/2 위치 표 + "bookshelf=Tier0·~/.productune=Tier2" 못박음 + calibration 라우팅 1줄(habit.md:46 cross-ref). `calibration.md`(59→61) 로컬 노트→SoT cross-ref. designer author → QA grill PASS(loop1): tier-map single-source 확인, doctrine 전체 inversion 0, ghost ref 0, cap 97<100(near-cap flag). (paepyeong PO의 tier-라벨 뒤집기 재발 방지.)
- advisory(비블로커): override-원칙이 promotion-process:38 + habit.md:15 양쪽 — mild redundancy(향후 cross-ref 정리 가능). 본 티켓 AC-3 prose의 "line 52" cap 참조는 stale(실제 :64) — 티켓 텍스트만, 파일 정상.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-designer | author (2 files) | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (loop1, 0 must-fix) |
