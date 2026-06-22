---
ticket_id: T-PATCH-145
version: v0.5
slug: persona-sprite-stepfix-enlarge
title: PersonaPresenceBar — 프레임-스텝 버그 수정(steps jump-none) + 영역/캐릭터 확대
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: persona-presence-sprite
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-145: PersonaPresenceBar 스텝 수정 + 확대

T-PATCH-144 후속. 같은 파일 `packages/gui/src/components/workspace/PersonaPresenceBar.tsx` 만 수정.

## 버그 1 — 애니가 옆으로 슬라이드 (프레임 교체가 아님)

현재 working 애니: `animation: 'persona-sprite 0.6s steps(4) infinite'`, keyframe `0% { background-position: 0% 0 } 100% { background-position: 100% 0 }`, `backgroundSize: '400% 100%'`.

`steps(4)`(= `steps(4, jump-end)`)는 background-position을 **0%·25%·50%·75%** 에 떨어뜨림 → 4-프레임 시트의 실제 프레임 경계(**0%·33.33%·66.67%·100%**)와 어긋나 프레임이 반씩 겹쳐 보이며 "옆으로 슬라이드"처럼 됨.

**Fix**: timing function을 **`steps(4, jump-none)`** 으로 변경. jump-none은 0%→100% 구간을 4개 값(0%·33.33%·66.67%·100%)으로 정확히 끊어 4프레임이 제자리에서 a→b→c→d로 교체됨. (시트는 2172×724 = 543×724 × 4-up in-place 포즈 — 확인 완료.)

- `animation: isWorking ? 'persona-sprite 0.6s steps(4, jump-none) infinite' : 'none'` 로 수정.
- reduced-motion 무력화 분기도 동일 keyframe 대상이면 그대로 유지.

## 변경 2 — persona 영역 + 캐릭터 확대

"내부 콘텐츠(캐릭터)까지 같이 키워서 assets이 더 커 보이게."

- 캐릭터 표시 크기: 현재 **30×40** → **48×64** (portrait 0.75 비율 유지: 64 × 0.75 = 48).
- bar height: 현재 **56** → 캐릭터 64 + label 라인(14) + 상하 패딩 수용하도록 상향(**≈ 92px**, dev가 실제 콘텐츠에 맞춰 계산; 캐릭터/label 세로 스택 잘림 없이).
- gap/padding은 확대된 캐릭터에 맞춰 비례 조정(가로 4명 오버플로 없게). label fontSize는 기존 10 유지(원하면 11까지).
- background-size(`400% 100%`)·background-position 로직은 불변 — 셀 width/height만 키우면 sprite는 비율대로 스케일됨.

## 보존 (변경 금지)

- 상태 머신(idle grayscale+opacity 0.4 / working full-color anim / done ✓+tooltip+dismiss), `usePOPresenceDerive`, store(`personaPresence.ts`), aria, `PERSONA_ORDER`, i18n. 다른 파일 diff 0.

## Acceptance

- AC-1: working 캐릭터가 제자리에서 4프레임(a→b→c→d)으로 교체되며 옆으로 슬라이드하지 않는다 (`steps(4, jump-none)`).
- AC-2: 캐릭터 표시 크기 48×64, bar는 캐릭터+label 잘림 없이 수용(≈92px), 4명 가로 오버플로/줄바꿈 없음.
- AC-3: idle/working/done 시각 정책 + done tooltip/dismiss + reduced-motion 정지 전부 기존대로 유지.
- AC-4: `pnpm --filter @productune/gui build` PASS. PersonaPresenceBar.tsx 외 diff 없음(store/locale/TeamPanel/StatusBar 불변).
