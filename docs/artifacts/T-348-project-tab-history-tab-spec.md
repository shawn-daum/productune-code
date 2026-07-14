---
ticket: T-348
title: 프로젝트 탭 재구성 + 프로젝트 히스토리 탭 신설 — 레이아웃/IA 스펙
owner: designer
status: draft — awaiting shawn approval
date: 2026-07-14
related: T-347, docs/designer/design-system.md
mockup: docs/artifacts/T-348-project-tab-history-tab-mockup.html
---

# T-348 — 프로젝트 탭 / 프로젝트 히스토리 탭 IA 스펙

## 0. 결정 요약 (what's changing)

| # | 변경 | 대상 |
|---|---|---|
| 1 | 아티팩트 탭(활동바 `artifacts` 아이콘) 내용을 **프로젝트 탭 안**으로 이관 | `LeftSidebar.tsx`, `ArtifactsPane.tsx` |
| 2 | 기존 아티팩트 탭 자리를 **프로젝트 히스토리** 탭으로 교체 — 닫힌 버전 타임라인 | `ActivityBar.tsx`, 신규 `HistoryPane` |
| 3 (2026-07-14 추가) | **버전 탭**(`ticket-review` main pane) 상단의 PRD 섹션을 프로젝트 탭으로 이관 | `TicketReviewTab.tsx`, `PrdSection.tsx` |

세 결정 모두 같은 원칙을 따른다 — **"이 버전이 무엇인가"(카드·PRD·산출물·outcome)와 "이 버전이 지금 무슨 일을 하고 있나"(티켓 보드)를 분리**한다. 전자는 프로젝트 탭(진행 중)과 히스토리 탭(닫힘)에, 후자는 버전 탭(티켓/보드 전용)에 남는다.

---

## 1. 프로젝트 탭 — 섹션 순서/계층

### 1.1 현재 상태 (as-is)

`LeftSidebar.tsx`의 `activeIcon === 'project'` 바디, 위→아래:
1. `SidePanelCurrentVersion`(legacy) / `SidePanelPrdtProjectCard`(prdt) — 카드
2. `SidePanelProjectEnv` — `.ENV`
3. `SidePanelPastVersions` — legacy 전용, prdt는 숨김
4. `SidePanelArtifacts` — **이번 세션에서 연 파일만** 보여주는 임시 목록 (session-scoped, 새로고침하면 사라짐)

별도로 활동바 `artifacts` 아이콘 = `ArtifactsPane` — `docs/artifacts/<version>/`를 실제로 스캔해 flat + archive + (과거 버전 nested) 트리를 보여주는 진짜 브라우저. 오늘은 이 두 "아티팩트"가 서로 다른 데이터 소스로 병존한다 — 세션 목록(사이드바)과 디스크 트리(별도 탭).

### 1.2 새 순서 (to-be)

```
프로젝트 탭
├─ 1. 프로젝트 카드            (변경 없음 — SidePanelPrdtProjectCard / SidePanelCurrentVersion)
├─ 2. PRD                      (신규 위치 — 버전 탭에서 이관)
├─ 3. 아티팩트                 (재정의 — 아티팩트 탭 내용 흡수, 세션 목록과 통합)
├─ 4. (legacy 전용) 지난 버전  (변경 없음, 위치만 하단으로)
└─ 5. .ENV                     (변경 없음, 위치만 최하단으로)
```

### 1.3 왜 이 순서인가

- **카드 → PRD**: 카드가 "이 버전이 무엇인가"의 신원(slug/version/stage)이라면, PRD는 그 버전이 "무엇을 하려는가"다. 카드 바로 아래 두어 하나의 흐름(신원 → 의도)으로 읽히게 한다.
- **PRD → 아티팩트**: 의도(PRD) 다음은 그 의도의 산출물(artifacts). 시간순(계획 → 결과) 흐름 유지.
- **아티팩트 → 지난 버전(legacy only) → .ENV**: `.ENV`는 설정/플러밍 — 콘텐츠(카드·PRD·아티팩트)보다 참조 빈도가 훨씬 낮다. Design system §1.5.1(Few Things)의 progressive disclosure 원칙대로 콘텐츠를 우선하고 설정을 맨 뒤로 민다. 오늘도 `.ENV`는 기본 접힘 상태가 아니라 파일명만 나열하는 조용한 섹션이라 위치 변경의 체감 손실이 없다.
- **legacy `지난 버전` 섹션은 이번 스코프 밖**이다 (§6 참조) — 위치만 아티팩트와 .ENV 사이로 옮긴다. prdt 프로젝트는 애초에 숨겨져 있으므로 영향 없음.

### 1.4 섹션별 스펙

#### (2) PRD 섹션

- **컴포넌트**: 기존 `PrdSection.tsx`를 재사용하되, 사이드바 섹션 크롬(10px uppercase 라벨 헤더, `secHdrStatic`/`sectionWrap` 톤 — `SidePanelProjectEnv`/`SidePanelArtifacts`와 동일 recipe)에 맞춰 압축한 변형을 쓴다. 지금의 `h3`(18px) 타이틀 + 큰 패딩은 메인 페인 전용 톤이므로 사이드바에는 과함.
- **행 1개**: `docs/prd/PRD.md` — 파일명 + 열기 화살표(↗). 클릭 시 기존과 동일하게 `artifact-md` 탭으로 오픈.
- prdt는 항상 master(`docs/prd/PRD.md`)를 가리킨다 (닫힌 버전 스냅샷은 히스토리 탭 몫 — §2.4).
- **빈 상태**: PRD.md가 없거나 읽기 실패 → 기존 `prdNonePlaceholder` 톤 유지("PRD 없음", 이탤릭 텍스트) — 섹션 자체는 항상 노출(숨기지 않음, 카드/`.ENV`와 동일한 "절대 사라지지 않는다" 원칙 — T-347에서 확립한 graceful-fallback 관례를 그대로 따름).

#### (3) 아티팩트 섹션 — 세션 목록과 디스크 트리 통합

**문제**: 오늘은 두 개의 "아티팩트 UI"가 있다 — ① `SidePanelArtifacts`(이번 세션 중 연 파일만, 앱 재시작하면 텅 빔), ② `ArtifactsPane`(디스크의 실제 `docs/artifacts/<v>/` 전체 트리). 아티팩트 탭이 없어지면 ②를 프로젝트 탭 안에 그대로 우겨넣는 대신, **①을 ②로 흡수 통합**한다 — 같은 탭에 "아티팩트" 개념이 두 벌 있는 건 §1.5.1 Few Things 위반이고, ②가 ①의 상위집합이라 병합 손실이 없다.

- **컨텐츠**: `ArtifactsPane`의 "현재 버전" 절반만 가져온다 — flat 목록(들여쓰기 0) + archive 토글(collapsed default). **"version history" 토글은 제거** — 과거 버전 아티팩트는 이제 히스토리 탭의 각 버전 엔트리 안에서 본다(§2.4). 같은 데이터를 두 곳에서 브라우징하게 두지 않는다.
- **세션 강조 유지**: `SidePanelArtifacts`가 갖고 있던 "이번 세션에 연 파일은 dim 처리(opacity 0.45)" 피드백은 그대로 새 통합 섹션의 flat 목록 행에 적용한다 — 사라지는 게 아니라 더 큰 목록 위에 얹는 오버레이 상태가 된다.
- **헤더 카운트 배지**: 오늘의 "세션 중 연 파일 수"가 아니라 **현재 버전의 flat+archived 전체 개수**로 바뀐다 — 앱을 껐다 켜도 산출물이 있으면 섹션이 보여야 하기 때문(오늘의 결함: `files.length === 0`면 `return null`이라 재시작 후 조용히 사라짐 — 이번 통합이 이 결함도 없앤다).
- **기본 접힘/펼침**: `SidePanelArtifacts`와 동일하게 collapsed default, 카운트 > 0이면 배지 강조.
- **빈 상태**: 아티팩트 0건 → 섹션 헤더는 유지하되(카드/PRD/.ENV와 같은 원칙) 펼치면 `ArtifactsPane`의 기존 empty copy(`workspace.artifacts.emptyHeadline`/`emptyHelper`) 재사용.
- **"open all" 링크**: 기존 유지 (>3건일 때만 노출).

#### (5) .ENV 섹션

변경 없음 — `SidePanelProjectEnv.tsx` 그대로, 위치만 최하단.

#### (4) legacy 지난 버전 (out of scope)

변경 없음 — `SidePanelPastVersions.tsx` 그대로, 위치만 아티팩트와 `.ENV` 사이. prdt 프로젝트는 계속 숨김.

---

## 2. 프로젝트 히스토리 탭 (신규, 아티팩트 탭 자리를 대체)

### 2.1 활동바 변경

- `ActivityBar.tsx`의 `artifacts` 아이콘 슬롯을 재사용 — 같은 2번째 위치, 아이콘만 `Package` → `History`(lucide) 로 교체, 라벨 "산출물"/"Artifacts" → **"히스토리"/"History"**.
- `ActivityIcon` 타입 값 `'artifacts'` → `'history'`로 rename (또는 값 유지하고 라벨/아이콘만 바꾸는 건 impl 판단 — IA 관점에선 슬롯 위치 고정이 핵심).
- 사이드바 헤더 타이틀(`TAB_TITLES.history`) = **"프로젝트 히스토리"**(풀 네임 — 활동바 아이콘 라벨은 공간상 축약, 헤더는 풀 네임으로 명확히).
- 헤더 우측 액션(`RefreshCw`, 오늘 아티팩트 탭 전용)은 히스토리 탭에도 유지 — git tag/ticket 스캔은 파일시스템 변화를 실시간 감지하지 않으므로 수동 새로고침 필요.

### 2.2 사이드바 바디 — 타임라인 목록

기존 `SidePanelPastVersions`(legacy)의 행 스타일(`VersionRow`)을 그대로 재사용하는 **동일 인터랙션 모델**로 간다 — 사이드바는 압축 목록, 클릭하면 메인 페인에 상세 탭이 열리는 구조(§2.3). 새 패턴을 발명하지 않는다.

**행 구성** (버전 1개 = 1행):
```
[v1.0]  closed 2026-07-03 · 8 tickets
```
- 버전 id 필(pill, mono) — 카드/과거버전 목록과 동일 톤
- closed 날짜 (git tag 커밋 날짜, YYYY-MM-DD)
- 티켓 수 배지 (§2.5 참조 — 0건이면 "no tickets"로 표기, "0/0"처럼 숫자만 찍어 마치 실패처럼 보이게 하지 않는다 — v1.0이 실제로 이 케이스다)

**정렬**: 닫힌 날짜(git tag commit date) 내림차순 — 최근 닫힌 버전이 위.

**진행 중(현재) 버전의 취급 — 표시하지 않는다.**
사용자의 정의("v1 → v1.1이 되면 v1은 히스토리에 들어간다")를 문자 그대로 따르면 히스토리 = 닫힌 것만이다. 진행 중 버전을 타임라인에 섞으면 "닫힘"의 의미가 흐려진다. 대신 목록 맨 위에 옅은(non-interactive, `--text-faint`) 고정 안내行을 둔다:

```
진행 중: v1.1 — 프로젝트 탭에서 보기 →
```

클릭하면 활동바를 `project`로 전환(단순 내비게이션 — 앱 nav-stack 안, §1.5.5 원칙 그대로). 사용자가 "내 현재 버전 왜 안 보이지"라고 헷갈릴 여지를 사전에 차단한다(Predictability).

### 2.3 메인 페인 — `history-detail:<v>` 탭

행 클릭 → 새 탭 타입 `history-detail`(`VersionDetailTab`/`VersionHistoryTab`과 같은 패턴 — 얇은 wrapper가 `HistoryDetailView`를 마운트) 오픈. 레거시의 `version-history`(전체 보드+deploy 이벤트 aggregate)와 `version-detail`(단일 버전) 두 탭 타입 구분은 **이번 신설분에는 가져오지 않는다** — prdt는 단일 라인 버저닝이라 "여러 버전 합친 보드" 개념 자체가 없다(YAGNI). 사이드바 타임라인이 이미 그 개요 역할을 한다.

**섹션 순서 (위→아래)** — "의도 → 결과 → 근거 → 실행 → 산출물" 이 아니라, **결과를 최우선**에 둔다:

1. **헤더** — 버전 id(대) + `CLOSED` 배지(`--stage-retro` 이모랄드 `#34D399` 톤 재사용 — §2.6.1 prdt stage `retro` = "완결" echo 색과 정합) + closed 날짜.
2. **Outcome / North star** — 이 버전이 왜 있었는지의 답. 카드형, `retro--v<N>.md`의 `## Outcome` 섹션에서 파생(§2.4 파싱 규칙). **맨 위에 두는 이유**: doctrine #7 "User outcome over output — 버전의 성공은 티켓이 닫혔을 때가 아니라 north star가 움직였을 때"를 IA로 그대로 구현한 것 — 히스토리를 열어본 사람이 스크롤 없이 가장 먼저 보는 게 "그래서 이 버전 성공했나"가 되게 한다.
3. **PRD** — `docs/prd/versions/<v>.md` 스냅샷 1행 열기 링크(기존 `PrdSection` 닫힌-버전 분기 그대로 재사용). 없으면(prdt는 버전별 스냅샷을 만들지 않을 수 있음) 조용한 placeholder.
4. **Tickets** — 상태별 카운트 요약(`N done · M dropped`, 비정상 시 `K open` 남아있으면 amber 강조 — "닫힌 버전인데 open 티켓이 남아있다"는 정직하게 드러내야 할 이상 신호) + "티켓 보드 열기" 1행 링크. 클릭 시 기존 `ticket-review:<v>` 탭(이미 `versionFilter`로 특정 버전 필터링 가능 — `TicketDashboardView` 그대로 재사용)을 연다. **칸반을 여기 다시 그리지 않는다** — 있는 뷰를 재사용(doctrine #2).
   - v1.0처럼 티켓이 아예 없는 버전 → "티켓 없이 커밋 단위로 진행된 버전입니다" 안내(회고 원문 근거) — 링크 자체를 숨긴다(열 보드가 없으므로).
5. **Artifacts** — 이 버전 스코프의 `docs/artifacts/<v>/` flat+archive. **`ArtifactsPane`의 기존 `VersionNode`(과거 버전용 nested flat+archive 렌더러)를 그대로 재사용** — 오늘 아티팩트 탭 하단의 "version history" 토글 안에 있던 바로 그 컴포넌트를, 여기로 옮겨와 해당 버전 1개에 대해 always-open으로 쓴다. 이게 "과거 버전 아티팩트를 어디서 보나"의 유일한 경로가 된다(§1.3에서 프로젝트 탭 아티팩트 섹션은 현재 버전 전용으로 한정했으므로).
6. **Retro 전체보기** — `docs/wiki/retro--v<v>.md` 열기 1행 링크(MarkdownViewer). Outcome 카드가 이미 핵심을 보여줬으니, 이건 "더 읽기"(what shipped / what worked / what to change 전문) 위치로 맨 아래.

### 2.4 데이터 파생 — 버전 발견/닫힘 판정 알고리즘

제약: `docs/tickets/v<N>/`, `docs/wiki/retro--v<N>.md`, git tag만 사용. 손으로 유지하는 데이터(0건)로 파생돼야 한다.

**버전 후보 집합 = 세 소스의 합집합**(중요 — 하나만 보면 틀린다):
```
candidates = { dir names under docs/tickets/ matching /^v\d+(\.\d+)*$/ }
           ∪ { git tag names matching /^v\d+(\.\d+)*$/ }
           ∪ { docs/wiki/retro--v<N>.md 파일명에서 추출한 <N> }
```
**실제 리포에서 왜 3중 합집합이 필수인지**: `v1.0`은 `docs/tickets/v1.0/` 디렉토리가 **존재하지 않는다**(회고 원문: "v1.0은 ticket 없이 커밋 단위로만 진행"). ticket 디렉토리만 스캔하면 v1.0이 통째로 안 보인다. git tag(`v1.0`) + retro 파일(`retro--v1.0.md`)이 유일한 존재 증거다.

**"닫힘" 판정 = git tag 존재 여부만을 SoT로 쓴다.**
- retro 파일이 있어도 태그가 없으면 **아직 닫힌 게 아니다** — retro 작성(playbook step 5)과 태깅(step 8)은 순서가 있는 별개 스텝이라, "retro는 썼지만 아직 태그 전" 상태가 실존한다. 이 상태의 버전을 히스토리에 올리면 "닫힘 날짜"를 보여줄 근거가 없다(태그 커밋 날짜가 유일한 날짜 소스 — retro frontmatter엔 날짜 필드가 없음, 실제 확인함). 따라서 **태그 없는 버전은 히스토리에 노출하지 않는다.**
- `docs/tickets/` 아래 있지만 태그도 retro도 없는 디렉토리(예: 지금의 `v1.1` — 진행 중)는 "현재 버전"과 비교해 판별: `candidate === poState.version` → 진행 중 배너로(§2.2), 아니면 → **버려진/이름만 있는 버전** 취급, 히스토리에도 진행중 배너에도 안 뜸(고아 상태 — 발생 시 `doctor` 류 점검에서 잡을 문제이지 히스토리 UI가 떠안을 문제가 아님).
- `backlog/` 등 버전 네이밍(`v<N>`) 패턴에 안 맞는 디렉토리는 애초에 candidate 집합에서 제외.

**닫힌 날짜** = `git log -1 --format=%ai <tag>` (커밋 날짜). 유일한 날짜 소스.

**티켓 카운트** = `docs/tickets/v<N>/*.md` frontmatter `status` 집계(`done`/`open`/`dropped` — prdt 3-value enum). 디렉토리 자체가 없으면(v1.0 케이스) 카운트 0, "티켓 없이 진행" 문구로 대체(§2.3 #4).

**Outcome 파싱** = `retro--v<N>.md`의 `## Outcome` 헤딩부터 다음 `## `까지의 블록을 그대로 인용(정규식/마크다운 파서 아무거나 — 구조는 안정적, retro playbook이 매 버전 동일 헤딩 세트를 강제함: `## What shipped/worked/to change/Outcome/...`). 파일이 없으면(태그는 있는데 retro가 없는 비정상 케이스) "회고 없음" 조용한 안내 — outcome을 지어내지 않는다.

**신규 백엔드 의존성 — 명시적으로 플래그**: 현재 코드베이스에 **git tag를 읽는 IPC/로직이 전혀 없다**(`preload.ts`/`electron/ipc`를 확인함 — `github:*` IPC는 원격 GitHub API이지 로컬 tag 목록이 아니다). `prdt history` CLI(Python)도 tag를 읽지 않는다. 이번 기능은 로컬 git tag 목록 + 커밋 날짜를 읽는 **새 IPC 핸들러**(예: `git:listTags(projectDir)`)가 반드시 추가돼야 성립한다 — impl 티켓에 필수 선결 작업으로 명시할 것.

### 2.5 상태 (states)

| 상태 | 화면 |
|---|---|
| 히스토리 없음(첫 버전 진행 중, 닫힌 버전 0건) | §8.9 Empty pane 패턴 — `History` 아이콘(`--icon-2xl`, `--text-faint`) + 헤드라인("아직 히스토리가 없어요") + 설명("첫 버전이 진행 중이에요 — 버전이 닫히면 여기 기록됩니다") + 1차 액션(secondary 버튼, "프로젝트 탭 보기" — 실제로 있는 유일하게 의미있는 다음 행동). §1.6.7의 empty state는 primary CTA 의무 규정을 이 "다음 행동으로 자연스레 안내"로 충족. |
| 티켓 0건인 닫힌 버전(v1.0류) | §2.3 #4 참조 — "0/0" 대신 서술형 문구, 보드 링크 숨김 |
| 태그는 있는데 retro 없음 | Outcome 카드: "회고 없음" 이탤릭. 다른 섹션(PRD/Tickets/Artifacts)은 정상 렌더 — outcome 부재가 나머지를 가리지 않는다 |
| git 자체를 못 읽음(비-git 프로젝트, tag IPC 실패) | 카드/`.ENV`와 동일한 명시적 에러 배너(§8.4 Banner 토큰, `--health-warn`) — "버전 히스토리를 계산할 수 없습니다" + 원인 힌트. 조용히 빈 화면 X (T-347에서 확립한 "절대 침묵하지 않는다" 원칙 연장) |
| 닫힌 버전인데 open 티켓 잔존 | §2.3 #4 — amber 강조, 숨기지 않음(정직한 이상 신호) |

---

## 3. 버전 탭 — PRD 제거 영향

### 3.1 `TicketReviewTab.tsx` (prdt, 현재 버전)

`<PrdSection versionId={versionFilter} />`를 제거. 탭은 `TicketDashboardView` 단일 콘텐츠 타입만 남는다 — §1.5.1 "Pane = 단일 콘텐츠 타입" 원칙에 더 잘 맞아진다(오늘은 PRD+칸반 두 타입이 한 탭에 있었음). PRD가 빠진 자리는 칸반이 위로 당겨 채운다(추가 레이아웃 불필요).

### 3.2 `VersionDetailView.tsx` (legacy, 과거 버전) — 확장 제안

이 파일도 동일하게 `<PrdSection versionId={versionId} />` 행을 갖고 있다(`OutcomeCard` 바로 아래). 일관성을 위해 **같은 원칙을 여기도 적용할 것을 권고**한다 — "닫힌 버전의 PRD는 그 버전의 신원(identity) 옆에", 즉 legacy 세계에서 신원 화면은 바로 이 `VersionDetailView` 자신이므로, 실제로는 **제거하지 않고 그대로 둔다** (legacy에는 이 화면 자체가 "히스토리 상세"이기도 해서, prdt처럼 카드-화면과 티켓-화면이 분리돼 있지 않다). T-348 지시(#3)는 명시적으로 "**현재** 버전 탭"만 가리키므로, `VersionDetailView`는 스코프 밖으로 남겨둔다 — 다만 legacy/prdt 두 화면의 비대칭(prdt는 카드/보드 분리, legacy는 한 화면에 다 있음)은 designer 판단으로는 **의도된 것**: legacy 스키마는 이번 리팩터 대상이 아니고(§6), 새 원칙을 강제 이식할 이유가 없다.

---

## 4. 새/변경 로케일 키 (제안, 개발자 확정 필요)

```
workspace.activityBar.history          "히스토리" / "History"
workspace.history.tabTitle             "프로젝트 히스토리" / "Project History"
workspace.history.inProgressBanner     "진행 중: {{version}} — 프로젝트 탭에서 보기"
workspace.history.emptyHeadline        "아직 히스토리가 없어요"
workspace.history.emptyHelper          "첫 버전이 진행 중이에요 — 버전이 닫히면 여기 기록됩니다"
workspace.history.emptyCta             "프로젝트 탭 보기"
workspace.history.noTickets            "티켓 없이 커밋 단위로 진행된 버전입니다"
workspace.history.noRetro              "회고 없음"
workspace.history.outcomeHeading       "Outcome"
workspace.history.openBoard            "티켓 보드 열기"
workspace.history.openRetro            "회고 전체 보기"
workspace.history.gitTagLoadError      "버전 히스토리를 계산할 수 없습니다"
workspace.history.openTicketsAnomaly   "닫힌 버전에 미완료 티켓 {{count}}건 남음"
```

기존 재사용 키: `workspace.artifacts.*`(empty copy), `workspace.versionDetail.sectionPrd`/`prdNone`, `workspace.versionHistory.sidePanel.*`(행 스타일).

---

## 5. 컴포넌트 변경 지도 (impl 참고용, 구현 방식은 developer 판단)

| 파일 | 변경 |
|---|---|
| `packages/gui/src/components/workspace/LeftSidebar.tsx` | project 바디 섹션 순서 변경 + PRD 섹션 삽입 + 아티팩트 섹션 교체; `activeIcon === 'artifacts'` 분기를 `'history'`로 교체 |
| `packages/gui/src/components/workspace/ActivityBar.tsx` | 아이콘/라벨/`ActivityIcon` 타입 값 교체 |
| `packages/gui/src/components/workspace/PrdSection.tsx` | 사이드바용 압축 variant 추가(또는 `compact` prop) |
| `packages/gui/src/components/workspace/SidePanelArtifacts.tsx` | `ArtifactsPane`의 현재-버전 렌더 로직으로 대체/흡수 |
| `packages/gui/src/components/workspace/ArtifactsPane.tsx` | "version history" 토글 제거(과거 버전 분기는 `VersionNode`만 히스토리 탭으로 이식); 현재-버전 flat+archive 로직은 프로젝트 탭으로 이동 |
| `packages/gui/src/components/workspace/main/panes/TicketReviewTab.tsx` | `<PrdSection>` 제거 |
| 신규 `HistoryPane.tsx` | 사이드바 타임라인 목록 (활동바 history 탭 바디) |
| 신규 `HistoryDetailView.tsx` + `HistoryDetailTab.tsx` | 메인 페인 상세 (`VersionDetailTab.tsx` 패턴 그대로 wrapper) |
| `packages/gui/electron/ipc/*` + `preload.ts` | 신규 `git:listTags(projectDir)` (tag 이름 + 커밋 날짜) |
| `packages/gui/src/locales/{en,ko}.json` | §4 키 추가 |

---

## 6. 스코프 밖 (out of scope, 명시)

- **Legacy(비-prdt) 버전 스키마** — `SidePanelPastVersions`, `VersionsPanel`, `VersionHistoryView`(전체 보드+deploy 이벤트), `VersionDetailView`는 이번 변경의 대상이 아니다. 그쪽은 `po-state.versions[]`(손으로/PO가 유지하는 배열)가 SoT라 "파생 가능해야 한다"는 이번 제약과 아예 다른 세계다. 두 메커니즘이 당분간 공존하는 것은 §291(adapter A8) 이래의 기존 패턴과 일치한다.
- **Deploy 이벤트**(Vercel 등) — legacy `RichDeployCard`류는 히스토리 탭에 가져오지 않는다. prdt/git-tag 세계에 아직 대응 개념이 없다(추후 별도 스코프).
- **구현**(코드) — 이 문서는 스펙만. impl 티켓은 T-347 종료 후 별도로 컷.

---

## 7. 사용자 확인이 필요한 지점 (open items)

1. **히스토리 탭 아이콘 슬롯 재사용** vs 새 슬롯 추가 — 이 스펙은 "아티팩트 탭 자리"를 문자 그대로 슬롯 재사용으로 해석했다. 활동바에 이미 안 쓰이는 `versions`/`tickets` 아이콘 타입이 코드엔 있으나 렌더되지 않는 것으로 확인됨(사용 여부 별도 확인 필요) — 혼동 방지 차원에서 언급.
2. **"닫힌 버전인데 open 티켓 잔존" 강조 수준** — amber 배지로 제안했으나, 더 강하게(경고 배너) 할지는 실제 발생 빈도를 보고 조정 가능.
3. **git tag IPC 신설**이 이번 스펙의 유일한 net-new 백엔드 의존성 — impl 우선순위/난이도 확인 필요(§2.4).

---

## Mockup

Hi-fi 목업: `docs/artifacts/T-348-project-tab-history-tab-mockup.html` — 프로젝트 탭(카드+PRD+아티팩트+.ENV) / 히스토리 탭(타임라인+상세) / 빈 상태 3개 씬, 실제 WorkspaceShell 4-region 크롬 기준.
