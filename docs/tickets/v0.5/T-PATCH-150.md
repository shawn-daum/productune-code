---
ticket_id: T-PATCH-150
version: v0.5
slug: doctrine-sendmessage-and-dev-conventions
title: doctrine — delegation.md SendMessage 이어가기(Tier0) + dev Tier1 룰 2개(headless 권한 플래그 / keyframe 소유)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: doctrine-drain-0616
risk_flags: [core-doctrine, tier0-edit, mirror-sync]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-150: doctrine drain (SendMessage + dev conventions)

doctrine 편집 = designer 위임. 3개 edit. PO가 반환 후 mirror byte-identical 확인 + grill.

## Edit 1 — delegation.md (Tier 0 core, PO) : subagent 이어가기 = SendMessage

위치: `packages/core/doctrine/persona/po/bookshelf/delegation.md` (현재 "Per-ticket fresh, per-turn resume … within-ticket multi-turn uses `--resume "$SID"`" 구간).

추가/정정: PO가 subagent를 컨텍스트 유지한 채 이어 시킬 때 = **`SendMessage(to: agentId)`** (env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 활성 시 노출, po-runner가 설정 — T-PATCH-149). 
- 이어가기 우선순위: SendMessage(agentId) 사용 가능하면 그것으로(토큰 효율·컨텍스트 유지); 도구 미노출/실패 시에만 fresh 재디스패치 + context replay(읽을 파일 + 직전 산출 요약 + "FIRST action MUST be Read" 선두).
- one-shot agent(Explore/Plan)은 agentId 반환 안 함 → 이어가기 불가, general-purpose/custom(pdt-*)만 가능.
- 기존 `--resume "$SID"`/persona_sessions 서술과의 관계 정리(메인-세션 resume vs subagent SendMessage 구분).

## Edit 2 — dev Tier 1 : headless spawn 권한 플래그 규칙

위치: 프로젝트 Tier 1 dev doctrine(`docs/developer/habit.md` 또는 그 bookshelf — 실제 경로 확인). 없으면 적절 위치 designer 판단.

룰: `claude --print`(headless, no-TTY)로 spawn 시 `.claude/settings.json`의 `permissions.defaultMode`는 **무시됨** → 권한모드는 CLI `--permission-mode` 플래그로 전달해야 함(또는 `~/.claude/settings.json`). 안 그러면 비-TTY에서 도구권한 막혀 세션 abort. (출처: T-PATCH-147, claude-code-guide 확인.)

## Edit 3 — dev Tier 1 : 컴포넌트 keyframe 소유 규칙 (QA grill PROMOTE)

위치: Edit 2와 동일 dev Tier 1.

룰: React 컴포넌트는 **다른 컴포넌트가 런타임 주입하는 전역 CSS 식별자(@keyframes 명/클래스명)에 이름으로 의존하지 말 것** — 소유 컴포넌트가 바뀌면 조용히 깨짐(콘솔 에러·빌드 실패 없음, 정적분석/lint로 못 잡음). 각 컴포넌트는 자기 애니를 **자체 once-guard로 주입**(고유 STYLE_ID + 고유 keyframe명). 경계: `styles/*.css`의 **명시적 공유 keyframe**(빌드 타임 정적, 예 `pdt-persona-blink`)에 의존하는 건 OK. (출처: T-144→커서 회귀 + PendingGateChip 잠복 버그, T-PATCH-148/149.)

## Acceptance

- AC-1: delegation.md에 SendMessage 이어가기 규약 반영(우선순위 + one-shot 예외 + fresh fallback).
- AC-2: dev Tier1에 headless 권한 플래그 룰 + keyframe 소유 룰 추가.
- AC-3: Tier 0(delegation.md) 변경분 ~/.productune mirror byte-identical (PO가 cp/검증 — designer는 SoT만 편집, PO mirror-sync).
- AC-4: 기존 서술과 모순 없음(additive/clarify), 라인 cap 위반 없음.

## Note
- designer는 SoT(packages/core/doctrine + docs/) 편집만. PO가 반환 후 mirror 동기화 + grill(Tier0 edit이므로).
- one-shot/SendMessage 사실은 claude-code-guide 확인분 — 추측 금지.
