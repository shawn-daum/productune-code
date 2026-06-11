---
ticket_id: T-PATCH-095
title: "MD/JSON 뷰어 Sticky Scroll — 조상 heading/key 경로 누적 고정"
version: v0.5
round: patch
type: feature
status: user-verify
assignee: pdt-developer
estimated_complexity: L3
model: sonnet
effort: high
risk_flags: none
slug: viewer-sticky-scroll
qa_status: pass
qa_loops: 3
area_tags: [gui/viewer, gui/markdown, gui/json]
created_at: 2026-06-10
---

| T-PATCH-095 | viewer-sticky-scroll | review |

## §1 Request

사용자 지시 (verbatim):

> "md/json 에서 heading/해당 key에 해당하는것들 스크롤 내리면 쌓아서 보여줄수있나?"

### 확정된 해석 (사용자 승인됨)

VS Code 'Sticky Scroll' 누적 방식:

- **MD**: 스크롤 중 현재 위치의 조상 heading 들(H1 > H2 > H3 …)이 상단에 계단식으로 쌓여 고정되고, 클릭 시 해당 위치로 점프한다.
- **JSON**: 깊은 노드로 스크롤하면 조상 key 경로(`root ▸ surfaces ▸ gui …`)가 상단에 누적 고정된다.

### 현재 상태 (코드 점검 결과)

- `packages/gui/src/components/workspace/main/MarkdownViewer.tsx` — heading 은 `MdRenderer` 로 렌더링되며 sticky 동작 없음(`viewerWrap` padding 24/28, maxWidth 780).
- `packages/gui/src/components/workspace/main/panes/ArtifactJsonTab.tsx` — `JsonNode` 트리 렌더링, sticky 없음.
- 두 뷰어 모두 현재 sticky scroll 미구현.

### 수정 방향

MD 뷰어와 JSON 뷰어 **양쪽** 에 sticky-scroll heading/key 누적을 구현한다:

- sticky 스택은 현재 스크롤 위치의 **가장 깊은 조상 체인** 을 반영.
- sticky 항목 클릭 시 해당 위치로 스크롤/점프.
- 뷰포트를 잠식하지 않도록 depth 를 합리적으로 cap.

## §2 Acceptance

공통:

- [x] sticky 스택은 항상 현재 스크롤 위치의 **조상 체인**(부모→자식 순)을 상단에서 계단식으로 누적 표시한다.
- [x] sticky 항목을 클릭하면 해당 heading/key 위치로 스크롤되어 이동한다.
- [x] sticky 스택 depth 에 상한(cap)이 있어 깊은 문서에서도 뷰포트를 과도하게 잠식하지 않는다(상한 초과 시 가장 얕은 조상부터 생략 또는 축약).
- [x] 스크롤이 최상단일 때 sticky 스택이 비어 있거나 최소(루트만)로 유지된다.
- [x] sticky 영역이 본문 콘텐츠를 가리지 않도록(스크롤 오프셋/패딩 보정) 점프 후 대상이 sticky 바로 아래에 위치한다.

MD:

- [x] 스크롤 내릴 때 현재 섹션의 조상 heading 들(H1 > H2 > H3 …)이 레벨 순서대로 상단에 쌓인다.
- [x] 더 깊은 heading 으로 진입하면 스택에 추가되고, 섹션을 벗어나면 해당 레벨이 제거된다.
- [x] sticky heading 클릭 시 해당 heading 위치로 점프(`MarkdownViewer.tsx` 의 기존 padding/maxWidth 레이아웃 유지).

JSON:

- [x] 깊은 노드로 스크롤하면 조상 key 경로(`root ▸ surfaces ▸ gui …`)가 상단에 누적 고정된다.
- [x] 노드를 접거나 펼칠 때 sticky 경로가 현재 보이는 깊이에 맞게 갱신된다.
- [x] sticky key 클릭 시 해당 노드로 점프.

## §3 Out of scope

- HTML 뷰어(iframe 기반)에 sticky scroll 적용 — 본 티켓 범위 아님.
- 목차(TOC)/아웃라인 패널, breadcrumb 별도 위젯 신규 추가.
- sticky 항목의 접기/펼치기·핀 고정 등 추가 인터랙션.
- heading/key 누적 외의 스크롤 동작(스크롤 위치 기억, smooth-scroll 정책) 변경.
- JSON find(T-PATCH-094) 와의 결합 동작 — 각자 독립 구현, 상호 회귀만 회피.

## §4 Implementation plan

대상 파일: `packages/gui/src/components/workspace/main/MarkdownViewer.tsx`, `packages/gui/src/components/workspace/main/panes/ArtifactJsonTab.tsx`. 공통 로직은 hook/유틸로 추출 권장.

공통 (재사용 hook 제안 — 예: `useStickyScroll` 또는 `StickyStack` 컴포넌트):

1. 스크롤 컨테이너에 대해 현재 스크롤 위치 기준으로 "현재 보이는 가장 깊은 항목"을 판정하는 로직을 둔다(`scroll` 이벤트 + `requestAnimationFrame` throttle, 또는 `IntersectionObserver` 기반 sentinel).
2. 해당 항목의 조상 체인을 계산하여 sticky 스택 배열(`{ id, label, level, top }[]`)로 만들고, `position: sticky`/절대배치 오버레이로 상단에 계단식 렌더링한다.
3. depth cap 상수(예: `MAX_STICKY_DEPTH`)로 표시 항목 수를 제한(초과 시 가장 얕은 조상 축약/생략).
4. sticky 항목 클릭 시 대상 요소로 `scrollIntoView`/`scrollTo` 하되, sticky 높이만큼 오프셋을 보정해 대상이 sticky 바로 아래 오도록 한다.

MD (`MarkdownViewer.tsx`):

5. `MdRenderer` 가 생성하는 heading 요소에 안정적 id/ref 와 level(h1~h6) 메타를 부여한다(이미 anchor id 가 있으면 재사용).
6. heading 목록을 문서 순서대로 수집하고, 현재 스크롤 위치에서 각 레벨별 "활성 조상 heading" 을 산출하여 H1>H2>H3 계단 스택을 구성한다.
7. 기존 `viewerWrap` 레이아웃(padding 24/28, maxWidth 780)을 깨지 않도록 sticky 컨테이너를 스크롤 영역 상단에 오버레이.

JSON (`ArtifactJsonTab.tsx`):

8. `JsonNode` 렌더 시 각 노드에 `path`(조상 key 배열)와 ref 를 부여한다.
9. 스크롤 위치에서 현재 화면 상단에 걸린 가장 깊은 노드를 판정하고, 그 노드의 `path` 를 `root ▸ key ▸ key …` 형태의 sticky breadcrumb 스택으로 렌더링.
10. 접힘/펼침 상태 변경 시 보이는 노드 집합이 바뀌므로 sticky 판정을 재실행한다.

### §4.d QA-feedback round 2 — JSON sticky 상단 본문 비침 (실제 root cause)

증상 (사용자 재보고): JSON sticky 밴드 **상단 가장자리 뒤로 본문이 여전히 비침**. depth 누적은 ~3레벨로 개선됐으나 시각적 bleed 잔존. qa_status pass 였으나 smoke 가 sticky 를 시각 검증하지 않음(`tests/smoke.spec.ts` 는 mount + console error 만 확인, sticky 렌더 미검증)이 확인됨.

**실제 root cause (경험적 확인):** `body` 스크롤 컨테이너에 `padding: '10px 0'` 이 있었다. `position: sticky; top: 0` 자식은 스크롤포트의 **padding-box 상단 가장자리** 기준으로 고정된다 → padding-top 10px 만큼 스크롤포트 상단과 밴드 상단 사이에 **10px strip** 이 생기고, 그 strip 으로 스크롤되는 트리 row 가 밴드 **위쪽**에 비쳤다. (translucent/zIndex 문제가 아니라 padding 기하 문제였음 — QA-r1 의 SOLID bg/zIndex 수정으로는 안 잡힌 이유.)

**fix (ArtifactJsonTab.tsx 단독):** `body` 에서 `padding:'10px 0'` 제거 → 밴드가 스크롤포트 상단에 flush 고정(strip 0). 수직 여백은 내부 콘텐츠(`treeWrap`)의 `padding:'10px 0'` 로 이동해 기존 spacing 유지. find(094)/MD sticky/밴드 구조 무변경.

**경험적 검증 (스크린샷):** real `ArtifactJsonTab` 를 deep JSON(`docs/artifacts/v0.4/service-flow-wireframe.excalidraw.json`, depth 4)에 stubbed `window.api` 로 mount → chromium 으로 스크롤+스크린샷+기하 측정하는 임시 vite+playwright 하니스 작성. **fix 전:** `gapAboveBand=10`, 스크린샷에서 밴드(`root/elements/0/groupIds`) **위로 `angle:0` row 가 비침** 확인. **fix 후:** offset 0/200/600/1000/1400/2000/3000/5000 전 구간 `gapAboveBand=0`, `bleedRowsAboveBand=0`, 밴드 row 1→4 정상 누적(cap=4), 스크린샷에서 밴드 위 본문 없음 확인. 임시 하니스는 작업 후 제거(electron smoke 와 별개 browser project 라 상시 테스트 미커밋 — 본 티켓 scope 밖). `tsc --noEmit` clean.

### §4.e QA-feedback round 3 — JSON sticky 조상 알고리즘 오류 (stale/root 소실/reorder)

증상 (사용자 재보고): 한 subtree 에서 sibling 으로 스크롤할 때 밴드가 **STALE 깊은 heading 을 유지**(sibling `total_bands` 안인데 `axes_max` 자식이 계속 표시), **root 가 갑자기 사라짐**, 레벨이 **재정렬/스왑**됨.

**실제 root cause (코드 확인):** `recomputeSticky` 가 "고정 probe 선 이하(top ≤ probe) 중 가장 깊은(depth 最大) row"를 골랐다. 이미 화면 위로 한참 스크롤되어 지나간 깊은 노드도 여전히 `top ≤ probe` 이고 depth 가 높아, 실제로 들어가 있는 얕은 sibling 을 이긴다 → stale/reorder. 또한 cap `slice(chain.length - MAX_STICKY_DEPTH)` 가 depth>4 일 때 체인 **앞쪽(root)** 을 잘라 "root 날아감".

**fix (ArtifactJsonTab.tsx 단독):** "밴드 바로 아래 첫 보이는 row 의 조상 경로" 정공법으로 재구현.
- `bandBottom = MAX_STICKY_DEPTH * STICKY_ROW_H` (체인 길이 비의존 고정값 — 피드백 루프 없음).
- `firstVisible` = DOM 순서상 `(rect.top - scTop) ≥ bandBottom` 인 **첫** `[data-pathkey]` row (밴드 바로 아래 첫 보이는 노드). 화면 위로 지나간 row(`top < bandBottom`)는 자동 제외 → stale 깊은 sibling 더 이상 이기지 못함. 바닥까지 스크롤해 밴드 아래에 아무 row 없으면 마지막 row 로 anchor.
- 밴드 = `firstVisible` 의 **조상 경로**(`root → seg1 → … → parent`). anchor 자신의 마지막 segment 는 제외(밴드는 내가 들어가 있는 컨테이너들을 보여줌). 항상 ancestor prefix 라 레벨 스왑/재정렬 불가능.
- cap: **root 항상 고정**. 체인이 cap 초과 시 `root + 가장 가까운 (cap-1) 깊은 조상`만 남기고 중간 생략(root=chain[0] 보존) → "root 날아감" 해소.
- `jumpToKey` band 오프셋 보정·`data-pdt-sticky` NodeFilter(094 find 밴드 텍스트 제외)·`expandOverride`/CSS Highlight/nav refs 전부 무변경.

**경험적 검증 (스크린샷, 필수 — 추론만으론 2회 실패한 항목):** real `ArtifactJsonTab` 를 deep JSON 픽스처(`rubric_refs.axes_max`/`total_bands` sibling, `posts[].eval.categories[]` 중첩 — T-108/109 묘사대로)에 stubbed `window.api` 로 mount 하는 임시 vite(react)+chromium 하니스 작성, scrollTop sweep + 밴드 조상 체인/기하 측정 + 스크린샷.
- offset 0: `root ▸ meta`. 최상단 root 최소 유지.
- axes_max 구간: `root ▸ meta ▸ rubric_refs ▸ axes_max`(및 그 자식). 깊은 child 진입/이탈 시 prefix 가 1단계씩만 변동(스왑 없음).
- **sibling 경계 (scrollTop 500→660)**: `root ▸ meta ▸ rubric_refs`(중간) → `… ▸ total_bands` 로 클린 전환. **axes_max 자식 stale 잔존 0건** (원버그 해소 확인).
- offset 680: `root ▸ rubric_refs ▸ total_bands ▸ band_low` — `meta` 중간 생략, **root 유지**(cap+root 보존 확인).
- 최하단: `root ▸ 1 ▸ eval ▸ categories` — `posts` 생략, root 유지, posts[0]/axes_max stale 없음.
- 전 offset `bandTop=0`, 밴드 위 본문 bleed 0(r2 회귀 없음), **root 항상 present**. click-jump 'root' from deep → 상단 복귀 정상. `tsc --noEmit` clean.
임시 하니스는 작업 후 제거(상시 테스트는 electron smoke 와 별개 browser project — 본 티켓 scope 밖). MD sticky·find(094)·밴드 구조 무변경.

## §5 QA scope

smoke:

MD:
- 다단계 heading(H1/H2/H3)이 있는 .md artifact 를 열고 아래로 스크롤하며 조상 heading 들이 상단에 계단식으로 쌓이는지 확인.
- 더 깊은 섹션 진입 시 스택 추가, 섹션 이탈 시 해당 레벨 제거 확인.
- sticky heading 클릭 → 해당 heading 으로 점프 + 대상이 sticky 바로 아래에 위치하는지 확인.

JSON:
- 깊이 있는 JSON artifact 를 열고 깊은 노드로 스크롤하며 조상 key 경로(`root ▸ surfaces ▸ gui …`)가 상단에 누적되는지 확인.
- 노드 접기/펼치기 후 sticky 경로가 갱신되는지 확인.
- sticky key 클릭 → 해당 노드로 점프 확인.

공통:
- depth cap 초과 시 뷰포트를 잠식하지 않고 축약/생략되는지 확인.
- 최상단 스크롤에서 sticky 가 비거나 루트만 남는지 확인.

## Persona Activity

| When | Persona | Action |
|---|---|---|
| 2026-06-10 | pdt-developer | impl: 양쪽 뷰어에 VS Code 식 sticky-scroll 누적 구현. `MarkdownViewer.tsx` — `body` scroll 컨테이너에 `scrollRef` + rAF-throttle scroll 리스너, 렌더된 `.md-h1/.md-h2/.md-h3` DOM 을 문서순 수집(MdRenderer 무수정), 스크롤 위치의 조상 H1>H2>H3 체인 산출 → `position:sticky` 밴드 계단식 렌더, click 시 `scrollTo` + band 높이 오프셋 보정(`MAX_STICKY_DEPTH=3`, 기존 padding 24/28·maxWidth 780 유지). `ArtifactJsonTab.tsx` — `JsonNode` 객체/배열 헤더 row 에 `data-pathkey/-label/-depth` 부여, 공유 `bodyRef` 를 scroll 컨테이너로 재사용(094 find 와 공존), 화면 상단 걸린 가장 깊은 노드의 path 를 `root ▸ key ▸ key` breadcrumb 밴드로 누적(`MAX_STICKY_DEPTH=4`), 접힘/펼침·find auto-expand(`expandOverride` dep)로 재계산, click 시 `scrollTo` 점프. 094 find 회귀 회피: 밴드에 `data-pdt-sticky` 표식 + find TreeWalker `NodeFilter` 로 밴드 텍스트 제외(phantom highlight 방지), `expandOverride`/CSS Highlight/refs 무변경. `tsc --noEmit` clean. status→review. |
| 2026-06-10 | pdt-developer | qa-fix: JSON 뷰어 sticky 수동 QA 2건 수정 (ArtifactJsonTab.tsx 단독, MarkdownViewer.tsx 무수정). BUG1 — sticky 밴드 비불투명 → 스크롤 본문 비침: `stickyBand` 배경을 반투명 `rgba(14,14,14,0.96)`/`backdropFilter:blur` 에서 JSON 뷰어 body 와 동일한 **solid `#0E0E0E`** 로 교체, `zIndex 5→20` 상향(스크롤 row 위로 확실히 적층), 하단 `boxShadow` 로 경계 강조 — MD 밴드의 불투명 처리 모델과 동일. BUG2 — 단일 레벨만 고정 → 전체 조상 체인 누적: 밴드를 `treeWrap` 내부에서 **scroll 컨테이너(`body`)의 직속 자식**으로 이동(MD 와 동일 구조), `recompute` 를 컨테이너-relative rect 기반 deepest-node 판정 + path segment 로 root→…→current **풀 체인 재구성**(각 segment 가 depth 들여쓰기된 stacked row)으로 재구현, probe 를 가변 밴드 높이 의존성 없이 `MAX_STICKY_DEPTH` 고정값으로 변경(피드백 루프 제거). `jumpToKey` 는 band 오프셋 보정 유지. find(094) 무회귀: `data-pdt-sticky`/`NodeFilter`/`expandOverride`/CSS Highlight/nav 전부 무변경, pathKey 구분자 space 일관성 확인. `tsc --noEmit -p tsconfig.json` clean. status: review 유지, qa_loops 0→1. |
| 2026-06-10 | pdt-developer | qa-fix-r2: JSON sticky 상단 본문 비침 **실제** root cause 수정 (ArtifactJsonTab.tsx 단독, MD 무수정). QA-r1 의 SOLID bg/zIndex 가설은 틀렸음 — 진짜 원인은 `body` 스크롤 컨테이너의 `padding:'10px 0'`. `position:sticky;top:0` 자식은 스크롤포트 padding-box 상단 기준 고정 → padding-top 10px 가 스크롤포트 상단~밴드 상단 사이 strip 을 만들고 그 틈으로 스크롤 row 가 밴드 위에 비쳤다. fix: `body` padding 제거(밴드 flush 고정, strip 0), 수직 여백을 `treeWrap` `padding:'10px 0'` 로 이동(spacing 보존). **경험적 검증**: real ArtifactJsonTab 를 deep JSON(excalidraw, depth4)에 mount 하는 임시 vite+chromium 하니스로 스크롤 sweep — fix 전 `gapAboveBand=10`+`angle:0` bleed 스크린샷 확인, fix 후 전 offset `gapAboveBand=0`/`bleed=0`/밴드 1→4 누적 정상 확인. 임시 하니스 제거. find(094) NodeFilter/CSS Highlight/nav·expandOverride·MD sticky·밴드 구조 전부 무변경. `tsc --noEmit` clean. status: review 유지, qa_loops 1→2. |
| 2026-06-11 | pdt-developer | qa-fix-r3: JSON sticky 조상 알고리즘 오류 수정 (ArtifactJsonTab.tsx 단독, MD 무수정). 사용자 재보고 — sibling 진입 시 STALE 깊은 heading 유지(`total_bands` 안인데 `axes_max` 자식 표시)/root 소실/레벨 reorder. root cause: `recomputeSticky` 가 "고정 probe 이하 중 depth 最大 row"를 골라, 화면 위로 지나간 깊은 노드가 실제 들어간 얕은 sibling 을 이김(stale/reorder) + cap 이 체인 앞쪽(root) 을 잘라 root 소실. fix: "밴드 바로 아래 첫 보이는 row 의 조상 경로" 정공법 — `firstVisible` = DOM 순 `(top-scTop)≥bandBottom` 첫 `[data-pathkey]`(지나간 row 자동 제외), 밴드=그 row 의 ancestor prefix(자기 last segment 제외, 레벨 스왑 불가), `bandBottom` 은 `MAX_STICKY_DEPTH*ROW_H` 고정(피드백 루프 없음), cap=**root 항상 고정**+가장 가까운(cap-1) 깊은 조상, 중간 생략. **경험적 검증(스크린샷)**: deep JSON 픽스처(axes_max/total_bands sibling + posts[].eval.categories[])에 real ArtifactJsonTab mount 하는 임시 vite+chromium 하니스로 scrollTop sweep — sibling 경계(500→660) `rubric_refs`→`total_bands` 클린 전환·axes_max stale 0, deep `root▸1▸eval▸categories`(posts 생략·root 유지), 전 offset root present·bleed 0·bandTop 0, click-jump root 정상 확인. 하니스 제거. find(094)/MD/밴드 구조 무변경. `tsc --noEmit` clean. status: review 유지, qa_loops 2→3. |
| 2026-06-11 | pdt-qa | verify(code-inspection, §4.e r3): JSON sticky 조상 알고리즘 재구현 PASS — `ArtifactJsonTab.tsx recomputeSticky` (L269–320). `bandBottom = MAX_STICKY_DEPTH * STICKY_ROW_H` (L279, 체인 길이 비의존 고정값 — 피드백 루프 없음 ✓). `firstVisible` = DOM 순 `[data-pathkey]` row 중 `(rect.top - scTop) >= bandBottom - 0.5` 인 **첫** row (L286–291); top<bandBottom 인 지나간 row 는 자동 스킵 → stale 깊은 sibling 못 이김 ✓. 밴드 아래 row 없으면 last row anchor (L294–296, 바닥 처리). chain = anchor 의 ancestor PREFIX: `segs.slice(0, len-1)` 로 자기 마지막 segment 제외(L301–302), `chain[0] = {label:'root', depth:0}` 항상 선두(L303), prefix 누적 push(L304–306) → ancestor prefix 라 레벨 스왑/재정렬 불가능 ✓. cap (L311–315): `chain.length > MAX_STICKY_DEPTH` 일 때 `tail = chain.slice(len-(cap-1))` + `capped = [chain[0], ...tail]` → **root(chain[0]) 절대 미탈락**, 중간 생략, "root 날아감" 해소 ✓. 094 find NodeFilter 무회귀: TreeWalker `acceptNode` 가 `closest('[data-pdt-sticky]')` text 를 `FILTER_REJECT` (L206–210), 밴드 `data-pdt-sticky="1"` 표식 intact (L366) → phantom highlight 없음 ✓. MAX_STICKY_DEPTH=4 / STICKY_ROW_H=20 (L61–62). Dev 스크린샷 검증(axes_max→total_bands 전환·root persistence) 기첨부. Central build GREEN 전제. 시각/스크롤 런타임 동작은 user-verify eyeball 잔존. qa_status pass 유지. status → user-verify. |
| 2026-06-10 | pdt-qa | verify(code-inspection): §2 공통/MD/JSON acceptance 전부 코드 충족 확인. 공통 — sticky 스택이 조상 체인을 계단식 누적(MD chain walk-back by level L271-278, JSON path-segment 풀 체인 재구성 L296-300), 클릭 점프(MD `jumpToHeading` L309, JSON `jumpToKey` L325) 둘 다 band 높이만큼 offset 보정 → 대상이 band 바로 아래 위치, depth cap 존재(MD `MAX_STICKY_DEPTH=3`, JSON =4, 둘 다 가장 얕은 조상부터 drop L280/302), 최상단 스크롤 시 체인 비움(MD currentIdx<0 → `[]` L269, JSON hasCurrent false → `[]` L293). MD — `.md-h1/h2/h3` 문서순 수집(MdRenderer 무수정 L247), 섹션 진입/이탈로 스택 갱신, 기존 padding 24/28·maxWidth 780 유지(viewerWrap 무변경). JSON — header row `data-pathkey/-label/-depth`(L468-470) → `root ▸ key ▸ key` breadcrumb 누적, 접힘/펼침·find auto-expand 시 `expandOverride` dep 로 recompute(L323). QA-fix 2건 반영 확인: BUG1 밴드 SOLID `#0E0E0E` + zIndex 20 + boxShadow(본문 비침 제거, L592-601), BUG2 밴드가 scroll 컨테이너 직속 자식 + 풀 multi-depth 체인(단일레벨 아님). 094 find 무회귀: 밴드 `data-pdt-sticky="1"`(L352) + find TreeWalker `NodeFilter` 가 `[data-pdt-sticky]` 내부 text 제외(L203-208) → phantom 매치 없음, expandOverride/CSS Highlight/nav refs 무변경. smoke→pass. status→user-verify (시각/스크롤 산출물 — eyeball 필요). |
