---
ticket_id: T-PATCH-107
title: "Artifacts 탭 재구조화 — flat / archive / 지난 버전 히스토리 토글 트리"
version: v0.5
round: patch
type: feature
status: review
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pass
qa_loops: 0
slug: artifacts-pane-restructure
area_tags: [gui/artifacts, gui/sidepanel]
created_at: 2026-06-10
---

| T-PATCH-107 | artifacts-pane-restructure | review |

# T-PATCH-107: Artifacts 탭 재구조화 — flat / archive / 지난 버전 히스토리 토글 트리

> GUI feature. ActivityBar 의 Artifacts 슬롯(`ArtifactsPane`)을 평면 단일 리스트에서
> "현재 버전 flat → archive(토글) → 지난 버전 히스토리(토글, 각 버전이 동일한 flat/archive 구조)"
> 3단 트리로 재구조화한다. 헤더 라벨도 고정 문자열 `docs/artifacts/` 대신 현재 버전 이름으로 바꾼다.

## §1 Request

### 1.1 유저 질문 (verbatim)

> "Artifacts 탭: flat(level1) 파일들 쭉 나열하고(header docs/artifacts/에서 <version name>으로 수정) 그 아래엔 archive 제목으로해서 archive로 들어간 산출물들 나열해줘(toggle). 그 아래엔 아카이브 버젼 히스토리 토글로 넣어줘 위와 같은 구조로(flat / archive)"

### 1.2 해석 (3단 구조)

1. **헤더 라벨**: `docs/artifacts/` → 현재 버전 이름(예: `v0.5`). 소스 = `poState.current_version`.
2. **FLAT 섹션**: 현재 버전의 level-1(루트) 산출물 파일을 그대로 나열 — `docs/artifacts/<version>/*` (단, `archive/` 하위 제외, `manifest.json` 제외). 항상 펼침.
3. **`archive` 토글 섹션**: 현재 버전에서 archive 로 들어간 산출물 나열 — 기본 접힘.
4. **`지난 버전 히스토리` 토글**: 현재 버전을 제외한 이전 버전들. 각 버전이 위와 동일한 flat / archive 중첩 구조. 기본 접힘.

### 1.3 현재 상태 / 조사 결과 (read, not guessed)

- **`packages/gui/src/components/workspace/ArtifactsPane.tsx`**
  - `api.artifactsListScoped(projectDir, poState.current_version)` 한 번 호출 → 평면 `ArtifactEntry[]` 를 단일 그룹(`SCOPE_LABELS.artifacts = 'docs/artifacts/'`)으로 렌더. (L48~50, L148~158)
  - 헤더 = 하드코딩 문자열 `docs/artifacts/`. 토글/섹션 개념 없음. 빈/로딩/에러 상태는 §8.9 / §2.8 패턴으로 이미 존재.
  - 행 클릭 라우팅(`.html`→preview, `.mmd`→artifact-mermaid, `.json`→artifact-json, 그 외→artifact-md)은 **그대로 재사용**한다.
- **`packages/gui/electron/ipc/artifacts.ts`**
  - `scanDir` 은 디렉터리 **루트만** 읽고 `archive/` 하위로 **재귀하지 않는다**(L55~82). → 현재 archived 파일은 GUI 에 **전혀 보이지 않는다**. 이번 티켓에서 enumeration 확장 필요.
  - `currentVersion === null` 이면 `docs/artifacts/` 의 모든 하위 버전 디렉터리를 평면으로 합쳐버린다(L102~118). 버전 경계가 사라지므로 새 트리에는 부적합.
  - `loadManifest` 는 `manifest.json` 의 `entries[]` 를 **파일 basename(=`e.path`) 키**로 맵핑. archived 엔트리의 `path` 는 `archive/<name>` 형태(스키마 §27, v0.4 manifest 확인됨).
- **archive 판정 — 둘 다 존재, 우선순위 정의**:
  - 실파일: `docs/artifacts/v0.4/archive/*.html` 디렉터리 존재 확인.
  - 매니페스트: 같은 파일이 `status: "archived"`, `path: "archive/<name>"` 로 등록(`designer/bookshelf/artifact-manifest-schema.md` §16, §27, §44~46 — PO 가 reject/supersede 시 파일을 `archive/` 로 옮기고 `path` 갱신).
  - **판정 규칙(SoT = 매니페스트)**: 스키마 §3~5 "GUI 는 매니페스트를 읽는다, 글롭/매직파일명이 아니라" 원칙에 따라 **`manifest status === 'archived'` 를 1차 기준**으로 삼는다. 매니페스트가 없거나 깨진 프로젝트의 graceful fallback 으로만 `archive/` 서브디렉터리 물리 스캔을 보조 기준으로 둔다(둘의 합집합, basename 중복 제거).
- **지난 버전 enumeration**: 정본 버전 목록은 po-state(`poState.versions[]` + `current_version`, `packages/gui/src/lib/types.ts` L334/L341 — `versions[]` 최대 5개)가 SoT. `SidePanelPastVersions.tsx` 와 동일 출처. 단, 디렉터리 부재(po 에는 있으나 `docs/artifacts/<v>/` 없음) 가능 → 산출물 0개면 해당 버전 행은 "(산출물 없음)" 으로 표시하되 행 자체는 노출.
- 마운트: `packages/gui/src/components/workspace/LeftSidebar.tsx` L15 에서 `ArtifactsPane` import, `poState` 주입. preload 바인딩 `artifactsListScoped` (`packages/gui/electron/preload.ts` L946~955).
- i18n: `packages/gui/src/locales/{en,ko}.json` → `workspace.artifacts.*` 블록(현재 `sectionLabel/empty/loadError/emptyHeadline/emptyHelper/needsReview` 등 보유).

## §2 Acceptance

새 ArtifactsPane 트리(ASCII mockup — DS 토큰/lucide 적용):

```
┌──────────────────────────────────────────┐
│  v0.5                          [헤더 라벨]  │  ← poState.current_version, mono, #707070
├──────────────────────────────────────────┤
│  FileText  persona-tier-editor.html        │  } FLAT 섹션 (항상 펼침, 섹션 헤더 없음
│  FileText  PRD.html                         │  }  또는 라벨 생략 — 헤더가 곧 현재 버전)
│  Code2     T-002-a2-mockup.html       •     │  ← • = manifest status 'pending' dot(#D97706)
│  FileText  T-006-brand-accent-purple.md     │
│  …                                          │
│                                            │
│  ⌄ archive                            (3)   │  ← 토글 섹션, 기본 접힘. Chevron + 카운트
│    Code2   productune-mockups-mockup.html   │  }  펼침 시 현재 버전 archived 파일
│    Code2   productune-mockups-showcase.html │  }  (status==='archived'), 한 단 들여쓰기
│    …                                        │
│                                            │
│  › 지난 버전 히스토리                  (2)   │  ← 토글, 기본 접힘. 펼침 시 버전별 중첩
│    › v0.4                                   │  } 각 버전 = 동일한 flat / archive 토글 구조
│    › v0.3                                   │  }  (버전 토글 펼침 → flat 리스트 + 내부 archive 토글)
└──────────────────────────────────────────┘

펼친 지난 버전 1개 상세:
│  ⌄ 지난 버전 히스토리                  (2)   │
│    ⌄ v0.4                                   │  ← 버전 토글 펼침
│        FileText  design-system.html         │  }  v0.4 flat (archive/ 제외)
│        File      service-flow-...json        │  }
│        ⌄ archive                      (3)    │  ← 버전 내부 archive 토글 (기본 접힘)
│            Code2  productune-mockups-...html │
│    › v0.3                                    │
```

- [x] **A1 헤더**: 헤더 라벨이 `docs/artifacts/` 고정 문자열 대신 `poState.current_version`(예: `v0.5`)을 표시. `current_version` 이 null/없음이면 `docs/artifacts/` 로 graceful fallback.
- [x] **A2 FLAT**: 현재 버전 루트 산출물(`archive/` 하위 제외, `manifest.json` 제외)이 flat 으로 나열. 기존 정렬(파일명 오름차순)·아이콘·클릭 라우팅·pending dot 유지.
- [x] **A3 archive 토글(현재 버전)**: `archive` 제목 토글 섹션. 기본 **접힘**. 펼치면 현재 버전 archived 산출물 나열(판정 = manifest `status:'archived'` 우선, `archive/` 서브디렉터리 fallback 합집합). 헤더에 카운트 표시. archived 0개면 섹션 헤더 자체 비노출(빈 토글 금지).
- [x] **A4 지난 버전 히스토리 토글**: 별도 토글 섹션, 기본 **접힘**. 펼치면 `current_version` 제외 버전들을 po-state 순서(`SidePanelPastVersions` 정렬과 동일: `(ended_at ?? started_at) desc`)로 나열. 각 버전은 다시 접을 수 있는 버전 토글.
- [x] **A5 버전 중첩**: 지난 버전 토글을 펼치면 그 버전의 flat 리스트 + 내부 `archive` 토글(기본 접힘)이 A2/A3 와 동일한 규칙으로 중첩 렌더.
- [x] **A6 토글 아이콘**: 모든 토글은 lucide `ChevronRight`(접힘)/`ChevronDown`(펼침), `SidePanelArtifacts`/`SidePanelPastVersions` 의 secHdr 패턴/토큰 재사용. 컬러 emoji 금지.
- [x] **A7 빈 상태**: 현재 버전 산출물(flat+archive)이 전부 0개 → 기존 DS §8.9 empty(FolderOpen + headline + helper) 유지. 지난 버전 토글 내 특정 버전 산출물 0개 → 버전 행은 노출하되 "(산출물 없음)" subtle 텍스트.
- [x] **A8 로딩/에러**: 기존 loading 스피너 / §2.8 error+retry 패턴 유지.
- [x] **A9 클릭 라우팅 불변**: 모든 섹션(flat/archive/지난버전)의 파일 행 클릭 동작은 기존 `handleRowClick` 확장자 라우팅과 동일.
- [x] **A10 read-only 불변**: 생성/편집/삭제 어피던스 없음(기존 invariant 유지).

## §3 Out of scope

- 매니페스트/파일 archive **이동**(reject/supersede)·status 변경 등 PO 라이프사이클 동작 — read-only 표시만.
- 산출물 lint(`scripts/ci/check-artifact-manifest.sh`) 변경.
- `SidePanelArtifacts`(Project 탭 세션 산출물 서브섹션) 변경 — 별개 컴포넌트, 본 티켓 무관.
- 산출물 검색/필터/정렬 옵션 추가.
- po-state `versions[]` 5개 cap 을 넘는 옛 버전 노출(현행 정책 유지).
- 버전별 비교/diff UI.

## §4 Implementation plan

### 4.1 IPC — `packages/gui/electron/ipc/artifacts.ts` (`artifacts:listScoped` 확장)

목표: 버전별로 flat / archived 를 **분리**해 반환. 두 가지 중 택1(B 권장):

- **(권장) 반환 형태 변경 — 버전 그룹 트리**
  - 새 채널 `artifacts:listTree` 추가(기존 `listScoped` 는 호환 유지하거나 deprecate). 입력: `projectDir`, `currentVersion`, `versionIds: string[]`(렌더러가 po-state 에서 추출해 전달 — main 은 po-state 미보유).
  - 반환:
    ```ts
    interface VersionArtifacts {
      version: string
      flat: ArtifactEntry[]      // 루트, archive/ 제외, manifest.json 제외
      archived: ArtifactEntry[]  // status==='archived' ∪ archive/ 물리 스캔, basename dedupe
    }
    // → { current: VersionArtifacts; past: VersionArtifacts[] }
    ```
  - `scanDir` 보강: (a) 루트 스캔은 그대로(archive/ 디렉터리 entry 는 `isFile()` 필터로 이미 제외됨), (b) `scanArchive(versionDir)` 신설 — `versionDir/archive/` 가 있으면 그 안의 ALLOWED_EXTS 파일을 스캔, manifest 에서 `archive/<name>` 키로 meta 조회.
  - archived 판정: manifest `entries` 중 `status==='archived'` 인 것을 1차 수집(파일 실재 확인) + `archive/` 물리 파일 중 manifest 미등록분을 보조 수집. `relPath`/`absPath`/`ext`/`meta` 채워 반환.
  - 경로 가드: 기존 `artifacts:readFile` traversal 가드와 동일 정책 — `archive/` 까지만 허용, 그 밖 탈출 거부.
- **(대안) 렌더러 그룹핑**: `listScoped` 가 archive/ 까지 재귀하도록 한 뒤 `relPath` 의 `/archive/` 포함 여부로 렌더러에서 분류. 단순하지만 버전별 분리를 위해 버전마다 N회 호출 필요 → B 가 깔끔.

preload(`preload.ts`)에 `artifactsListTree` 바인딩 추가.

### 4.2 컴포넌트 — `packages/gui/src/components/workspace/ArtifactsPane.tsx`

- 데이터: `poState.current_version` + `poState.versions[]` 에서 past 버전 id 추출 → `api.artifactsListTree(projectDir, currentVersion, versionIds)` 호출. `artifacts:reload` 이벤트 구독 유지.
- 렌더 구조:
  1. 헤더 = `currentVersion ?? 'docs/artifacts/'` (mono 라벨, 기존 `scopeLabel` 토큰 재사용).
  2. `<FlatList items={current.flat} />` — 기존 행 렌더/라우팅 추출해 재사용 컴포넌트화.
  3. `<ArchiveToggle title="archive" items={current.archived} defaultOpen={false} />` — `archived.length===0` 이면 null.
  4. `<PastVersionsToggle versions={past} defaultOpen={false} />` — 각 항목은 `<VersionNode>` (버전 토글 → FlatList + ArchiveToggle 중첩).
- 토글 상태: 로컬 `useState` Set/record. Chevron 토큰은 `SidePanelArtifacts` secHdr 패턴 차용.
- 빈/로딩/에러 상태 분기 유지(A7/A8).
- i18n: `workspace.artifacts.archiveLabel`("archive"), `workspace.artifacts.versionHistoryLabel`("지난 버전 히스토리"), `workspace.artifacts.versionEmpty`("(산출물 없음)") 키 `en.json`/`ko.json` 양쪽 추가.

### 4.3 회귀 주의

- `current_version` rename 가드(LeftSidebar L57~74)와 충돌 없도록 헤더는 항상 최신 `current_version` 파생.
- po-state `versions[]` 에 있으나 `docs/artifacts/<v>/` 부재 버전 → IPC 가 `flat:[], archived:[]` 반환, 컴포넌트는 "(산출물 없음)" 처리.

## §5 QA smoke

수동 스모크(playwright-electron `surfaces.gui.smoke` 범위):

1. **헤더**: 프로젝트 오픈 → ActivityBar Artifacts 슬롯. 헤더가 `docs/artifacts/` 가 아니라 현재 버전(`v0.5`)을 표시하는지 확인.
2. **flat**: 현재 버전 루트 산출물(`PRD.html`, `T-002-a2-mockup.html` 등)이 flat 으로 보이고 클릭 시 기존 라우팅대로 탭이 열리는지(`.html`→preview, `.md`→artifact-md).
3. **현재 버전 archive 토글**: v0.5 에 archived 가 없으면 archive 섹션 미노출 확인. (테스트 픽스처로 v0.5 manifest 에 `status:'archived'` 1건 추가 시 토글 노출·기본 접힘·펼치면 파일 노출 확인.)
4. **지난 버전 히스토리 토글**: 기본 접힘 확인 → 펼치면 `v0.4` 행 노출. `v0.4` 토글 펼침 → flat(`design-system.html` 등) + 내부 `archive` 토글(`productune-mockups-mockup.html` 등 3건) 노출, 내부 archive 도 기본 접힘.
5. **빈/에러**: 산출물 없는 버전 행 "(산출물 없음)" 표시. IPC 실패 시 retry 배너 동작.
6. **read-only**: 어떤 섹션에도 생성/편집 버튼 없음.
7. lucide chevron 아이콘만 사용(컬러 emoji 0), DS 토큰 색상 일치.

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-developer | opus/standard | impl | §4 대로 구현 완료. IPC: 신규 채널 `artifacts:listTree(projectDir, currentVersion, versionIds[])` → `{ current, past[] }`, 각 버전 `{ version, flat[], archived[] }`. `scanArchive(versionDir, projectDir)` 신설 — manifest `status==='archived'`(실파일 존재 확인)를 1차, `archive/` 물리 스캔을 보조로 basename dedupe 합집합. 기존 `artifacts:listScoped` 는 호환 위해 그대로 유지. preload `artifactsListTree` 바인딩 ARTIFACTS 영역에 추가. ArtifactsPane 재구조화: 헤더=`current_version`(fallback `docs/artifacts/`), FLAT(항상 펼침)/archive 토글(현재 버전, archived 0개면 비노출)/지난 버전 히스토리 토글(po-state `(ended_at??started_at) desc` 정렬, 각 버전 = flat + 내부 archive 중첩, 산출물 0개 버전 "(산출물 없음)"). 토글 전부 lucide ChevronRight/ChevronDown, 기본 접힘, 행 클릭 라우팅·pending dot·empty/loading/error·read-only 불변. i18n `archiveLabel/versionHistoryLabel/versionEmpty` en/ko 추가. 검증: `tsc --noEmit -p tsconfig.json` clean, locale-keys parity(775) + protected-token OK. risk: `artifactsListTree` preload 채널은 다른 에이전트가 곧 만질 preload.ts 의 ARTIFACTS 영역에 국소 추가됨 — 머지 충돌 가능. archived 판정 SoT=manifest, manifest 없는 프로젝트는 `archive/` 물리 스캔 fallback. |
| 2026-06-10 | pdt-qa | opus/standard | qa(code-inspect) | PASS (code-inspection). A1~A10 §2 vs 코드 대조 전부 충족. A1 헤더 `headerLabel = currentVersion ?? 'docs/artifacts/'`(scopeLabel mono, #707070). A2 FLAT: `scanDir` 루트만(archive/ 디렉터리는 isFile() 필터로 제외, manifest.json 제외, name asc 정렬), FileList 가 getIcon/pending dot/handleRowClick 재사용. A3 archive 토글: 현재 버전, 기본 접힘(archiveOpen=false), `current.archived.length>0` 일 때만 렌더(빈 토글 금지), count 표시; `scanArchive` 가 manifest `status==='archived'`(fs.existsSync 확인) 1차 ∪ `archive/` 물리 스캔(basename dedupe) — SoT=manifest 우선. A4 지난버전 토글: 기본 접힘(historyOpen=false), `pastVersionIds` 가 `(ended_at??started_at??id) desc` 정렬·current 제외 후 IPC versionIds 로 전달, past 만 렌더. A5 버전 중첩: VersionNode 가 ToggleHeader(mono) + FlatList(indent2) + 내부 ArchiveToggle(indent2, 기본 접힘 openVersionArchives) 로 A2/A3 규칙 재귀. A6 토글: 전부 lucide ChevronRight/ChevronDown(컬러 emoji 0), secHdr/chevronWrap 토큰. A7 빈상태: current flat+archived 모두 0 → FolderOpen+headline+helper(DS §8.9); 지난버전 산출물 0 → 행 노출 + "(산출물 없음)" versionEmptyText. A8 loading 스피너(Loader2 pdt-spin) / error 배너+retry(load 재호출). A9 handleRowClick 확장자 라우팅(.html→preview, .mmd/.mermaid→artifact-mermaid, .json→artifact-json, else→artifact-md) 불변. A10 read-only: button 행만, 생성/편집/삭제 어피던스 없음. IPC 가드: `artifacts:readFile` traversal 가드(projectDir+sep startsWith) 불변, listTree 는 projectDir 부재 시 empty 반환, versionIds null-safe. `artifacts:reload` 이벤트 구독 유지. 시각/런타임(토글 접힘·픽스처 archived·chevron 렌더)은 빌드 GREEN(parity 778, tsc 0, smoke pass) 전제 하 user-verify 로 이관(§5). qa_status: smoke→pass. |
