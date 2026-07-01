---
ticket_id: T-PATCH-279
version: v0.6
slug: sprite-presence-async-agent-teams
title: 워커 sprite가 디스패치 직후 idle로 꺼짐 — async agent-teams spawn이 blocking 전제 presence 모델을 깨뜨림 (pdt only)
type: impl
status: user-verify
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui
estimated_complexity: L3
risk_flags: [event-model, regression-risk]
created_at: 2026-06-30T23:17:27Z
---

# T-PATCH-279: 워커 sprite presence — async agent-teams spawn 회귀

shawn 보고(enneagram-mentor): designer가 PRD 작성 중인데 Designer sprite는 idle, PO sprite만 움직임. **pdt only** — pdtl(lite)은 아직 GUI 없으니 범위 외.

## 근본 원인 (확정)
po-runner가 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`로 PO를 띄움(`po-runner.ts:844`). 그런데 sprite presence 모델(T-148/164/270)은 **blocking 디스패치 전제** = "Agent 도구 호출의 `tool_result` == 서브에이전트 완료".

agent-teams 모드의 Agent 도구는 **async**: 호출 시 *즉시* spawn-ack `tool_result`가 돌아옴(완료 아님). 결과:
1. PO `Agent(pdt-designer)` 호출 → `delegating` → designer **working** (찰나)
2. spawn-ack `tool_result` 즉시 도착 → `po-runner.ts:1383` 역참조 → `subagent-done(designer)` → working→done→2s 후 idle. **(오발화)**
3. 동시에 `delegatedByToolUseId.delete(tool_use_id)`(`po-runner.ts:1382`) → 이후 designer가 백그라운드에서 내보내는 nested 출력의 persona를 못 풀어서 **worker-stream 백스톱(#10, poEvents.ts:243-245)도 못 깨움**
4. PO turn 종료 → `healthy` emit → poEvents.ts:445-457이 남은 working 워커 전부 done 일괄 전이
5. designer 실제 완료는 새 PO turn(idle/teammate 신호)으로 도착 — delegating 없음

→ sprite는 디스패치 직후 ~2초 깜빡이고 idle, PO만 streaming으로 계속 움직임.

## Acceptance
- **AC-1**: agent-teams async 디스패치에서 워커(designer/dev/qa) sprite가 **실제 작업 기간 내내 working** 유지 — spawn 직후부터 실제 완료까지. enneagram-mentor P1(designer PRD 작성)로 재현·확인.
- **AC-2**: spawn-ack `tool_result`를 완료로 오인하지 않음 — 즉시 `subagent-done` 발화 금지. 완료는 실제 teammate 완료/idle 신호로 구동.
- **AC-3**: 워커 완료 시 정상적으로 done flash → idle 복귀(T-164 동작 보존). 병렬 디스패치(여러 워커 동시)에서 각자 독립.
- **AC-4**: 무회귀 — PO sprite(streaming 구동), blocking 경로(있다면), `healthy` 기반 banner/statusbar.

## Plan (개발자 — 진단은 위, 아래는 방향)
dev: async-spawn 구분이 핵심. (a) spawn-ack `tool_result`와 실제 완료 신호를 분별 — agent-teams에선 완료가 별도 이벤트(idle_notification / teammate-done)로 옴; spawn-ack에서 `subagent-done` 발화 + delegation 매핑 삭제를 하지 말 것. (b) `delegatedByToolUseId` 매핑을 백그라운드 작업 동안 유지 → worker-stream(po:worker-stream)이 persona 풀어서 working 유지(#10 backstop가 ground-truth 역할). (c) `healthy`의 "워커 전부 done"(poEvents.ts:445-457) 일괄 처리를 async에 맞게 — parent turn 종료가 워커 종료를 의미하지 않음. 실제 완료/idle 신호로만 done. 정확한 agent-teams 이벤트 스키마(완료가 어떤 stream-json 형태로 오는지)를 raw 세션으로 먼저 확인하고 구현. qa: enneagram-mentor에서 P1 designer 디스패치 → sprite working 지속 확인.

## Outcome
**Code-complete + QA CLEAN (static). Pending user live-confirm.**

Root cause confirmed via raw agent-teams stream-json probes (not guessed): Agent-tool `tool_result` under `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is an immediate spawn-ack ("Async agent launched successfully…"), NOT completion. Real completion = `system/task_notification{status}` keyed by the original Agent tool_use_id; lifecycle also emits `task_started` / `task_progress` / `task_updated`.

Fix (electron/po-runner.ts + src/store/poEvents.ts):
- `isAsyncSpawnAck()` → spawn-ack is a no-op (no subagent-done, delegation mapping KEPT so nested output sustains `working`).
- Consume `task_started`/`task_progress` → bind tool_use_id→subagent_type + emit persona-aware `delegating` (working).
- `task_notification` acts on ANY terminal status: `completed`→`completeDelegation` (subagent-done + cost flush once); non-success terminal (live-confirmed **`stopped`**+**`killed`**; defensive failed/cancelled/error/aborted)→`cancelDelegation` (subagent-done + map cleanup, NO cost row).
- NEW `task_updated` handler: terminal `patch.status` reconciled via task_id→tool_use_id map (task_updated lacks tool_use_id). Both close paths IDEMPOTENT (`.has()` guard) → the abort dual-signal (stopped THEN killed) closes once.
- REMOVED the `healthy → flip-ALL-workers-done` sweep (poEvents old :445-457) — parent turn-end no longer kills background workers.
- Safety net: `poOnSessionRestarted` now also `usePersonaPresence.resetAll()` (covers no-terminal-signal-ever; correctly scoped — fires only on session-cycle/manual-restart, never plain abort, so no live worker nuked).

QA (qa-bugfix, 2 rounds): round 1 found the stuck-sprite regression (terminal≠completed → sprite hangs forever, no rescue); round 2 after fix = CLEAN (a gap-closed · b idempotent/parallel-safe · c task_id map leak-free · d happy+legacy intact · e resetAll scope safe · f build PASS). build: tsc+locale+vitest 3/3 PASS (tests don't cover runner — green smoke, not behavioral).

**Live-confirm REQUIRED (user, in running enneagram-mentor):** (1) AC-1 — worker sprite stays `working` through a real designer dispatch; (2) aborted/interrupted worker → sprite returns to idle (verifies stopped/killed actually fire).

## Persona Activity
PO orchestrated. dev-bugfix (impl, 2 rounds) · qa-bugfix (verify, 2 rounds).

## Persona Activity
(PO-managed)
