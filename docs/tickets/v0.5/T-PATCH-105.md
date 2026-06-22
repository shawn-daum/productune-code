---
ticket_id: T-PATCH-105
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: pass
qa_loops: 0
slug: env-panel-file-count
area_tags: [gui/env]
created_at: 2026-06-10
---

# T-PATCH-105: env 사이드 패널 섹션 배지 = 파일 수

## 1. Request

**요청 (verbatim):** "각 파일의 변수 수를 합산하지 말고 파일수만 찍어줘"

env 사이드 패널의 섹션 카운트 배지가 현재 **모든 파일에 걸친 변수의 총합**을 표시하는데, **파일 개수**를 표시해야 한다.

**확인:**
- `packages/gui/src/components/workspace/SidePanelProjectEnv.tsx:86`
  `const totalKeys = files.reduce((sum, f) => sum + f.entries.length, 0)`
- 86행에서 합산한 `totalKeys` 가 102행 `{totalKeys}` 로 섹션 배지에 렌더된다.
- 사용자는 이 섹션 배지가 변수 총합이 아니라 env **파일 수** (`files.length`) 를 보여주길 원한다.
- 단, per-file key-count 배지 (148행, `{fg.entries.length}`) 는 **현행 유지**.

## 2. Acceptance

- [x] **[AC-1]** 섹션 헤더 배지가 env **파일 개수** (`files.length`) 를 표시한다 (변수 총합 아님).
- [x] **[AC-2]** per-file 배지 (각 파일 행의 변수 수, 148행) 는 **변경 없이** 그대로 유지된다.
- [x] **[AC-3]** 파일이 0개일 때 배지 비표시 동작은 기존과 동일 (현재 `> 0 && !loading` 가드 유지).

## 3. Out of scope

- per-file 배지 표시/스타일 변경.
- 배지 외 다른 UI/문구/아이콘 변경.
- 파일 목록 정렬·필터·열기 동작 변경.

## 4. Implementation plan

### `packages/gui/src/components/workspace/SidePanelProjectEnv.tsx`

- 86행의 `totalKeys` (변수 합산) 를 **파일 수**로 교체.
  - 예: `const fileCount = files.length` 로 의미를 분명히 하고, 102행 섹션 배지 렌더와 가드를 `fileCount` 기준으로 변경 (`{fileCount > 0 && !loading ? <span style={countBadge}>{fileCount}</span> : null}`).
  - `totalKeys` 가 다른 곳에서 더 이상 쓰이지 않으면 제거.
- 148행 per-file 배지 (`{fg.entries.length}`) 는 **건드리지 않음** (AC-2).

## 5. QA smoke

1. `pnpm --filter @productune/gui tsc --noEmit` — 오류 없음. *(done — central build GREEN: gui tsc 0)*
2. GUI 실행 → env 섹션 확장 → 섹션 헤더 배지가 **파일 개수**와 일치하는지 확인 (예: `.env`, `.env.local` 2개면 배지에 `2`). *(user-verify — runtime; 코드상 `{fileCount}` = `files.length` 확인됨)*
3. 각 파일 행의 변수 수 배지가 그대로 유지되는지 확인 (AC-2). *(done — per-file 배지 148행 `{fg.entries.length}` 미변경 확인)*
4. env 파일이 없는 프로젝트에서 섹션 배지가 표시되지 않는지 확인 (AC-3). *(done — 가드 `fileCount > 0 && !loading` 확인, files.length=0 → 배지 null)*

## 6. Persona Activity

- **pdt-developer (impl):** `SidePanelProjectEnv.tsx` 섹션 배지를 변수 총합(`totalKeys`)에서 파일 수(`fileCount = files.length`)로 교체. 86행 변수 + 102행 렌더/가드 두 곳 수정, per-file 배지(148행)는 미변경. `tsc --noEmit` 통과 (scoped, exit 0). i18n 문구는 "keys" 라벨이 없어 변경 불필요. status → review.
- **pdt-qa (verify):** Code inspection PASS. 86행 `const fileCount = files.length` (변수 합산 `reduce(... + f.entries.length)` 제거 확인, AC-1 ✓). 섹션 배지 102행 `{fileCount}` 렌더, 가드 101행 `fileCount > 0 && !loading` → files.length=0 시 null (AC-3 ✓). per-file 배지 148행 `{fg.entries.length}` 그대로 유지(AC-2 ✓). `totalKeys` 잔존 참조 없음(grep clean). Central build GREEN(gui tsc 0) 전제. AC-1~AC-3 모두 코드로 충족 — 잔여는 배지 숫자 eyeball(user-verify, 선택). qa_status smoke→pass.
