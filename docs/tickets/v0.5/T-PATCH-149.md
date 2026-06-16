---
ticket_id: T-PATCH-149
version: v0.5
slug: agent-teams-env-and-grill-cleanups
title: po-runner SendMessage env 활성 + grill 파생 cleanup (helpers 매핑 수렴 + PendingGateChip 죽은 애니)
type: code
status: review
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: po-runner-agent-teams
risk_flags: [core-runtime, experimental-flag]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-149: agent-teams env + grill cleanups

3개 독립 변경(코드). 각각 단일 지점.

## 1. po-runner SendMessage(agent-teams) env 활성

`packages/gui/electron/po-runner.ts` `spawnClaude` 의 `env` 객체(~460, 현재 `{ ...process.env, NO_COLOR: '1' }`)에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'` 추가.

- 효과: spawn된 PO 세션에 `SendMessage` 도구 노출 → PO가 subagent를 agentId로 이어가기 가능(fresh 재디스패치 대신). (claude-code-guide 확인: 이 env가 유일한 게이트, headless `--print`에서도 동작.)
- ⚠️ experimental 플래그 — auto-resume + TeamCreate/TeamDelete 도구도 함께 활성. 주석 1줄로 사용자 결정(2026-06-16) + experimental 명시.
- 도구 사용 규약(언제 SendMessage vs fresh)은 T-PATCH-150 doctrine(delegation.md)에서 다룸 — 본 티켓은 노출만.

## 2. (A chore) persona-id 매핑 수렴

QA grill 결과: 매핑 단일소스로 실제 합칠 곳은 `helpers.ts` 1곳뿐(나머지는 출력 도메인 다름 — 손대지 말 것).

- `packages/gui/src/views/workspace/shell/helpers.ts:336-337` 의 slice+조건분기 `pdt-*→dotKey` 를 `personaIdFromAgentType()`(personaPresence.ts, T-148 단일소스) 사용으로 교체. import 추가.
- `personaPresence.ts:40` 의 `TODO(chore)` 수렴 목록에서 **helpers.ts 항목 제거**(workspace.ts/useBackgroundTasks.ts는 출력 타입이 달라 수렴 대상 아님 — TODO에 그 사유 1줄 남기거나 항목 정리).
- 동작 동일 검증(같은 입력 → 같은 PersonaId).

## 3. (B cleanup) PendingGateChip 죽은 애니 fix

QA grill 발견 — `packages/gui/src/components/workspace/chat/PendingGateChip.tsx:249` 가 `animationName: 'persona-blink'` 참조하나 그 keyframe은 이제 존재 안 함(globals.css 부재, T-144가 제거) → pulse 애니가 **조용히 죽어있음**.

- fix: `pdt-persona-blink`(이미 `styles/md-recipes.css:480`에 정의된 의도된 공유 keyframe) 로 교체. (런타임 주입 keyframe 의존 금지 경계 = 공유 CSS-module keyframe은 OK — T-150 doctrine과 정합.)
- 교체 후 pulse 애니가 실제 동작하는지(빌드+코드상) 확인.

## Acceptance

- AC-1: po-runner spawn env에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'` 포함. build PASS.
- AC-2: helpers.ts 매핑이 `personaIdFromAgentType` 사용, 동작 동일. personaPresence TODO 정합.
- AC-3: PendingGateChip이 정의된 keyframe(`pdt-persona-blink`)을 참조 — 죽은 `persona-blink` 참조 제거.
- AC-4: `pnpm --filter @productune/gui build` PASS. 스코프 외 파일 무변경.

## Note
- react-best-practices 준수. experimental env는 GUI 재빌드/재실행 후 적용.
