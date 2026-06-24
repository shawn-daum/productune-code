---
ticket_id: T-PATCH-247
version: v0.5
slug: doctrine-gap-reconcile-and-security6
title: doctrine gap 2건 — backlog↔ticket reconcile 룰(state-hygiene) + security_6 6항목 정의(qa/bookshelf)
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
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-247: doctrine gap 2건

## Request

2026-06-23 dmg Deploy 세션에서 발견된 "참조는 있는데 SoT가 없는" doctrine 갭 2건. backlog
pre-deploy APPLY 결정 → 1 티켓 묶음으로 designer author + QA grill (우리 원래 룰).

## Acceptance

### (a) backlog ↔ ticket reconcile 룰 — `state-hygiene.md`에 명문화
backlog 줄과 발행 티켓이 수동 동기라 stale이 쌓임(이번 세션 stale 11 + deferred 4건 sweep 파생).
다음 4규칙을 state-hygiene doctrine에 추가:
- **AC-a1**: APPLY 항목 → 티켓 발행 시 backlog 줄에 `→ T-XXX` 마킹. triage 통과(티켓화 확정) 시 backlog 줄 제거.
- **AC-a2**: 티켓 close(done/abandoned) 시 대응 backlog 줄 제거.
- **AC-a3**: PO write-whitelist (e) 항목을 `append` → `append + resolved-line 제거`로 확장(PO가 해소된 줄을 지울 수 있게).
- **AC-a4**: deferred_candidate가 PRD 항목으로 진입하면 po-state `deferred_candidates[]`에서 제거.

### (b) security_6 6항목 정의 — `qa/bookshelf/`에 명문화
`p3-build.md` close-gate가 "6 security items"를 참조만 하고 doctrine 어디에도 6개 열거가 없음(유령 참조).
- **AC-b1**: `qa/bookshelf/`에 security_6 체크리스트 신규 — T-PATCH-242 잠정 6항목을 base로 정식화:
  `secrets` · `electron-hardening` · `ipc-path` · `deps` · `data-exposure` · `dist-integrity`.
  각 항목에 "무엇을·어떻게 검사" 1~2줄 + pass 기준.
- **AC-b2**: `p3-build.md` close-gate의 "6 security items" 참조가 이 신규 SoT를 가리키도록 cross-ref 정합(유령 참조 해소).

## Out of scope
- reconcile 룰의 자동화 hook 구현(이번은 doctrine 명문화). security 항목 자체의 코드 스캔 자동화.

## Plan
designer가 위 AC대로 doctrine 편집(state-hygiene.md + qa/bookshelf/security-6.md 신설 + p3-build.md cross-ref). cap 준수(트림 선행 필요 시 별도 flag). QA grill로 검증.

## Outcome
shipped — 4 doctrine files (state-hygiene.md reconcile 4규칙 · po/habit.md (e) sync · qa/bookshelf/security-6.md 신설 · p3-build.md cross-ref +generator 포인터). designer author → QA grill qa_status:pass (6/6 AC verbatim, lock-step 양방향, ghost ref 해소, cap clean). QA 비블로킹 nicety(generator 토큰 SoT 포인터) PO 반영.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-designer | author (4 files) | sonnet | done — AC-a3 habit.md location flag self-caught + resolved on 2nd pass |
| pdt-qa | grill | sonnet | qa_status: pass (0 must-fix; 1 non-blocking nicety, PO applied) |
