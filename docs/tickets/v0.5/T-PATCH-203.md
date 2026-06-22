---
ticket_id: T-PATCH-203
version: v0.5
slug: phase-boundary-gate-marker
title: Phase 경계 gate 시각화 — PhaseBreadcrumb 경계에 close_gate 상태 인라인
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: phase-gate
risk_flags: >
  poState.close_gate 는 prompt-gate-inject 훅이 ~/.productune/config/close-gate.p3.json
  에서 po-state 로 materialize 한다 — GUI 의 poState 스냅샷에 close_gate 배열이
  실제로 들어오는지 검증 필요(없으면 IPC/스냅샷 경로 보강). 현재 gate 는 P3 하나뿐
  이므로 마커는 Build→Deploy 경계에만 뜨지만, 구조는 boundary-generic(phase→gate
  매핑)으로 — 추후 다른 경계 gate 신설 시 자동 렌더되게. deprecated PhaseTransitionGate
  (top-pinned 배너)는 되살리지 않는다 — strip 인라인이 대체.
estimated_complexity: L3
created_at: 2026-06-17T00:00:00Z
---

## 배경 / 목적

phase 진행은 선형 + 경계마다 gate 인데, 실제로 막는 close_gate(P3: backlog_triage /
design_review[no-waiver] / prd_check / security_6)를 **체크리스트로 보여주는 UI 가
없다.** 구조화 배너(`PhaseTransitionGate.tsx`)는 T-P4-139 에서 deprecated/unmount
되고 "chat-driven"으로 전환됨 → 막혔을 때 사용자 신호가 **PO 채팅 산문이 전부**.

결과: 비개발 기획자가 "다음 단계로 안 넘어가는데, 뭐가 남았고 내가 뭘 해야 하는지
화면에서 볼 수가 없다." 눈에 안 보이는 상태머신이 진행을 막는데 상태를 들여다볼
surface 가 없는 게 문제.

해법(설계 합의): 별도 패널이 아니라 **이미 시선이 가 있는 PhaseBreadcrumb(여정 strip)
의 경계에 gate 상태를 그린다.** "벽"을 그것이 막는 두 phase 사이에 시각적으로 배치.

(참고 이미지: `v0.5 | PRD (30/31) › Design (6/6) › Build (107/109) › Deploy › Close`
— 여기서 Build→Deploy 의 `›` 가 gate 마커가 된다.)

---

## 설계 결정

| 항목 | 결정 |
|------|------|
| **위치** | gate 있는 경계의 chevron(`PhaseBreadcrumb.tsx:33`)을 인터랙티브 gate 마커로 교체. 현재는 Build→Deploy 1곳. |
| **데이터 주도** | `phase → gate-items` 매핑으로 렌더. 지금은 P3(Build) close_gate 만 매핑되지만, 추후 다른 경계 gate 신설 시 코드 변경 없이 마커 추가되게. |
| **마커 표시** | 집계 상태 — blocked(미충족) = lock + `N/M` (예 `2/4`), 통과 = check. 색: blocked 앰버/퍼플, pass 뮤트. |
| **펼침** | 마커 클릭 → 경계에 앵커된 popover. close_gate 각 항목: 라벨 · 상태(done/pending/waived/na) · 1줄 설명. |
| **라벨** | design_review / prd_check / security_6 는 **실제 용어 유지**(기획자 검색가능). `backlog_triage` 만 평이하게("남은 작업 정리" 류) — 내부 키는 불변, 표시만. |
| **차례 분리** | 안 함(불필요). |
| **개념 프레이밍** | Build→Deploy gate group 을 "빌드 검토 / 배포 전 점검" 성격의 체크포인트로 라벨(선택). |

---

## 수정 파일 목록 (files-to-touch)

| 파일 | 변경 |
|------|------|
| `packages/gui/src/components/workspace/PhaseBreadcrumb.tsx` | 경계 chevron → gate 마커(있는 경계만). poState.close_gate prop 수신. popover 펼침. |
| `packages/gui/src/views/WorkspaceShell.tsx` | PhaseBreadcrumb 에 close_gate(poState) 전달(현재 phase/version/phaseCounts 만 넘김). |
| `packages/gui/src/lib/phase-mapping.ts` (또는 신규) | `phase → gate-items` 매핑 + close_gate 항목 표시 라벨/설명 테이블. |
| `packages/gui/src/locales/en.json` / `ko.json` | gate 항목 라벨/설명/popover 문구 키(동기). |

---

## Acceptance Criteria

- **AC-1**: Build→Deploy 경계에 gate 마커가 뜨고, close_gate 미충족 시 blocked 상태(lock + `N/M`)를 보여준다. 4항목 모두 done/waived/na 면 통과(check) 표시.
- **AC-2**: 마커 클릭 시 popover 가 열리고 close_gate 4항목 각각의 라벨·상태·1줄 설명이 보인다.
- **AC-3**: design_review / prd_check / security_6 는 실제 용어로 표시되고, backlog_triage 만 평이한 표시 라벨을 가진다(내부 키 불변).
- **AC-4**: gate 없는 경계(PRD→Design, Design→Build, Deploy→Close)는 기존 chevron 그대로 — 마커 없음.
- **AC-5**: 구조가 데이터 주도라, 매핑 테이블에 다른 phase gate 를 추가하면 해당 경계에 마커가 자동 렌더된다(P3 외 gate 신설 대비).
- **AC-6**: poState.close_gate 가 GUI 스냅샷에 없을 때 graceful — 마커는 통과/미표시로 폴백하고 크래시 없음.

---

## 구현 주의 사항

1. **close_gate 데이터 경로 확인** — `prompt-gate-inject.sh` 가 `~/.productune/config/close-gate.p3.json` 을 po-state 로 materialize 한다. GUI 가 읽는 po-state 스냅샷(workspace store poState)에 `close_gate` 배열(`{step,status,waivable}`)이 실제로 들어오는지 먼저 검증. 없으면 IPC/스냅샷 union 보강.
2. **popover 위치** — strip 은 수평 1행이라 인라인 항상-펼침은 레이아웃을 깬다. 클릭 펼침 popover(경계 앵커)로.
3. **deprecated 컴포넌트** — `PhaseTransitionGate.tsx` 는 되살리지 않음. 본 티켓이 그 의도(gate 가시성)를 strip 인라인으로 대체한다. 참조용 파일은 그대로 둬도 무방.

## QA 노트

shawn hands-on. P3 에서 close_gate 항목을 pending↔done 토글해 가며: 마커 N/M 갱신,
4/4 시 통과 표시, popover 항목/상태 정확, gate 없는 경계 무변화 확인.
