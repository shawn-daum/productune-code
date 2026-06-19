---
ticket_id: T-PATCH-221
version: v0.5
slug: po-turn-hang-detect-and-compacting-label
title: PO turn hang 감지/타임아웃 + "Compacting" 라벨 정확화 (침묵≠압축, 이른 트리거)
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-221: PO turn hang 감지 + Compacting 라벨

## Request

shawn 보고(2026-06-19): PO 응답 중 하단에 "Compacting conversation"이 **10분 넘게**
떠 있고, 그동안 입력이 잠긴다. "몇 마디 했다고 벌써 compacting" — 너무 이르게 뜸.

cua VM 진단: claude(`--agent pdt-po`)가 **13분째 살아있으나 STAT=S(sleeping), CPU 17초/13분,
자식 프로세스 없음, 세션 jsonl 수 분째 미갱신** = 출력 없이 네트워크/API 또는 MCP에서
**블록(hang)**된 상태. 앱엔 타임아웃/hang 감지가 없어 무한 "compacting" + 입력잠금.

3중 문제:
1. **라벨 오표기** — `po-runner.ts` `SILENCE_TIMEOUT_MS=15_000` 침묵 휴리스틱이 무출력
   15초를 곧장 `emitHealth('compacting')`로 표시. 실제론 thinking/대기/hang일 수 있음.
2. **이른 트리거** — 15초는 짧음(특히 turn1: pdt-po 시스템프롬프트=doctrine로 첫 토큰까지 김).
3. **hang 감지 부재** — claude가 sleeping-blocked로 장시간 무출력이어도 타임아웃·복구 UX 없음.

## 설계 방향

- 침묵 휴리스틱 라벨을 **"Thinking…"**(또는 "Working…")로, **진짜 `compact_pre`/`compact===true`
  이벤트일 때만 "Compacting"**으로 분리(po-runner 713행 실 이벤트는 이미 있음).
- 첫 토큰 전 침묵 임계 상향/적응형(예: turn1 관대).
- **hang 워치독**: N초(예 90~120s) 무출력 + claude sleeping이면 "응답 지연/멈춤 가능 —
  Reset session?" 상태 노출(+선택적 자동 헬스 경고). 입력 잠금 무한 방지.
- (조사) 왜 hang하는가 — pdt-po가 참조하는 MCP(메모리 backend 등)가 VM 미가동이라
  연결 대기로 멈추는지 root-cause 확인(별도일 수 있음).

## Acceptance

- **AC-1**: 무출력 침묵 시 라벨이 "Compacting"이 아니라 "Thinking/Working"으로 표시된다.
- **AC-2**: 실제 compact 이벤트(`compact_pre`)에서만 "Compacting"이 표시된다.
- **AC-3**: 장시간(임계 초과) 무출력+blocked 시 사용자에게 멈춤 가능성 + Reset 경로가 노출된다(무한 잠금 X).
- **AC-4**: turn1 첫 토큰 지연으로 인한 즉시 오표기가 없다.

## Out of scope

- hang root-cause(MCP/API) 자체 수정(조사 후 별도 티켓 가능).

## QA 노트
cua VM: PO turn 중 라벨/타임아웃 거동 관찰. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.
