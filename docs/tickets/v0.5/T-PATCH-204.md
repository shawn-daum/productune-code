---
ticket_id: T-PATCH-204
version: v0.5
slug: agent-dispatch-channel-rule
title: doctrine — agent 호출 채널 규칙 명문화 (Agent tool vs portable shell)
type: docs
status: done
phase: 3
assignee: pdt-po
requires_qa: false
qa_status: na
requires_user_gate: false
area_tag: doctrine-delegation
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

여러 기기/프로젝트에서 worker(`pdt-*`)를 어떤 채널로 dispatch하는지가 제각각이었다:
- 어떤 곳은 shell(`claude --print --agent pdt-<persona>`)로 호출
- 어떤 곳은 in-runtime Agent tool(`Agent(subagent_type: pdt-<persona>)`)로 호출

`delegation.md` 에는 shell form("Portable form")과 `SendMessage` 이어가기 우선순위가
각각 흩어져 있을 뿐, **"언제 shell이고 언제 tool인가"** 를 한 곳에서 규정한 룰이
없었다. 그래서 fallback이어야 할 shell이 런타임 안에서도 손에 익은 채로 쓰였다.

## 핵심 발견 (왜 이 규칙이 안전한가)

habit(Tier 0/1/2)은 **두 채널 모두 동일하게 주입**된다 — SessionStart hook
(`packages/core/scripts/hooks/session-start-doctrine.sh`)이 `agent_type=pdt-<persona>`
를 키로 주입하며, 이 값은 Agent tool subagent든 `claude --agent` shell 세션이든
동일하게 채워진다. agent 정의(`packages/core/agents/pdt-*.md`)는 "Act per the
injected productune doctrine" 한 줄뿐 → 전적으로 hook 주입에 의존.

∴ 채널 선택은 **habit 정합성 문제가 아니라 런타임 노출/기능 차이**일 뿐이다.

## 설계 결정 (규칙)

런타임이 노출하는 것에 따라 고른다:

| 상황 | 채널 | 이유 |
|------|------|------|
| Agent tool 노출됨 (po-runner, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | **Agent tool (기본)** | 결과 tool output 자동 회수 + `agentId` → 싼 `SendMessage` 이어가기 + 동시성 |
| 살아있는 같은 subagent 이어가기 | **SendMessage(agentId)** | context 유지, doctrine 재주입 없음 |
| Agent tool 없음 (headless/cron/CI, cross-machine, 의도적 독립 프로세스) | **portable shell `claude --print --agent`** | SID resume 됨. 단 SendMessage 불가 + 매 호출 doctrine 재로딩(토큰) |

Anti-pattern: Agent tool이 있는데 습관적으로 shell — SendMessage 포기 + doctrine
재주입 토큰 낭비.

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `packages/core/doctrine/persona/po/bookshelf/delegation.md` | "Invocation channel" 하위에 `### Channel choice — Agent tool vs portable shell` 추가 |

## Acceptance Criteria

- **AC-1**: delegation.md 에 채널 선택 규칙이 한 블록으로 명시됨 (Agent tool=기본, shell=fallback).
- **AC-2**: habit 주입이 두 채널 동일하다는 근거(SessionStart hook + agent_type)가 규칙에 포함됨 — "habit 정합성 문제 아님"을 못박음.
- **AC-3**: 기존 SendMessage 이어가기 우선순위 섹션과 cross-reference 일관.

## 비고

doctrine-only 변경, QA 불필요. 별도 기기에서 관찰된 channel drift 가 트리거.
SoT = Tier 0 delegation.md.
