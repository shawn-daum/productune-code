---
ticket_id: T-PATCH-042
version: v0.5
slug: close-gate-deterministic-sweep
title: Deterministic close_gate self-heal in turn-open sweep
type: doctrine
status: done
qa_status: pending
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: po-lifecycle
estimated_complexity: L2
risk_flags:
  - data-migration
created_at: 2026-06-05T00:00:00Z
---

# T-PATCH-042: Deterministic close_gate self-heal in turn-open sweep

## Request

T-PATCH-041 (gate-as-state) 의 AC5 lazy-instantiate 가 **prose-LLM-best-effort** 라 negative-control 에서 PARTIAL — `close_gate` 없는 po-state 에서 PO 가 4-step 게이트를 재구성 못 하고 version-level exit-criteria 로 오답. 이건 **기존 mid-P3 po-state**(이 doctrine 보다 먼저 P3 진입한 프로젝트들) 에 해당 — 이 기기뿐 아니라 **다른 기기**에서 doctrine pull 후에도 같은 약점.

해결: AC5 를 prose 가 아니라 **turn-open sweep jq 가 결정적으로** 처리. sweep 은 이미 매 turn 도는 jq 패스(`state-hygiene.md` line 5) — 거기서 `current_phase` 가 enumerable gate(P3) 이고 `close_gate` 부재/빈 배열이면 그 배열을 결정적으로 write. LLM recall 의존 0, GUI hook 불요. 기존/타-기기 mid-P3 po-state 가 doctrine pull 직후 다음 turn-open 에 자가치유.

**단일 SoT 유지가 핵심 제약**: 4-step 배열이 phase-transition write(`index.md`) 와 sweep(`state-hygiene.md`) 두 jq 사이트에 중복되면 drift — T-PATCH-041 이 막으려던 바로 그것. 두 사이트가 한 정의를 참조하는 메커니즘을 plan 에서 확정.

## Acceptance

- [AC1] **결정적 instantiate**: turn-open sweep 이 `current_phase` enumerable gate(P3) && `close_gate` 부재/빈 배열일 때 4-step 배열을 jq 로 결정적 write. LLM 판단 개입 없음.
- [AC2] **단일 SoT / no drift**: 4-step 배열이 transition write 와 sweep 에 물리적으로 중복되지 않음(또는 중복 시 1곳이 명시적 derived). p3-build.md 가 정의 SoT 라는 T-PATCH-041 AC3 불변.
- [AC3] **idempotent**: `close_gate` 가 이미 채워진(진행중 status 포함) po-state 에서 sweep 이 덮어쓰지 않음 — 부재/빈 일 때만 instantiate.
- [AC4] **non-P3 무영향**: enumerable gate 없는 phase 는 sweep 이 `close_gate` 안 건드림(빈 채로).
- [AC5] **state-hygiene 정합**: 기존 turn-open sweep 동작(recent_turns trim / pending_gate clear / current_task·persona_sessions sweep) 회귀 없음. 한 jq 패스 유지(추가 패스 금지).
- [AC6] **live verify**: `close_gate` 제거한 P3 po-state → fresh PO turn-open 1회 → `close_gate` 가 4-step 으로 materialize + 경계 질문에 1-shot 정답(T-PATCH-041 negative-control 이 이제 PASS).
- [AC7] cap 준수 + actor-voice + SoT→mirror byte-identical.

## Out of scope

- GUI write-path parity (`state.ts`) — 별 backlog item.
- turn-open hard-inject hook — 별 backlog item (본 ticket 이 결정적 sweep 으로 hook 필요성 상당부분 흡수하나, 의도질문 기반 context 주입은 별개).
- P1/P2/P4/P5 게이트 enumerable 정의 신설 — P3 만.

## Plan

> `type:doctrine` — dispatch 에 doctrine-editing P0 룰 주입(act-time voice / caps bookshelf ≤100 / bookshelf append `(2026-06-05)[T-PATCH-042]` / SoT→`~/.productune/doctrine` byte-identical mirror).

1. **단일-SoT 메커니즘 확정 (plan-first 핵심)** — transition write(index.md)와 sweep(state-hygiene.md)가 4-step 배열을 어떻게 1정의로 공유하나? 두 jq 가 서로 다른 turn 에 실행돼 shell var 공유 불가. 후보: (a) 한 곳(index.md)에 canonical jq 조각으로 정의 + sweep 은 "transition write 가 만드는 동일 배열" 참조 + 실제 리터럴은 한 곳만, (b) p3-build.md 정의를 양쪽이 동일 매핑으로 명시 참조하되 리터럴 1회. plan 에서 drift-free 안 확정.
2. **sweep jq 확장** — state-hygiene.md line 5 한 패스에 close_gate 조건부 instantiate 추가(부재/빈 && P3). idempotent + non-P3 무영향.
3. **AC5 prose 정리** — T-PATCH-041 이 넣은 state-hygiene 의 prose lazy-instantiate 줄을 결정적 버전으로 교체(중복/모순 제거).
4. **verify** — negative-control 재현이 PASS 되는지 live.
5. **mirror** — SoT→`~/.productune/doctrine` byte-identical.

## Outcome

Mechanism (c) implemented — single executable `close_gate` literal lives ONLY in the turn-open sweep (`state-hygiene.md`); entry-write delegates.

- **state-hygiene.md** (29 lines, cap 100): removed T-PATCH-041 prose-lazy pointer line (concept superseded, tag dropped); folded a deterministic `close_gate` clause into the SAME single jq pass — fires only on `current_phase==3 && (.close_gate // [] | length==0)`. Idempotent (in-progress items untouched), non-P3 no-op, future phases extend as elif chain. `[T-PATCH-042]`.
- **index.md** (54 lines, cap 100): phase-transition write no longer carries the 4-step literal — `.close_gate = []` only. Schema-doc prose updated: literal materialized by the sweep (sole executable site), relies on fresh-cycle-at-phase-boundary, sweep heals both `[]` and absent so jq + GUI `phase:approve` converge. Kept the T-PATCH-041 shape sentence + "Definition SoT = p3-build.md; never enumerate gate steps here." `[T-PATCH-042]`.
- **p3-build.md**: NO CHANGE (prose definition-of-record).

AC mapping: AC1 deterministic instantiate ✓ · AC2 single executable literal, no drift; p3-build.md still definition SoT ✓ · AC3 idempotent ✓ · AC4 non-P3 no-op ✓ · AC5 one jq pass, no second invocation ✓ · AC6 jq tests PASS, live PO turn pending-live ⏳ · AC7 cap + actor-voice + byte-identical mirror ✓.

**Mirror**: state-hygiene.md, index.md, p3-build.md all `diff` ZERO vs `~/.productune/doctrine`.

**AC6 verify** (echo-safe, live state backed up→restored byte-identical):
- T2 negative control: `del(.close_gate)` on P3 fixture → sweep → exact 4-step array, all `status:"pending"` — PASS.
- T3 idempotent: step[0]→`done`, re-run → not reset — PASS.
- T4 non-P3: `current_phase:2` + no close_gate → stays absent — PASS.
- T5 live PO turn-open (T-PATCH-041 negative-control replay): `claude` CLI present but NOT spawned — nested live PO turn risks live-state mutation / recursion; deterministic jq (T2-T4) already proves the heal. **Pending-live, user-verifiable.**

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-designer | T-PATCH-042-pass2 | 2026-06-05 | 2026-06-05 | opus-4-8[1m] | standard |
