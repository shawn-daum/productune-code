---
ticket_id: T-PATCH-255
version: v0.5
slug: surface-silent-tool-permission-failure
title: PO 턴의 tool 실패(특히 macOS TCC 파일접근 거부)가 무응답·무안내로 silent 종료 — actionable 노출 필요
type: impl
status: todo
phase: 4
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-255: surface silent tool/permission failure

## Request

shawn(2026-06-24): 첨부파일(`~/Downloads`) 보내면 PO가 "도구 1개"만 뜨고 응답 없이 "대기 중" —
헷갈림. (sprite 회색은 이 turn-조기종료의 부수증상, sprite 자체는 정상 — T-PATCH-252 cua 재현
확정.)

## 진단 (cua 재현 확정)

5차 dmg cua 재현: 파일 Read 턴 → **macOS TCC 다이얼로그** "Productune … access Downloads folder"
출현. **Allow → PO 정상 응답.** 미허용/Don't Allow(또는 기존 거부 상태) → **Read 거부 → PO 턴이
응답 텍스트 없이 즉시 종료** → "도구 1개" + 대기중, **사용자에게 실패 사유 무안내**. 사용자는 PO가
멈춘/고장난 걸로 인지. (T-PATCH-231 health-smoke는 spawn/turn 레벨 — 이건 **턴 내부 tool 거부/실패**
레벨이라 별개.)

## Acceptance

- **AC-1**: PO 턴이 **tool 실패/거부로 응답 없이 종료**되면(예: Read의 macOS TCC 거부, 파일 ENOENT,
  permission denied) — 조용히 대기중 가지 말고 **actionable 메시지**를 채팅/배너에 노출:
  무엇이 왜 실패했는지 + 다음 행동(예: "Downloads 접근 권한을 시스템 설정에서 허용 / 파일을 다른
  위치로 / 재시도").
- **AC-2 (TCC 특화)**: macOS 파일접근 거부(Downloads/Desktop/Documents TCC) 케이스를 식별해 전용
  안내(시스템 설정 경로 + Retry). 가능하면 첨부 시점에 접근 가능성 사전 체크/안내.
- **AC-3**: 정상 턴 무회귀(성공 시 추가 노이즈 0). tool 성공 turn엔 미발화.
- **AC-4**: silent 종료 자체 방지 — "tool 호출했는데 assistant 응답 0 + 비정상 종료" 패턴을 감지해
  사용자에게 신호(현재 stream-json/exit 신호 활용; T-231 분류기와 정합/재사용 가능하면).

## Out of scope
- macOS 권한을 앱이 대신 부여(불가). TCC 자체 우회. sprite(T-252, 정상).

## Plan
dev: po-runner의 turn-종료 경로에서 "tool 결과 error/denied + assistant 응답 부재" 감지 → actionable
배너/메시지(T-231 SessionHealthBanner 패턴 재사용 검토). TCC 거부 메시지 패턴 매칭(permission/
operation not permitted). 첨부 UX에 권한 힌트. QA: Downloads 첨부 미허용 케이스 cua 재현(거부→안내
노출), 허용 케이스 무회귀.

## Outcome
CARRIED → v0.6 (2026-06-25, shawn 결정 — v0.5 P5 close 시 이월). v0.5에서 미착수. backlog `## next-version` [v0.6] 라인 등재. v0.6 P1에서 PRD 진입 시 deferred_candidate drain.

## Persona Activity
(PO-managed)
