---
ticket_id: T-PATCH-167
version: v0.5
slug: gui-malformed-postate-robustness
title: po-state 파싱 실패 시 GUI가 "v1 대기중" 오해 placeholder로 폴백 — 명시 에러+last-good
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: gui-postate-robustness
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-167: malformed po-state GUI 견고성

## 증상 (paepyeong repro)
po-state.json이 손상(JSON 파싱 실패)되자 GUI "현재 버전"이 **"v1 (대기 중) — PRD 작성 시작 시 활성화됩니다"** 라는 fresh-version placeholder로 조용히 폴백 → 마치 버전이 리셋된 것처럼 보임(사용자 "v1 어디갔지?"). 실제론 파일 손상.

## 문제
po-state 읽기/파싱 실패가 **"버전 없음(신규)" 상태와 구분 안 됨** → 오해 유발 + 데이터 손상을 숨김.

## Fix
1. po-state 읽는 renderer 경로(state IPC / 스토어 — `ipc/state.ts` 및 SidePanelCurrentVersion.tsx / VersionsPanel) 에서 **파싱 실패와 "버전 미존재"를 구분**:
   - 파싱 실패 → 명시 에러 상태(예: "po-state 읽기 실패 — 파일 손상 가능. 백업 확인 필요" + 경고색). 가능하면 last-good(직전 성공 파싱본) 표시 또는 "재시도".
   - 진짜 빈/신규(versions 없음) → 기존 "대기 중" placeholder 유지.
2. state IPC가 파싱 실패를 `{ ok:false, error:'parse' }` 형태로 surface(현재는 throw/빈값으로 폴백 추정 — 코드 확인).
3. (옵션) 최근 `.bak.*` 존재 시 "백업에서 복원" 힌트.

## Acceptance
- AC-1: po-state가 malformed면 GUI가 "v1 대기중" 같은 fresh placeholder가 아니라 **읽기 실패 명시 에러**를 보여준다.
- AC-2: 정상 po-state는 종전대로 버전 표시. 진짜 신규(versions 빈) = 기존 대기 placeholder 유지.
- AC-3: build PASS.

## Note
- 코드 확인 필요: po-state 파싱 실패 시 현재 어디서 어떻게 폴백되는지(state IPC throw → 스토어가 빈 객체 → placeholder). 그 지점에 error 상태 도입.
