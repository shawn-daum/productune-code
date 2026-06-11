---
ticket_id: T-PATCH-094
title: "JSON 뷰어에 검색(Find) 기능 추가 — FindBar UX 일관"
version: v0.5
round: patch
type: feature
status: user-verify
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: json-viewer-find
qa_status: pass
qa_loops: 0
area_tags: [gui/viewer, gui/json, gui/find]
created_at: 2026-06-10
---

| T-PATCH-094 | json-viewer-find | review |

## §1 Request

사용자 지시 (verbatim):

> "Json viewer에도 md/html viewer처럼 검색기능 필요."

### 현재 상태 (코드 점검 결과)

- 대상 파일: `packages/gui/src/components/workspace/main/panes/ArtifactJsonTab.tsx` — `JsonNode` 기반 접이식 트리를 렌더링(기본 전부 펼침), 검색 기능 **없음**.
- 비교 기준 — HTML 뷰어: `packages/gui/src/components/workspace/main/HtmlViewer.tsx` (~140-260 라인)는 iframe `postMessage` 브리지 + CSS Highlights API 로 완전한 find 를 구현. 공유 `FindBar` (`packages/gui/src/components/workspace/main/FindBar.tsx`)가 `findQuery` / `findNavRef` / `onFindResult` props 로 구동.
- MD find 도 pane 컨테이너의 `FindBar` 를 경유.
- 즉, FindBar 자체는 이미 공유 컴포넌트로 존재하며 HTML/MD 가 이를 소비 중. JSON 뷰어만 미연동 상태.

### 수정 방향

기존 `FindBar` UX 와 일관되게 JSON 뷰어에 find 를 추가한다:

- Cmd+F 로 find bar 오픈.
- 쿼리 하이라이트, prev/next 네비게이션, 매치 카운트(`N / M`) 표시.
- JSON 트리의 **key 와 value 양쪽** 을 검색 대상으로 한다.
- 매치를 포함한 접힌(collapsed) 노드는 결과가 보이도록 **자동으로 펼친다(auto-expand)**.

## §2 Acceptance

- [x] JSON 뷰어에서 `Cmd+F` 로 find bar 가 열린다(HTML/MD 와 동일한 진입 UX).
- [x] 입력한 쿼리가 트리 내 매치 위치에 하이라이트된다.
- [x] key 와 value 양쪽이 모두 검색 대상이 된다(예: key `"surfaces"` 와 value `"gui"` 모두 매치).
- [x] prev/next 네비게이션으로 매치 사이를 이동할 수 있고, 현재 매치가 다른 매치와 구분되게 표시된다(active match 강조).
- [x] 매치 카운트(`현재 / 전체`)가 표시되며, 입력/네비게이션에 따라 갱신된다.
- [x] 매치가 접힌 노드 안에 있으면 해당 노드(및 조상 노드)가 자동으로 펼쳐져 결과가 보인다.
- [x] 현재 active 매치가 뷰포트 밖이면 스크롤되어 보인다(`scrollIntoView` 등).
- [x] `Escape` 또는 find bar 닫기 시 하이라이트가 제거되고 트리 상태가 정상 복귀한다.
- [x] 매치가 0개일 때 카운트가 `0`(또는 no-match 표기)으로 표시되고 prev/next 가 무동작.
- [x] HTML/MD 의 기존 find 동작에 회귀가 없다(공유 `FindBar` props 시그니처 유지).

## §3 Out of scope

- 정규식 검색, 대소문자 구분 토글, 단어 단위 매치 등 고급 검색 옵션 추가.
- JSON value 의 타입별 필터링(검색 결과를 type 으로 거르기).
- JSON 트리의 기본 펼침/접힘 정책 변경(검색에 의한 auto-expand 외).
- HTML 뷰어가 사용하는 iframe/CSS Highlights 경로를 JSON 에 그대로 이식(트리는 iframe 이 아니므로 DOM 직접 하이라이트가 적절).
- 검색 결과 내보내기/복사 기능.

## §4 Implementation plan

대상 파일: `packages/gui/src/components/workspace/main/panes/ArtifactJsonTab.tsx`, `packages/gui/src/components/workspace/main/FindBar.tsx`(props 재사용, 시그니처 유지).

1. find 연동 진입점 정리: HTML/MD 가 pane 컨테이너에서 `FindBar` 를 띄우는 방식과 동일하게, JSON 탭이 활성일 때 `Cmd+F` 가 동일 `FindBar` 를 열도록 컨테이너 측 분기에 JSON 케이스를 추가한다(`findQuery` / `findNavRef` / `onFindResult` 를 JSON 뷰어로 라우팅).
2. JSON 트리를 검색 가능한 평탄 인덱스로 변환: `JsonNode` 트리를 순회하여 각 노드의 `path`(예: `root.surfaces.gui[0]`), 매칭 대상 문자열(key + value 직렬화), DOM ref 를 담는 match-index 를 빌드한다(트리/쿼리 변경 시 `useMemo` 로 재계산).
3. 쿼리 매칭: 입력 `findQuery` 에 대해 match-index 를 필터링하여 매치 노드 목록과 총 개수를 산출하고, `onFindResult` 로 `{ current, total }` 를 `FindBar` 에 보고(HTML/MD 와 동일한 카운트 표기 재사용).
4. 하이라이트: 매치된 key/value 텍스트 노드에 하이라이트 wrapper(또는 CSS Highlights API)를 적용하고, active 매치는 별도 강조 클래스로 구분.
5. auto-expand: 매치 노드의 조상 경로를 펼침 상태로 강제하도록 `JsonNode` 의 open 상태를 제어형(controlled)으로 전환하거나, 매치 path 집합을 expand-override 로 전달한다(검색 종료 시 사용자가 직접 접었던 상태로 복귀하도록 prior state 보존).
6. 네비게이션: `findNavRef` 의 prev/next 콜백을 구현하여 `activeMatchIdx` 를 순환 이동시키고, active 매치 ref 에 `scrollIntoView({ block: 'center' })` 적용.
7. 정리: find bar 닫기/`Escape` 시 하이라이트 제거 + expand-override 해제 + `activeMatchIdx` 리셋.

## §5 QA scope

smoke:

- JSON artifact 를 열고 `Cmd+F` 로 find bar 가 뜨는지 확인.
- key 가 매치되는 쿼리(예: `surfaces`)와 value 가 매치되는 쿼리(예: `gui`)를 각각 입력해 둘 다 하이라이트되는지 확인.
- 접힌 노드 안의 매치를 검색했을 때 해당 노드가 auto-expand 되어 결과가 보이는지 확인.
- prev/next 로 매치 사이 이동 + active 매치 강조 + `scrollIntoView` 동작 확인.
- 매치 카운트(`현재 / 전체`) 표기가 입력/이동에 따라 갱신되는지 확인.
- `Escape` 로 닫을 때 하이라이트 제거 + 트리 상태 복귀 확인.
- HTML/MD 뷰어의 기존 find 에 회귀가 없는지 교차 확인.

## Persona Activity

| When | Persona | Action |
|---|---|---|
| 2026-06-10 | pdt-developer | impl: `ArtifactJsonTab.tsx` find 연동 — `findQuery`/`findNavRef`/`onFindResult` props 수신(preview 와 동일 contract), 트리를 key+value match target 으로 평탄화(`useMemo`), 매치 노드 조상 path 를 `expandOverride` 로 controlled auto-expand(쿼리 비면 user 토글 복귀), `bodyRef` text-node walk + CSS Custom Highlight(`pdt-json-find`/`-active`), prev/next nav + `scrollIntoView({block:'center'})`, `{total,current}` 보고. `JsonNode` 를 path/expandOverride 제어형으로 전환. `LeafPane.tsx` `isJsonTab` 분기 추가(cmd+F / menu:find gate, next/prev, `jsonViewerNavRef`, result handler, TabContent props 라우팅). `TabContent.tsx` `jsonFindQuery`/`jsonFindNavRef`/`onJsonFindResult` 통과. `FindBar.tsx` 무수정(시그니처 유지). `tsc --noEmit` clean. status→review. |
| 2026-06-10 | pdt-qa | verify(code-inspection): §2 9개 acceptance 전부 코드 충족 확인. LeafPane `isJsonTab` cmd+F/menu:find gate(L344/359), next/prev → `jsonViewerNavRef`(L273/286), `handleJsonFindResult` → `setMatchInfo`(L261), TabContent props 조건부 라우팅(L468-470). TabContent `artifact-json` case 가 find props 전달(L68-78). ArtifactJsonTab: targets 가 key(`kind:'key'` L131)+value(`kind:'value'` L135) 양쪽 평탄화 → key/value 둘 다 매치. `matchedPathKeys` 조상 추가 → `expandOverride` controlled auto-expand(L150-173). CSS Custom Highlight active(`#FF9900`) vs inactive(`#FFE066`) 색 구분(L109-110), `scrollRangeIntoView` block:'center'(L413). nav 순환(L242-258). 빈 쿼리 → expandOverride `{}` 복귀 + highlight clear + `{0,0}` 보고(L164-190) = Escape/close 복귀 검증. 0 매치 → total:0 보고 + nav early-return(L227/246). FindBar 시그니처 무변경 → HTML/MD 무회귀. locale `workspace.findBar.*` en/ko 양쪽 존재. smoke→pass. status→user-verify (시각/스크롤 산출물 — eyeball 필요). |
