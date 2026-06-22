---
ticket_id: T-PATCH-222
version: v0.5
slug: right-panel-scrollbar-style
title: 우측 PO Chat 패널 스크롤바 스타일 (OS 기본 → 얇은 오버레이)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: ui
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-19T00:00:00Z
qa_status: pass
qa_loops: 0
completed_at: 2026-06-22T00:00:00Z
---

# T-PATCH-222: 우측 패널 스크롤바 스타일

## Request

shawn 보고: 우측 PO Chat 패널 스크롤바가 못생김. 커스텀 스크롤바 CSS가 탭 스트립
(`index.css` `.tab-strip-scroll::-webkit-scrollbar`)에만 있고 채팅/우측 패널 스크롤
컨테이너엔 미적용 → OS 기본(굵은 회색)이 그대로 노출.

## 설계 방향

탭 스트립과 동일 스타일(얇은 오버레이: `::-webkit-scrollbar` 3~8px + 투명 트랙 +
둥근 thumb, Firefox `scrollbar-width: thin` / `scrollbar-color`)을 우측 패널/채팅
스크롤 컨테이너에 적용. 토큰/색은 디자인 시스템 변수 사용.

## Acceptance

- **AC-1**: 우측 PO Chat 패널 스크롤바가 얇은 오버레이 스타일로 렌더(렌더 스크린샷 기준).
- **AC-2**: 스크롤 기능 회귀 없음(over­flow 동작 유지).
- **AC-3**: 라이트/다크 및 다른 스크롤 컨테이너와 시각 일관.

## Out of scope
PO chat 레이아웃(좌측 윙) 변경(별도).

## 구현 요약 (T-PATCH-222)

- `packages/gui/src/styles/index.css`: `.tab-strip-scroll` 옆에 재사용 가능한
  `.pdt-thin-scroll` 규칙 추가. `::-webkit-scrollbar`(width/height 6px, 투명 트랙),
  `::-webkit-scrollbar-thumb`(둥근 thumb `#2A2A2A` = DS 토큰 `--border-strong`,
  border-radius 3px, hover 시 `#3A3A3A` = `--border-muted`), Firefox는
  `scrollbar-width: thin` + `scrollbar-color: #2A2A2A transparent`. 참조한
  `.tab-strip-scroll`(3px 수평)과 동일 계열의 얇은 오버레이 스타일이며 thumb 색은
  동일 토큰값(`#2A2A2A`)을 공유.
  - 주: `::-webkit-scrollbar-thumb`은 일부 엔진에서 `var()` 상속이 불안정해 토큰
    16진값을 인라인. `:root`(md-recipes.css)의 `--border-strong` 값과 일치.
- `packages/gui/src/components/workspace/ChatPanel.tsx`:
  - 채팅 메시지 리스트(실제 세로 스크롤 div, `style={msgs}` `overflowY:auto`)에
    `className="rp-msgs pdt-thin-scroll"` 부여.
  - 질문 dock의 스크롤 body(`style={dockBody}` `overflowY:auto`)에
    `className="pdt-thin-scroll"` 부여.

## AC 충족

- **AC-1**: 우측 PO Chat 패널의 실제 스크롤 컨테이너(메시지 리스트 + 질문 dock body)에
  얇은 오버레이 스크롤바가 적용됨. OS 기본 굵은 회색 미노출.
- **AC-2**: `overflowY:auto`/`onScroll`/auto-scroll 로직 그대로 유지 — 스타일만 추가,
  스크롤 기능 회귀 없음. build + smoke green.
- **AC-3**: thumb 색을 탭 스트립(`.tab-strip-scroll`)과 동일한 DS 토큰값(`#2A2A2A`)으로
  맞춰 다른 스크롤 컨테이너와 시각 일관. (현 GUI는 dark 단일 테마; 토큰 기반이라
  light 도입 시 일관 유지.)

## Sign-off

- build (`pnpm run build`: tsc --noEmit + locale-key check + vite): PASS
- smoke (`pnpm run smoke`, playwright-electron): 1 passed — window opens, renderer
  mounts, zero console errors.
- 부팅/렌더 회귀 없음.
