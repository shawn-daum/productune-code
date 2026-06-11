---
ticket_id: T-PATCH-114
version: v0.5
round: patch
type: feature
status: done
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pending
qa_loops: 0
slug: home-project-card-grid
area_tags: [gui/home, gui/electron-ipc, gui/i18n]
created_at: 2026-06-11T00:00:00Z
---

# T-PATCH-114: HomeView 런처 — 최근 프로젝트를 카드 그리드(CapCut 스타일)로 교체

## §1. Request

shawn (ad-hoc, design-led): GUI 첫 시작 화면(`HomeView` 런처)의 최근 프로젝트 영역이 현재 좁은 단순 리스트(slug + 상대시간 한 줄)다. 이를 영상편집기 런처(CapCut 스타일)처럼 **프로젝트 카드 그리드**로 교체한다.

- 사용자가 열어본 **모든** productune-init 프로젝트를 카드로 노출(잘린 strip 금지).
- 각 카드 최소 표기: **프로젝트명(slug) / 현재 버전 / 현재 phase / 마지막 열람 상대시간**.

### 현황 (조사 결과 — 검증 완료)

- Recents 저장소: `~/.productune/recents.json` — `packages/gui/electron/ipc/project.ts` 의 `recents:list` / `recents:add`. 엔트리 `{slug, projectDir, openedAt}`, `RECENTS_MAX = 10` (L28). `recents:list` 는 `fs.existsSync(projectDir)` 로 **사라진 폴더를 필터링해서 버린다** — 카드의 "폴더 없음" 상태 표현 불가.
- 카드 메타데이터 소스(프로젝트 디스크):
  - `.productune/po-state.json` → `current_phase` (number, 예: 3), `current_version` (예: `"v0.5"`).
  - `.productune/config.json` → `slug`, `created_at`. (`config.version` 은 툴 스키마 버전 — 카드 버전으로 쓰지 않음.)
- 기존 IPC: `state:readPoState(projectDir)` (`electron/ipc/state.ts` L28, try/catch → null), `project:exists`. 단 renderer 에서 recents 엔트리마다 `readPoState` 를 N 회 호출하는 것은 IPC 왕복 낭비 → **main process 배치 IPC 신설**이 맞다.
- `HomeView`: `packages/gui/src/views/HomeView.tsx`. 전체 중앙 정렬(`wrap`: flex column center), recents 는 `width: 340` 세로 리스트(`recentCard`). React 18 + inline `CSSProperties`, lucide-react 아이콘(컬러 emoji 금지), 다크 `#0F0F0F`, i18next(en/ko — `app.home.*`). 기존 fallback 체인: `api.listRecents` 부재 시 `listProjects` 폴백.
- preload: `listRecents()` 노출됨(`electron/preload.ts` L101) — 신규 메서드 같은 패턴으로 추가.

## §2. Acceptance

- [ ] **AC-1 (배치 IPC `recents:listWithMeta`)**: main process 에서 recents 전 엔트리를 순회하며 엔트리당 `config.json`/`po-state.json` 을 동기 read(try/catch). 반환 shape: `{ slug, projectDir, openedAt, exists: boolean, phase: number | null, version: string | null }[]`. 읽기 실패/파일 부재 시 해당 필드 `null` (throw 금지). **사라진 폴더 엔트리도 `exists: false` 로 반환** (`recents:list` 와 달리 필터링하지 않음). `slug` 는 `config.json.slug` 우선, 실패 시 recents 엔트리의 slug. preload 에 `listRecentsWithMeta()` 노출.
- [ ] **AC-2 (RECENTS_MAX 상향)**: `RECENTS_MAX` 10 → **50**. 기존 `recents.json` 과 하위호환(추가 필드 없음, cap 만 변경).
- [ ] **AC-3 (카드 그리드 레이아웃)**: §4.B 스펙대로 — recents 가 1개 이상이면 HomeView 가 상단정렬 레이아웃(헤더 + 액션 행 + 스크롤 그리드)으로 전환. 그리드는 `repeat(auto-fill, minmax(200px, 1fr))`, 모든 엔트리 렌더(slice 금지), 그리드 영역만 세로 스크롤.
- [ ] **AC-4 (카드 해부도)**: §4.C 스펙대로 — placeholder 썸네일(lucide `FolderCode`) / slug(ellipsis) / 버전 칩 / phase 배지 / 상대시간. `phase`/`version` 이 `null` 이면 해당 칩·배지 숨김(placeholder 텍스트 금지). lucide-react 만 사용, 컬러 emoji 금지.
- [ ] **AC-5 (폴더 없음 상태)**: `exists: false` 카드는 dimmed(opacity 0.45) + 클릭 무동작 + footer 에 lucide `FolderX` + `folderMissing` 라벨. (선택 — §3) hover 시 우상단 X 제거 버튼.
- [ ] **AC-6 (i18n parity)**: §4.D 신규 키 en/ko 동시 추가. 기존 `app.home.relTime*` 재사용. ko/en 어느 쪽에서도 키 누락 없음.
- [ ] **AC-7 (빈 상태 + 폴백 + 회귀 없음)**: recents 0개면 기존 중앙 hero(`noRecent`) 유지. `api.listRecentsWithMeta` 부재(구 preload) 시 기존 `listRecents` → 메타 없는 카드(slug+시간만)로 graceful 폴백. `onNewProject`/`onOpenFolder`/`onOpenRecent` 시그니처·호출 무변경. `tsc --noEmit -p tsconfig.json` **0 errors**.

## §3. Out of scope / Optional

**Optional (구현 여유 시 — fail 사유 아님):**
- `recents:remove` IPC + 카드 hover X 버튼(목록에서 제거). 미구현 시 후속 티켓.

**Out of scope:**
- 실제 프로젝트 썸네일(스크린샷/렌더 캡처) — placeholder 아이콘 영역만. 후속에서 교체 가능한 구조로.
- 카드 정렬/필터/검색 UI.
- `projects:list`(legacy) IPC 의 카드화 — 폴백 경로로만 유지.
- FreshComposer / OnboardingWizard 등 다른 첫-실행 surface.
- recents.json 스키마 변경(메타 캐싱 등) — 메타는 매 호출 시 디스크에서 fresh read.

## §4. Implementation plan (design spec)

### A. Main process — `packages/gui/electron/ipc/project.ts`

1. `RECENTS_MAX = 50` 으로 변경.
2. 신규 핸들러:
   ```ts
   ipcMain.handle('recents:listWithMeta', () => {
     return loadRecents().map((e) => {
       let exists = false, phase: number | null = null, version: string | null = null, slug = e.slug
       try {
         exists = fs.existsSync(path.join(e.projectDir, '.productune', 'config.json'))
         if (exists) {
           try { slug = JSON.parse(fs.readFileSync(..config.json..)).slug ?? e.slug } catch {}
           try {
             const st = JSON.parse(fs.readFileSync(..po-state.json..))
             phase = typeof st.current_phase === 'number' ? st.current_phase : null
             version = typeof st.current_version === 'string' ? st.current_version : null
           } catch { /* phase/version stay null */ }
         }
       } catch { /* exists stays false */ }
       return { slug, projectDir: e.projectDir, openedAt: e.openedAt, exists, phase, version }
     })
   })
   ```
   - 정렬은 recents.json 순서(= openedAt desc, `addToRecents` 가 top-insert) 그대로 유지.
   - 기존 `recents:list` 핸들러는 무변경(다른 호출처 호환).
3. `electron/preload.ts` — `listRecentsWithMeta(): Promise<RecentWithMeta[]>` 를 `listRecents` 와 같은 블록에 추가.

### B. HomeView 레이아웃 (CapCut 런처 구조)

`packages/gui/src/views/HomeView.tsx` 전면 개편. **두 모드:**

- **빈 상태(recents 0)**: 기존 그대로 — 중앙 hero(로고 52 / title / tagline / 세로 버튼 240 / `noRecent`). 무변경.
- **프로젝트 있음**: 상단정렬 런처 레이아웃.

```
┌─ wrap (#0F0F0F, flex column, alignItems center, overflow hidden) ─────────┐
│  ── header (paddingTop 48, 중앙) ──────────────────────────────           │
│     [logo img h40]  productune(20px/700)   ← 로고+워드마크 가로 한 줄,     │
│                                              tagline(11px #505050) 아래    │
│  ── actions (marginTop 20, flex row, gap 8) ──────────────────             │
│     [+ 새 프로젝트 만들기(btnPrimary)] [□ 기존 폴더 열기(btnSecondary)]    │
│  ── section (marginTop 36, width 100%, maxWidth 960, padding 0 32,        │
│              flex 1, minHeight 0, flex column) ───────────────             │
│     프로젝트 (11px uppercase #505050 letterSpacing .08em, mb 12)           │
│     ┌─ grid (overflowY auto, flex 1, paddingBottom 40) ────────┐          │
│     │  display grid; gridTemplateColumns:                       │          │
│     │    repeat(auto-fill, minmax(200px, 1fr)); gap 12          │          │
│     │  [card] [card] [card] [card]                              │          │
│     │  [card] [card] ...  (모든 엔트리, slice 없음)             │          │
│     └──────────────────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────────────────┘
```

- 헤더/액션은 고정, **그리드 영역만 스크롤**(`flex: 1, minHeight: 0, overflowY: 'auto'`). 50개여도 레이아웃 불변.
- 기존 `btnPrimary`/`btnSecondary` 토큰 재사용(가로 배치로 전환, width 240 고정 해제 → `padding 10px 16px` 그대로).
- 반응형: auto-fill minmax 로 창폭 ~640px=2열, ~860px=3열, 960 컨테이너 풀폭=4열.

### C. 카드 해부도 (design spec)

```
┌─ card (#1A1A1A, border 1px #222, radius 8, overflow hidden,
│        cursor pointer, transition border-color/transform .15s) ──┐
│ ┌─ thumb (height 92, background #161616,                          │
│ │         flex center) ──────────────────────────────────────────│
│ │              <FolderCode size 28 color #3A3A3A>                 │
│ └──────────────────────────────────────────────────────────────── │
│  body (padding 10px 12px 12px)                                    │
│    slug        13px / 600 / #F0F0F0 / ellipsis nowrap             │
│    meta row    (marginTop 6, flex, gap 6, alignItems center)      │
│      [v0.5]    버전 칩: 10px #B8B8B8, bg #242424,                 │
│                border 1px #333, radius 4, padding 1px 6px         │
│      [Phase 3] phase 배지: 10px #A78BFA,                          │
│                bg rgba(139,92,246,0.12), radius 4, padding 1px 6px│
│    footer      (marginTop 8, 11px #505050)                        │
│      <Clock size 11> 3시간 전     ← relativeDate() 재사용          │
└───────────────────────────────────────────────────────────────────┘
```

- **hover**: `onMouseEnter/Leave` state 로 `borderColor: '#8B5CF6'` (또는 `rgba(139,92,246,0.5)`) + `transform: 'translateY(-1px)'`. inline-style 프로젝트 관행 유지(CSS 파일 추가 금지).
- **클릭**: 카드 전체 클릭 → `onOpenRecent(projectDir, slug)` (기존 시그니처).
- **null 처리**: `version === null` → 버전 칩 미렌더; `phase === null` → 배지 미렌더. meta row 둘 다 없으면 row 자체 미렌더(빈 줄 방지).
- **폴더 없음(`exists: false`)**: 카드 `opacity 0.45`, `cursor: 'default'`, onClick 무동작. footer 를 `<FolderX size 11 color #806060> folderMissing` 으로 교체. hover 강조 없음. (선택) hover 시 우상단 `<X size 12>` 제거 버튼 → `recents:remove`.
- 아이콘은 전부 lucide-react: `FolderCode`(썸네일) / `Clock`(시간) / `FolderX`(없음) / (선택) `X`. 컬러 emoji 금지.

### D. i18n — `src/locales/en.json` / `ko.json` (`app.home.*`)

| key | en | ko |
|:--|:--|:--|
| `projects` | `Projects` | `프로젝트` |
| `phaseBadge` | `Phase {{n}}` | `Phase {{n}}` |
| `folderMissing` | `Folder missing` | `폴더 없음` |
| `removeFromList` (선택) | `Remove from list` | `목록에서 제거` |

- 기존 `recent` 키는 유지(다른 참조 가능성) — HomeView 섹션 라벨만 `projects` 로 교체.
- `relTime*` / `newProject` / `openExisting` / `noRecent` 재사용.

### E. 검증 순서

1. `tsc --noEmit` 0 errors → `pnpm --filter @productune/gui build` green.
2. dev 실행 → 런처에서 recents 전체가 카드 그리드로 렌더, 각 카드에 slug/버전 칩/Phase 배지/상대시간 확인(`~/.productune/recents.json` 현재 3개 엔트리로 실측 가능).
3. recents.json 에 가짜 경로 엔트리 수동 추가 → dimmed `폴더 없음` 카드 확인, 클릭 무동작.
4. po-state.json 없는 프로젝트(또는 임시 rename) → 칩/배지 숨김, 카드 자체는 정상.
5. 창 리사이즈 → 열 수 2~4 변동, 그리드만 스크롤.
6. ko/en 토글 → 신규 라벨 parity.

## §5. QA — smoke

| Area | Check |
|:--|:--|
| build | `tsc --noEmit` 0 errors; `pnpm --filter @productune/gui build` green |
| IPC | `recents:listWithMeta` 가 {slug, projectDir, openedAt, exists, phase, version} 반환; po-state/config 부재 시 null 필드 + throw 없음 (AC-1) |
| cap | RECENTS_MAX 50; 11개 이상 열어도 잘리지 않음 (AC-2) |
| grid | 런처에 카드 그리드 렌더, auto-fill 반응형(2~4열), 전 엔트리 표시, 그리드 영역만 스크롤 (AC-3) |
| card | slug/버전 칩(v0.5)/Phase 배지/상대시간/lucide 썸네일 placeholder; null 메타 시 칩·배지 숨김 (AC-4) |
| stale | 존재하지 않는 projectDir 엔트리 → dimmed + FolderX `폴더 없음` + 클릭 무동작 (AC-5) |
| i18n | en/ko 신규 키 parity, ko 토글 시 라벨 정상 (AC-6) |
| empty | recents 0개 → 기존 중앙 hero + `noRecent` 유지 (AC-7) |
| regression | 카드 클릭 → 프로젝트 정상 오픈(onOpenRecent); 새 프로젝트/폴더 열기 버튼 동작 불변; `recents:list` 기존 호출처 무영향 (AC-7) |
