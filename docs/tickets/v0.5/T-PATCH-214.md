---
ticket_id: T-PATCH-214
version: v0.5
slug: gui-finish-batch-persona-label-bg-settings-leading-card-hover-clip
title: GUI finish batch — persona color on chat-header name labels, settings helper line-height, home card hover top-border clip
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: gui-finish
risk_flags: []
estimated_complexity: L1
created_at: 2026-06-18T00:00:00Z
started_at: 2026-06-18T00:00:00Z
completed_at: 2026-06-18T00:00:00Z
duration_min:
---

# T-PATCH-214: GUI finish batch (#2/#3/#4)

## 배경 (Request)

GUI 마무리 작업 3건. PO chat-header 의 페르소나 이름 라벨에 브랜드 색을 입히고, 일반 설정의
여러 줄 도움말 글이 답답하게 붙어 있던 것을 풀어주고, 홈 화면 프로젝트 카드의 hover 시 위쪽
테두리가 잘리던 문제를 고친다. 디자인 시스템 토큰만 사용하고 새 색은 만들지 않는다.

- #2 — PO chat-header 페르소나 presence row 의 각 픽셀아트 스프라이트 아래 이름 라벨(PO / Designer
  / Developer / QA)의 **배경**에 페르소나 브랜드 색을 넣는다. 라벨 글자는 색 배경 위에서 읽혀야
  한다. (Team 패널은 이미 페르소나 색을 쓰는데 chat row 는 idle 상태에서 단색이라 의미는 같은데
  토큰이 달랐던 격차를 메운다.)
- #3 — 일반 설정의 여러 줄 도움말 글(예: "테스트 알림 보내기" 아래)이 답답하다. 여러 줄 도움말
  텍스트에 넉넉한 줄간격을 적용한다.
- #4 — 홈 화면 프로젝트 카드 hover 시 카드가 살짝 떠오르며(translateY -1px) 보라색 테두리가
  생기는데, 맨 위 카드의 **윗 테두리**가 스크롤 영역에 잘린다. 떠오름 + 테두리가 안 잘리게
  고친다(떠오름/테두리는 유지).

## Acceptance

- AC-1 (#2): Given the PO chat-header persona presence row, When each persona name label renders,
  Then the label BACKGROUND is the persona's `--persona-*` brand color (PO `#8B5CF6` /
  designer `#FB923C` / dev `#38BDF8` / qa `#34D399`) — NOT a ring on the sprite — and the persona
  color shows at idle too (closes the Team-panel-vs-chat-row token gap).
- AC-2 (#2 contrast): Given each colored label, Then the label text color clears WCAG AA on its
  persona bg per DS §2.9; existing `--persona-*` tokens only, no invented colors.
- AC-3 (#3): Given General Settings multi-line helper microcopy (e.g. under "테스트 알림 보내기"),
  Then its line-height = `--leading-relaxed` (1.6).
- AC-4 (#4): Given the topmost project card on HomeView, When hovered (`translateY(-1px)` + 1px
  purple border `rgba(139,92,246,0.5)`), Then the card's FULL purple border including the TOP edge
  renders (not clipped by the scroll wrapper). The lift and the border are preserved (not removed).
- AC-5: `tsc --noEmit` EXIT 0; no DS drift; no behavior change beyond the three fixes.

## Plan / Fix

### #2 — persona color on chat-header name labels
File: `packages/gui/src/components/workspace/PersonaPresenceBar.tsx`.
- `PersonaChip` label: was persona color as TEXT (color = `--persona-*`, gray `#707070` at idle) on a
  transparent bg. Changed to persona color as BACKGROUND (`background: color` where `color =
  PERSONA_COLORS[persona]`), text = `#0F0F0F` (`--surface-body`, near-black), `borderRadius: 3`,
  `padding: '0 5px'`, `fontWeight: 600`. Same persona color at every state incl. idle.
- Removed the per-state `labelColor` ternary (idle no longer goes gray — color always present).
- Contrast choice (text `#0F0F0F` on persona bg; computed WCAG 2.2 ratios):
  - PO `#8B5CF6`: 4.53:1 → AA (small text ≥4.5)
  - designer `#FB923C`: 8.47:1 → AAA
  - dev `#38BDF8`: 8.95:1 → AAA
  - qa `#34D399`: 9.97:1 → AAA
  WHY near-black (not white): white text fails AA on the three bright hues (orange 2.26 / sky 2.14 /
  emerald 1.92). A single near-black `#0F0F0F` clears AA on ALL four, including the darkest hue (PO
  violet, which lands exactly on 4.53 with `#0F0F0F` — pure `#000` would be 4.96 but `#0F0F0F` is the
  existing surface-body token and already AA). Uses existing tokens; no new colors.

### #3 — Settings helper line-height
File: `packages/gui/src/components/workspace/GeneralSettings.tsx`.
- `description` style (the shared multi-line helper microcopy style — toggle descs, section
  descriptions, zoom desc, notification type descs): `lineHeight 1.5 → 1.6` (`--leading-relaxed`).
- `notifMacosHint` style (the macOS guidance line under the test-notification button): `lineHeight
  1.5 → 1.6`.
- Single-line status lines (test result Ok/Warn) untouched (not multi-line helper microcopy).

### #4 — Home card hover top-border clip
File: `packages/gui/src/views/HomeView.tsx`.
- `gridWrapStyle` (the `overflowY: auto` scroll wrapper, "Scrollable grid"): added `paddingTop: 3`
  so the top card's `translateY(-1px)` lift + 1px border clears the wrapper's top clip edge.
  `paddingBottom: 40` kept. Lift + border on `ProjectCard.cardStyle` unchanged.

## How verified

Same vite + Playwright session as T-PATCH-213 R2 (`./node_modules/.bin/vite --port 5213`).
`./node_modules/.bin/tsc --noEmit` → EXIT 0.

- #2: computed `getComputedStyle` on the four `.rp-persona-bar` labels → bg = the four
  `--persona-*` hexes, text = `rgb(15,15,15)` (#0F0F0F) on all. Screenshot shows readable labels.
- #3: General Settings tab opened; `getComputedStyle` on the multi-line `description` helpers →
  `line-height: 17.6px` (= 11px × 1.6); macOS hint → `16px` (= 10px × 1.6). Screenshot saved.
- #4: stubbed `window.api.listRecentsWithMeta` (card-render screenshot ONLY — Piece A boot-crash
  assertions ran with NO shim) to render 6 ProjectCards; hovered the TOP card; measured
  `getBoundingClientRect`: card.top (246.5) sits 2.0px BELOW the scroll-wrapper top (244.5) with
  `paddingTop: 3px` → full top edge inside the visible area (not clipped); transform =
  `matrix(1,0,0,1,0,-1)` (lift present), borderColor = `rgba(139,92,246,0.5)` (purple present).
  Screenshot shows the complete rounded purple outline at top.

Screenshots: `packages/gui/test-results/finish-214/{02-persona-name-labels,03-settings-helper-leading,04-home-card-hover-top-border}.png`.

## Out of scope
- No electron/main/preload/IPC edits. No new design-system tokens. No refactors beyond the three
  styling fixes.

## Outcome
Shipped. 3 files edited (PersonaPresenceBar.tsx label bg+text; GeneralSettings.tsx two helper
line-heights; HomeView.tsx gridWrap paddingTop). tsc EXIT 0. risk_flags []. requires_qa true /
qa_status pending.

## Persona Activity
| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | — | 2026-06-18 | 2026-06-18 | opus | standard |
