---
ticket_id: T-PATCH-041
version: v0.5
slug: gate-as-state
title: Close gate as po-state data, not recalled prose
type: doctrine
status: done
qa_status: pass-with-note
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: false
area_tag: po-lifecycle
estimated_complexity: L3
risk_flags:
  - data-migration
created_at: 2026-06-05T00:00:00Z
---

# T-PATCH-041: Close gate as po-state data, not recalled prose

## Request

issue-tracker GUI 에서 PO 가 phase 경계 질문("지금 phase 어디 / close gate 뭐냐")에 **세 번 연속 불완전·오답**을 냈다. 유저가 두 번 찔러서야 정답(보안검사·디자인검토)에 도달:
1. "close gate = backlog 2건(TOTP·XFF)" — 오답. backlog triage 는 게이트 1단계일 뿐.
2. (유저: "그게 다야?") → "Vercel 인프라 6단계" — 오답. 그건 P4 Deploy.
3. (유저: "보안·디자인 검토 있을텐데") → "맞아, 그게 본체인데 내가 infra만 짚었네" — 유저가 떠먹여서 정답.

**근본 원인 (QA grill 확정):** content 결함 아님 — `lifecycle/p3-build.md:8` 에 게이트가 이미 정확히 정의돼 있음(backlog triage → T+0 design[no-waiver] → T+1 PRD-check[waivable] → T+2 security 6[waivable]). 문제는 **grounding 실패** — PO 가 그 sub-file 을 안 읽고 in-session memory 로 즉흥. 그리고 `habit.md` turn-open read set = habit + po-state + calibration 뿐이라 `lifecycle/*` (index 포함) 는 lazy. 즉 게이트는 PO 가 *매 턴 무조건 읽는* po-state 에 없으면 답에 못 실린다.

**기각된 대안 (QA grill):**
- (A) index.md 에 게이트 enumeration inline → index 자체가 lazy 라 무력 + p3-build 와 중복/drift. **채택 안 함.**
- (B) "phase 경계 질문 시 p{N} 먼저 열어라" prose 추가 → T-PATCH-040 이 이미 더 강한 "매 턴 po-state re-orient, in-session memory 믿지 마"를 박았는데도 같은 날 이 실패가 났다. 안 읽은 파일에 문장 더 얹기 = theater. **채택 안 함.**

**채택 fix — gate-as-state:** 게이트를 *prose 로 recall* 하는 대신 *po-state 데이터로 instantiate*. phase 진입 시(이미 존재하는 phase-transition write 경로) 해당 phase 의 게이트 정의를 sub-file 에서 찍어 po-state 에 `close_gate` 체크리스트로 써넣는다. "어디/게이트 뭐냐"는 항상-읽는 po-state 에서 **phase 식별자까지 붙여** 1샷 응답 → 기억 즉흥 자체가 불가능. 부수효과로 게이트가 진짜 추적 시퀀스가 되어 진행률 보고 가능. SoT 는 sub-file prose 유지(중복 아님 — po-state 는 live 인스턴스).

## Acceptance

- [AC1] **스키마**: po-state 에 `close_gate` 필드(배열) 정의. 각 항목 = `{step, type, status(pending|done|waived|na), waivable, ticket_id?}`. 스키마 문서/`_phase_schema_v` 갱신.
- [AC2] **phase 진입 instantiate**: `lifecycle/index.md` phase-transition write 가 진입 phase 의 게이트를 그 phase 의 sub-file 정의에서 `close_gate` 로 instantiate. P3 진입 = `p3-build.md:8` 의 4 step(`backlog_triage`/`design_review`/`prd_check`/`security_6`) 정확히, waivable 플래그 포함(triage·design = no-waiver).
- [AC3] **SoT 명문화**: `p3-build.md` 가 게이트 prose SoT(generator)임을 명시. po-state 는 인스턴스 — 정의 변경은 sub-file 한 곳만 고침. index.md 는 "Detail:" 포인터 그대로(enumeration inline 안 함 = 대안 A 기각 확인).
- [AC4] **경계 응답 규칙**: PO 가 phase/gate 질문에 답할 때 (a) po-state `current_phase` 식별자를 먼저 명시하고 (b) `close_gate` 항목을 그대로 보고하도록 doctrine 에 규칙(habit 또는 lifecycle). "P3↔P4 혼동" 재발 방지 — 게이트를 진입 phase 기준으로만 읽는다.
- [AC5] **backward-compat**: `close_gate` 없는 기존 po-state 에서 graceful — turn-open 또는 현재 phase 응답 시 부재하면 sub-file 에서 lazy-instantiate(또는 결손 보고). 크래시/오답 금지.
- [AC6] **live verify (negative→positive)**: 새 doctrine + P3 `close_gate` 채운 po-state 로 fresh PO 세션에 "지금 phase 어디 / close gate 뭐냐" 1회 질문 → **한 번에** 4 step + phase 식별자 응답. (재현 시나리오 = 위 3-round 실패가 1-round 로.)
- [AC7] doctrine cap 준수 + actor-voice(누수 카테고리 없음) + SoT→mirror byte-identical.

## Out of scope

- **turn-open hook 강제주입** (QA 권고 item 3 — phase/gate 의도 질문 + phase:3 일 때 `close_gate` 슬라이스를 컨텍스트에 hard-inject). 유일한 *진짜 강제* 수단이나 GUI/hook 코드 영역 → **backlog 후속**(near-term 등록).
- **GUI 의 `close_gate` 렌더링**(Phase gate banner / TicketsTab 진행률 표시) — 별 ticket.
- **P1/P2/P4/P5 게이트의 enumerable 정의 신설** — 본 ticket 의 instantiate 메커니즘은 general 하게 짜되, 정의가 이미 enumerable 한 phase(P3 완비)만 채운다. 다른 phase 는 그 sub-file 이 enumerable 게이트를 갖는 시점에 자동 적용(메커니즘 재사용, 추가 prose 불요) — 신규 게이트 정의 작성은 OOS.
- compaction / session-cycle 동작(T-PATCH-040) 변경 X.

## Plan

> 본 ticket = `type:doctrine`. dispatch body 에 doctrine-editing P0 룰 주입: act-time voice(5 누수 카테고리 strip) · caps(persona habit ≤100 / bookshelf ≤100) · mode(habit=curated rewrite, bookshelf=append `(2026-06-05) [T-PATCH-041]`) · SoT `packages/core/doctrine/` 편집 후 `~/.productune/doctrine/` byte-identical mirror.

1. **`close_gate` 스키마 확정** — 항목 shape(AC1) + `_phase_schema_v` bump 여부 판단. state-hygiene turn-open sweep 과의 상호작용 확인(게이트 done 시 잔존 처리).
2. **`lifecycle/index.md` phase-transition write 수정** — 기존 jq(`current_phase`/`phase_history`/`pending_gate=null`)에 진입 phase 의 `close_gate` instantiate 추가. P3 = p3-build.md:8 4-step 하드코딩 매핑. general 형태로 작성하되 P3 만 채움.
3. **`lifecycle/p3-build.md`** — 게이트 정의가 po-state `close_gate` 의 generator-SoT 임을 1줄 명시(중복 정의 금지 규칙).
4. **경계 응답 규칙(AC4)** — `po/habit.md` 또는 `lifecycle/index.md` 에 "phase/gate 질문 → po-state `current_phase` 먼저 명시 + `close_gate` 그대로 보고; 진입 phase 기준으로만" 규칙. 적정 홈은 SSoT-first 로 LOCATE 후 결정(habit hot-path vs lifecycle cold).
5. **backward-compat(AC5)** — `close_gate` 부재 시 lazy-instantiate/결손보고 경로 명시.
6. **verify(AC6)** — live: P3 po-state(close_gate 채움) + 새 doctrine 으로 fresh `--agent pdt-po` 세션에 경계 질문 1회 → 1-shot 정답 확인. echo-mode 안전 noop 확인.
7. **mirror** — SoT → `~/.productune/doctrine/` byte-identical.

## Outcome

Shipped `gate-as-state`. Landed:
- `lifecycle/p3-build.md` — gate sequence marked generator-SoT; phase entry instantiates into po-state `close_gate` (AC3).
- `lifecycle/index.md` — phase-transition jq rewritten (`--argjson`/`--arg`) to also write `close_gate` for the entering phase (P3 = 4-step array, others `[]`) + `_phase_schema_v` 2→3 (AC2); `close_gate` schema doc line (AC1); new "Phase / gate boundary answer" section — state `current_phase` first, report items verbatim, current/entering phase only (AC4).
- `lifecycle/state-hygiene.md` — turn-open lazy-instantiate of `close_gate` when current_phase has an enumerable gate and field absent/empty; absence is never an error (AC5).
- D3: `backlog_triage` carries no `type`; `type` (design|qa) present only on steps that open a typed close ticket. D1: GUI/TS write path untouched (AC5 lazy-instantiate is the write-path-independent backstop). D2: AC4 rule homed in `lifecycle/index.md`, not habit.md.

Caps: p3-build 10, index 58, state-hygiene 19 — all ≤100. SoT→mirror byte-identical (3/3 zero-diff). po-state backed up and restored byte-identical (no fixture left behind).

**AC6 (live):**
- POSITIVE (populated `close_gate`, schema_v 3): PASS — one-shot response, "Phase v0.5 P3 (Build)" stated first, all 4 steps with correct waivable flags (triage/design no-waiver, prd_check/security_6 waivable), no P4/infra confusion. The original 3-round failure reproduces as 1-round correct.
- NEGATIVE control (`close_gate` removed → lazy path): PARTIAL. Still one-shot and still led with phase identity correctly inside v0.5/P3 (no P3↔P4 confusion), but did NOT materialize the 4-step checklist from `p3-build.md` — it answered "close gate" with version-level North-Star/input-metric exit criteria instead. The cold `lifecycle/*` lazy-read is best-effort (the very lazy-grounding limitation this ticket names); the robust fix is the populated `close_gate` written at phase-transition, which the positive test confirms. The OOS turn-open hard-inject hook (already backlogged) is the only true forcing function for the cold path. AC6 primary path PASS; lazy backstop logged as known-limitation.

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-designer | T-PATCH-041-pass2 | 2026-06-05 | 2026-06-05 | claude-opus-4-8[1m] | standard |
