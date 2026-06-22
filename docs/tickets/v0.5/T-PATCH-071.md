---
ticket_id: T-PATCH-071
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: usage-bar, chat-header, layout, wide-panel
slug: usagebar-tworow-and-wide-divider-fix
qa_status: pending
requires_qa: false
area_tag: gui-chat
---

# T-PATCH-071: UsageBar 항상 2-row + 넓은 폭에서 phase 아래 divider 끊김 수정

## Context

shawn hands-on 2건:
1. **session status(5h/7d) 잘림** — 현재 `<UsageBar horizontal />`(T-PATCH-061) 가로 배치라 좁으면 "resets in …" ellipsis 로 잘림. shawn: "그냥 두 항목(5h, 7d) 두 row 로 유지하자." → 가로 모드 폐기, 항상 세로 2-row.
2. **chat panel 폭이 넓을 때 phase breadcrumb 아래 divider 가 끊김** — PhaseBreadcrumb(PRD>Design>Build>Deploy>Close) 아래/PersonaPresenceBar 구분선이 넓은 폭에서 full-width 로 안 그어지고 잘림(divider 끊김). 좁을 땐 정상.

## Acceptance Criteria

- [ ] AC-1: UsageBar 가 5h / 7d 를 항상 2개 row(세로)로 표시. 어떤 폭에서도 "resets in …" 잘림 없음
- [ ] AC-2: chat panel 을 넓게 했을 때 phase breadcrumb 아래 divider 가 패널 full-width 로 끊김 없이 표시
- [ ] AC-3: 좁은 폭에서의 divider 도 회귀 없이 정상

## Plan

### 1. UsageBar 2-row 고정 — File: `packages/gui/src/components/workspace/ChatPanel.tsx` (L453)

`<UsageBar horizontal />` → `<UsageBar />` (default `container` = `flexDirection: column` 2-row). `horizontal` prop 전달 제거. (UsageBar.tsx 의 `horizontal` 분기/`containerHorizontal` 스타일은 미사용이 되면 정리 가능하나 필수는 아님 — dev 판단.)
- T-PATCH-051 `usageInline`/inline 배치가 wide 에서 적용되는 경로가 있으면, 그것도 2-row 가 유지되도록(가로 1줄로 안 눌리게) 확인.

### 2. 넓은 폭 divider 끊김 — Files: `PhaseBreadcrumb.tsx` / `ChatPanel.tsx` ctxRow / `PersonaPresenceBar`

넓은 폭에서 phase 영역 아래 구분선(border)이 full-width 로 안 그어지는 원인 진단 후 수정(dev 재현: chat panel 넓게 → breadcrumb 아래 선 끊김). 후보: `PhaseBreadcrumb` `wrap` 의 `borderBottom` 이 `width:100%` 가 아닌 content width 만 덮거나, ctxRow/PersonaPresenceBar 컨테이너가 wide 에서 max-width/centering 으로 줄어드는 경우. 구분선이 패널 폭 전체를 덮도록 수정.

### Verifiability

AC-1 = 렌더 확인(2-row). AC-2/3 = 넓게/좁게 리사이즈 육안(shawn). dev 는 tsc + 폭 변화 시 divider span 코드상 확인.
