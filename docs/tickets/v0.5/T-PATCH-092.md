---
ticket_id: T-PATCH-092
title: "Quick Open 빈쿼리(최근 목록)에서 방향키 이동 + Enter 열기 동작"
version: v0.5
round: patch
type: fix
status: user-verify
assignee: pdt-developer
estimated_complexity: L1
model: sonnet
effort: low
risk_flags: none
slug: quickopen-recent-keynav
qa_status: pass
qa_loops: 0
area_tags: [gui/quickopen, gui/keyboard]
created_at: 2026-06-10
---

| T-PATCH-092 | quickopen-recent-keynav | todo |

## §1 Request

사용자 지시 (verbatim):

> "Cmd p 하면 바로 아래에 최근 목록이 나오는데 키보드 방향키 눌러서 해당 목록으로 이동해서 enter하면 그거 열리게 해줘."

### 확인된 근본 원인 (코드 점검 결과)

대상 파일: `packages/gui/src/components/workspace/QuickOpenPalette.tsx`

- 방향키 네비게이션 + Enter 처리 로직은 **이미 구현되어 있음** — `handleKeyDown` (~439-457 라인), `activeIdx` 기준 `scrollIntoView` (~415-420 라인).
- 버그 지점: `const groups = query ? groupResults(scopedItems, strippedQuery) : {}` (~427 라인), `flatRows = flattenRows(groups)` (~428 라인).
  - 쿼리가 **비어있을 때**(별도 `RestingState` 컴포넌트, ~331-367 라인 가 최근 목록을 렌더링하는 resting 상태) `flatRows` 가 `[]` 가 됨.
  - 결과적으로 ArrowUp/Down 은 `(i±1) % 0` → 멈춤(stuck), Enter 는 `flatRows[activeIdx]` = `undefined` → 아무것도 열리지 않음.
  - `RestingState` 는 최근 항목을 자체 `map` 으로 그려서 `flatRows` 에 포함되지 않음.

### 수정 방향

- 쿼리가 비어있을 때 `flatRows` 를 최근 항목(recent items)으로 채워, 방향키 네비게이션 + Enter 가 최근 목록에서 동작하도록 한다.
- active-row 하이라이트 + `scrollIntoView` 가 최근 목록에도 동일하게 적용되어야 한다.
- 최근 목록 사양 유지: `MAX_RECENT=5`, localStorage 키 `'productune:quickopen:recent'`.

## §2 Acceptance

- [x] 빈 쿼리(resting) 상태에서 `ArrowDown` / `ArrowUp` 로 최근 항목 사이를 이동할 수 있다.
- [x] 이동 시 현재 활성 항목(active row)이 시각적으로 하이라이트된다.
- [x] 활성 항목이 뷰포트 밖이면 `scrollIntoView` 로 스크롤되어 보인다.
- [x] 빈 쿼리 상태에서 `Enter` 를 누르면 활성화된 최근 항목이 열린다.
- [x] `Escape` 로 팔레트가 정상적으로 닫힌다.
- [x] 기존 검색쿼리(non-empty query) 상태의 방향키/Enter 네비게이션에 회귀가 없다.
- [x] 최근 목록 사양(최대 5개, localStorage 키 `'productune:quickopen:recent'`)이 그대로 유지된다.

## §3 Out of scope

- 최근 목록의 정렬/필터링/항목 수(`MAX_RECENT`) 변경.
- 검색 알고리즘(`groupResults` / `flattenRows`)의 동작 변경.
- 새로운 단축키 추가 또는 기존 단축키 매핑 변경.
- `RestingState` 의 시각 디자인 변경.

## §4 Implementation plan

대상 파일: `packages/gui/src/components/workspace/QuickOpenPalette.tsx`

1. `flatRows` 계산부(~427-428 라인) 수정: 쿼리가 비어있을 때 `flatRows` 가 최근 항목(`RestingState` 가 렌더링하는 동일 소스)으로 채워지도록 한다.
   - 쿼리 있음: 기존 `flattenRows(groupResults(...))` 경로 유지.
   - 쿼리 없음: 최근 항목 배열을 동일한 row shape 으로 `flatRows` 에 매핑.
2. `RestingState` 와 `flatRows` 의 항목 소스를 일원화하여, `RestingState` 가 렌더링하는 항목과 `flatRows[activeIdx]` 가 항상 동일 항목을 가리키게 한다.
3. `RestingState` 내 최근 항목 렌더링이 `activeIdx` 기반 active 하이라이트를 반영하도록 active 상태를 전달(prop)하거나 공통 row 컴포넌트를 사용한다.
4. `handleKeyDown` / `scrollIntoView` 로직(~415-420, ~439-457 라인)은 그대로 두되, 비어있지 않은 `flatRows` 덕분에 resting 상태에서도 정상 동작함을 확인한다.
5. 모듈로 연산이 길이 0 일 때 멈추는 문제는 `flatRows` 가 채워지면 해소되므로 별도 가드는 불필요. (단, 최근 항목이 0개인 경우 기존 무동작 동작은 유지)

## §5 QA scope

smoke:

- Cmd+P 로 Quick Open 팔레트를 연다.
- 쿼리를 입력하지 않은 상태(최근 목록 표시)에서 `ArrowDown` / `ArrowUp` 로 최근 항목을 이동하고, active 하이라이트가 따라 움직이는지 확인.
- 활성 항목에서 `Enter` → 해당 최근 항목이 열리는지 확인.
- `Escape` → 팔레트가 닫히는지 확인.
- 쿼리를 입력한 상태에서 기존 방향키/Enter 동작에 회귀가 없는지 확인.

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-092 | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | low |
| pdt-qa | T-PATCH-092 | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | low |

### QA verdict (pdt-qa) — PASS → user-verify

All §2 acceptance verified by code inspection (`QuickOpenPalette.tsx`):

- [x] 빈 쿼리 ArrowDown/Up 최근 항목 이동 — `flatRows = recentItems` (L450), `handleKeyDown` modulo over `flatRows.length` (L463-468).
- [x] active row 하이라이트 — `RestingState` row `active = i === activeIdx` (L346) + `restingRowActiveStyle` violet border/outline (L779-787).
- [x] scrollIntoView — `[data-idx="${activeIdx}"]` query (L425-430); resting rows carry `data-idx={i}` (L351).
- [x] 빈 쿼리 Enter 열기 — `flatRows[activeIdx]` → `handlePick` (L469-472).
- [x] Escape 닫기 — `onClose()` (L473-475).
- [x] 검색쿼리 nav 회귀 없음 — query 경로 `flattenRows(groups)` 유지, sectionOffsets 계산 불변 (L450, L490-495).
- [x] 최근 사양 유지 — `MAX_RECENT=5` / `RECENT_KEY='productune:quickopen:recent'` 불변 (L78-79), `recentItems` `.slice(0, MAX_RECENT)` (L447).

Functional wiring fully code-verified. Set to **user-verify** because the active-row visual highlight tracking arrow-key movement in the resting (recent) list is a user-facing visual that needs an eyeball.

**User should confirm:** Cmd+P (빈 쿼리, 최근 목록 표시) → ArrowDown/Up 시 보라색 active 하이라이트가 항목 따라 움직이는지, 활성 항목에서 Enter 시 그 항목이 열리는지, Escape 로 닫히는지 육안 확인.
