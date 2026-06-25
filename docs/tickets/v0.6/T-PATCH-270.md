---
ticket_id: T-PATCH-270
version: v0.6
slug: worker-state-to-gui-presence
title: cluster B — worker subagent 상태/출력→GUI (워커 스프라이트 활성화 #10 + 라이브 출력 streaming #9)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: gui
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T03:10:00Z
---

# T-PATCH-270 (cluster B): worker subagent 상태/출력 → GUI presence

design SoT = T-PATCH-259 목업(scene 3/4) + dev_handoff_precondition (i). PRD v0.6 #10/#9.

## Acceptance
- **AC-#10 (워커 스프라이트 활성화, backbone)**: 워커 페르소나(Designer/Developer/QA)가 작업 중일 때 스프라이트가 working 상태로 활성화(현재 회색-idle 고착). subagent active 상태→presence store 배선. cf. T-PATCH-252(PO sprite working, 워커판 미적용). idle→working→done(2s flash)→idle.
- **AC-#9 (라이브 출력 streaming)**: active 워커의 라이브 출력을 presence row 스프라이트 우측에 read-only streaming. **responsive**: 넓으면 우측 인라인 고정높이 / 좁으면 row 세로확장. **latest-active-1**(병렬 시 가장 최근 워커 1명만, split/탭 없음). **PO 제외**. po-runner nested-event 필터(po-runner.ts:690 부근)가 현재 워커 출력을 PO 스트림에서 제거 중 → 워커 출력을 GUI presence로 파이프.
- AC-무회귀: PO sprite/스트림(T-252) 무회귀. 성공 외 노이즈 0.

## Plan
dev plan-first(별도). setPersonaState(persona,working|done) 배선(personaIdFromAgentType) + 워커 nested transcript를 read-only로 presence store에 파이프(tail only, node-pty 아님). PersonaPresenceBar 우측 슬롯 responsive. QA: 워커 작업 중 스프라이트 활성+스트림 노출, PO 제외, 무회귀(일부 cua/hands-on).

## Outcome
done — dev plan-first → impl → QA GRILL+codereview(pass, 주석 1건만). #10 스프라이트 활성화: 진단=working이 parent top-level Agent tool_use(subagent_type)에만 설정되는데 `--include-partial-messages`로 partial이 detail 없이 와서 never-working → **ground-truth 백스톱**(워커 nested 출력 오면 working 재확정) + selectActiveWorker(PO 하드제외) slot-suppression 픽스. T-252 PO path 무손상. #9 출력 스트림: po-runner nested-event tap(라인 coalesce, parent_tool_use_id→persona, TodoWrite/토큰 NOISE-0) → po:worker-stream IPC → bounded ring(6) → PersonaPresenceBar responsive 슬롯(≥380 inline/<380 stacked), done시 collapse. QA: PO 무회귀·resurrect 불가·flush-before-done 확인. 런타임 cua/hands-on flag(스프라이트 idle→working→done·스트림 라이브·sidechain 마커 shape T-165/166급).

## Persona Activity
(PO-managed)
