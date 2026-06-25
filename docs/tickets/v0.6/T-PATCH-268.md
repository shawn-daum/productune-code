---
ticket_id: T-PATCH-268
version: v0.6
slug: tcc-silent-fail-actionable
title: PO 턴 tool 실패(macOS TCC 파일접근 거부) silent 종료 → actionable 노출 (#6, T-255 carry)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-268 (#6): TCC silent-fail actionable (carry from v0.5 T-255)

## Request
PO 턴이 tool 실패/거부(특히 macOS TCC Downloads/Desktop/Documents 접근 거부, ENOENT, permission denied)로 응답 텍스트 없이 종료 → "도구 1개" + 대기중만, 실패 사유 무안내. (v0.5 T-PATCH-255 본문 SoT 참조.)

## Acceptance
- AC-1: PO 턴이 tool 실패/거부로 응답 없이 종료 시 actionable 메시지(무엇이 왜 실패 + 다음 행동)를 채팅/배너에 노출. silent 대기중 금지.
- AC-2(TCC): macOS 파일접근 거부 케이스 식별 → 전용 안내(시스템 설정 경로 + Retry).
- AC-3: 정상 턴 무회귀(성공 시 노이즈 0). "tool 호출했는데 assistant 응답 0 + 비정상 종료" 패턴 감지(stream-json/exit 신호; T-231 분류기 재사용 검토).

## Plan
dev: po-runner turn-종료 경로에서 tool error/denied + assistant 응답 부재 감지 → actionable surface(T-231 SessionHealthBanner 패턴). TCC permission 메시지 패턴 매칭. **주의: T-PATCH-263(#8, 같은 po-runner.ts) 다음 순차(263→268, 한 dev).** QA: cua-vm Downloads 첨부 미허용 케이스(거부→안내 노출).

## Outcome
done — po-runner turn-end close 핸들러: tool error/denied + assistantTextEmitted=false + not-abort 패턴 감지 → buildToolFailureMessage(TCC면 시스템설정 경로+Retry, 아니면 generic) onAnnounce(error). 성공 턴 무noise. QA: tsc EXIT0 + build 클린 + AC 정적 pass. 런타임 cua-vm flag(Downloads TCC 거부→actionable 노출). v0.5 T-255 carry 해소.

## Persona Activity
(PO-managed)
