---
ticket_id: T-PATCH-169
version: v0.5
slug: cost-archive-redesign
title: 토큰 비용 아카이브 재배치 — 탭 제거, persona×모델 단일 + 하단 버전별 + 띄어쓰기
type: code
status: todo
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: cost-archive
risk_flags: [design-needed]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-169: 비용 아카이브 재배치

## 요청 (user)
- 탭(Version / 페르소나 / 모델 / 페르소나×모델) 구조 제거 — **페르소나×모델 단일 테이블**을 메인으로.
- **버전별 배치는 하단에**(탭 분리 X — 같은 뷰에 이어서).
- **띄어쓰기**(spacing) 개선.

## 현 상태
`CostArchivePanel.tsx`(+`main/panes/CostArchiveTab.tsx`): `GROUP_OPTIONS` 4개 탭(version/persona/model/persona-model, ~L81-84) + 탭 전환 grouped 테이블. persona×model pivot 렌더 이미 있음(~L90+).

## Fix
1. **탭 UI 제거**: GROUP_OPTIONS 4-탭 버튼 줄 삭제. CostGroupBy 상태 불필요.
2. **메인 = persona×model pivot** 상시 표시(기존 PivotRow 렌더 재사용).
3. **하단 버전별 섹션**: 같은 스크롤 뷰 안에 persona×model 아래로 "버전별" 소제목 + version-grouped 테이블(기존 by:'version' 집계 재사용). 탭 아님.
4. **spacing**: 행 padding / 컬럼 gap / 섹션 간격 보강(디자인 톤 VersionsPanel 일치).
5. CostArchivePanel + CostArchiveTab 둘 다(패널/탭 양쪽 쓰면 정합).

## Acceptance
- AC-1: 탭 없음. persona×모델 테이블이 바로 보이고, 그 아래 버전별 테이블.
- AC-2: spacing 개선(행/컬럼/섹션).
- AC-3: 집계 데이터/IPC(cost:aggregate, cost:aggregatePivot) 로직 불변 — 표시만 재배치. build PASS.

## Note
- "왜 PO만 나오나"(다른 persona 비용 0)는 **데이터 문제(T-PATCH-170)** — 본 티켓은 레이아웃만. 170 들어가면 이 뷰에 자동 반영.

---

## Impl Spec (pdt-designer, plan-first)

실제 파일 경로는 `packages/gui/` 하위(티켓 본문의 `src/...`는 워크스페이스 루트 누락 — 실경로로 정정).

### 파일별 변경

#### A. `packages/gui/src/components/workspace/CostArchivePanel.tsx` (메인 변경 — 이 컴포넌트가 단일 SoT)
탭/단일-그룹 테이블을 모두 제거하고, 한 스크롤 뷰에 **persona×model pivot(상단)** + **버전별 테이블(하단)** 을 항상 같이 렌더한다. 두 데이터 소스(`costAggregatePivot`, `costAggregate(by:'version')`)를 동시에 fetch한다.

1. **상태 재구성 (L178-180)**
   - `const [by, setBy] = useState<CostGroupBy>('version')` 삭제 — `CostGroupBy` 타입 자체는 `costAggregate` 호출에 더이상 인자로 안 쓰므로 `'version'` 리터럴만 남기면 됨(타입 alias는 제거 가능, L22).
   - `result`(version-grouped), `pivot`(persona×model) 두 state는 **둘 다 유지**. 더이상 배타적이지 않고 동시 표시.

2. **fetch 로직 (`fetchAgg`, L182-200)**
   - 분기(`if (by === 'persona-model')`) 제거. 매 fetch마다 **두 IPC를 모두** 호출:
     ```
     api.costAggregatePivot(projectDir).then(setPivot).catch(→ empty PivotResult)
     api.costAggregate(projectDir, 'version').then(setResult).catch(→ empty AggregateResult)
     ```
   - 의존성 배열에서 `by` 제거 → `[projectDir]`만. (L200, 그리고 L218 effect의 deps도 따라서 정리.)
   - **IPC 시그니처/채널 불변**: `cost:aggregate`, `cost:aggregatePivot` 그대로. main 프로세스(`electron/ipc/costArchive.ts`) **수정 없음**.

3. **탭 UI 삭제 (L231-251)**
   - `<div style={tabRow}>...</div>` 블록 전체 + `TABS` 상수(L80-85) 삭제.
   - `tabRow`/`tabBtn`/`tabBtnActive` 스타일(L309-333) 삭제.

4. **본문 렌더 (L220-281 교체)**
   - `isPivot`/배타 분기 삭제. 다음 순서로 렌더:
     1. (a) **persona×model 섹션**: `<div style={sectionLabel}>{t('costArchive.byPersonaModel')}</div>` 소제목 + 기존 `renderPivot(pivot, pivotRows, t)` **그대로 재사용**(L94-172 함수 미변경). pivot empty면 `emptyHint`.
     2. (b) **버전별 섹션**: `<div style={{...sectionLabel, marginTop: 22}}>{t('costArchive.byVersion')}</div>` 소제목 + 기존 single-group 테이블 렌더(헤더 colKeyHead/colNumHead, body colKey/colNum, totalRow) — by는 항상 `'version'`이므로 헤더 라벨 삼항식(L261)은 `t('costArchive.byVersion')` 고정으로 단순화. version groups empty면 `emptyHint`.
   - empty 판정은 pivot/version 각각 독립적으로(섹션별 `emptyHint`).

5. **spacing 보강** (VersionsPanel 톤 일치 — `sectionLabel` fontSize10/uppercase/marginBottom8, panel padding `14px 12px 12px` 동일):
   - `sectionLabel` 스타일 신규 추가(VersionsPanel L190-197 복제). `titleRow`(L300)는 패널 최상단 1회만 유지.
   - 섹션 간격: 버전별 소제목에 `marginTop: 22`(VersionsPanel는 18; 표 2개 사이라 살짝 더 넉넉히).
   - 행 padding: `rowBase`(L343-348) `padding: '6px 10px'` → `'8px 12px'`(VersionsPanel 행 톤).
   - 컬럼 gap: `rowBase` `gap: 8` → `gap: 12`.
   - disclaimer(L284-285) 블록은 두 표 **아래에 1회만** 유지, `marginTop` 그대로(필요시 12로).

#### B. `packages/gui/src/components/workspace/main/panes/CostArchiveTab.tsx`
- 변경 **없음**. 단순 wrapper(`<CostArchivePanel projectDir=.../>`)로 패널을 그대로 호스팅 → A의 변경이 탭/패널 양쪽에 자동 반영. (티켓 Fix #5 "둘 다"의 정합은 Tab이 Panel을 재사용하므로 Panel 한 곳 수정으로 충족.)

#### C. `packages/gui/electron/ipc/costArchive.ts`
- 변경 **없음**(AC-3). aggregate/aggregatePivot/watch 로직·채널 전부 불변.

### i18n
- 신규 키 불필요 — `costArchive.byPersonaModel`, `costArchive.byVersion`, `costArchive.empty`, `total/subtotal/col*` 전부 기존 키 재사용. (제거되는 건 탭 라벨 사용처일 뿐 키 자체는 byVersion/byPersona/byModel 모두 소제목·헤더로 계속 사용.)

### 검증
- build PASS (tsc — 미사용 `CostGroupBy` import/alias 정리해 unused 경고 없도록).
- 런타임: 탭 버튼 0개, persona×model 표가 즉시 보이고 그 아래 "버전별" 표. 두 표 합 = 동일 turns.jsonl 집계(IPC 불변이므로 수치 동일).
