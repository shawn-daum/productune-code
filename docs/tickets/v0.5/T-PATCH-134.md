---
ticket_id: T-PATCH-134
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags:
  - irreversible-fs-delete
  - two-level-destructive-action
  - trash-vs-hardrm-platform
  - confirm-affordance-distinction
  - recents-store-mutation
qa: true
qa_status: pass
slug: start-screen-project-delete
depends_on:
  - T-PATCH-114
---

# T-PATCH-134 — 시작 화면 프로젝트 카드 삭제 어피던스 (recents 제거 / 디스크 삭제 2단계)

## Request

시작 화면(`HomeView`)의 최근 프로젝트 카드(`ProjectCard`)에는 현재 **여는 길만** 있고
**치우는 길이 없다.** T-PATCH-114 로 stale 필터 + exists-dim("folder missing")까지는
들어왔지만, 사용자가 카드를 목록에서 빼거나 디스크의 프로젝트를 지울 방법이 전무하다.
누적된 50개(`RECENTS_MAX`) 카드 중 폴더가 사라진 dim 카드들이 영구히 남는다.

위험도가 다른 **두 단계 파괴 작업**을 설계·구현한다:

- (a) **recents 목록에서만 제거** — `~/.productune/recents.json` 의 해당 엔트리만 삭제.
  되돌리기 쉬운 비파괴 작업. 디스크의 프로젝트는 그대로.
- (b) **디스크의 프로젝트 폴더 삭제** — 비가역 fs 삭제. (a)와 **시각·인터랙션으로 명확히
  구분**되고 **강한 확인**을 거쳐야 한다.

폴더가 이미 사라진(`exists:false`) dim 카드는 (b)가 무의미하므로 (a)만 노출한다.

## 코드 사실 (착수 전 재검증할 것 — 라인은 스냅샷 기준)

- `packages/gui/src/views/HomeView.tsx`
  - `ProjectCard`(49~122): `missing = !entry.exists`(59). missing 시 카드 클릭 비활성
    (79), opacity 0.45(70), 푸터에 `FolderX` + `app.home.folderMissing`(107~111).
    **현재 카드에 ⋯/우클릭/액션 슬롯이 전혀 없다.**
  - `RecentWithMeta`(9~16): `{slug, projectDir, openedAt, exists, phase, version}`.
  - 카드 렌더 루프(269 부근), 데이터 로드(`listRecentsWithMeta` 우선, 130~).
- `packages/gui/electron/ipc/project.ts`
  - recents 저장소: `RECENTS_PATH = ~/.productune/recents.json`, `RECENTS_MAX = 50`(40~41).
  - `loadRecents`(43)/`saveRecents`(52)/`addToRecents`(60) 존재. **`recents:remove` 없음.**
  - `recents:list`(268) fs.existsSync 필터, `recents:listWithMeta`(282) exists/phase/version.
- `packages/gui/electron/preload.ts`: recents API 표면(100~109) — `listRecents`,
  `listRecentsWithMeta`, `addRecent`. **remove/delete 없음 → 추가 필요.**
- 확인 모달 선례: `packages/gui/src/components/workspace/DeployConfirmModal.tsx`,
  `packages/gui/src/components/NewProjectModal.tsx` (모달 스캐폴드/i18n 패턴 재사용).
  **컨텍스트 메뉴 primitive 는 없음** — 신규 경량 메뉴 또는 인라인 액션으로 설계.
- i18n: `packages/gui/src/locales/{en,ko}.json` 의 `app.home` 네임스페이스(en 997~).

## 설계 결정 (이 티켓에서 확정)

1. **어피던스 진입점 — 카드 우상단 ⋯ 메뉴(hover/focus 시 노출) + 우클릭 컨텍스트 메뉴 병행.**
   ⋯ 버튼은 키보드 접근 가능(`button`, `aria-haspopup`). 우클릭은 보조 경로.
   카드 본문 클릭(열기)와 충돌하지 않도록 ⋯ 버튼 `onClick` 은 `stopPropagation`.
   컨텍스트 메뉴 primitive 가 없으므로 **경량 popover 메뉴 컴포넌트**(`shared/` 하위)를
   신규 추가하되, 별도 라이브러리 도입 금지(기존 모달/포털 패턴 답습).

2. **메뉴 항목 (exists 분기):**
   - `exists:true` 카드 → ["프로젝트 열기", "목록에서 제거"(a), 구분선, "디스크에서 삭제"(b, 위험색)].
   - `exists:false`(folder missing) 카드 → ["목록에서 제거"(a)] 만. "열기"/"삭제"는
     숨김(둘 다 무의미). dim 카드의 유일한 정리 경로가 (a)임을 보장.

3. **(a) 목록에서 제거 — 확인 없이 즉시(undo 토스트 권장, 옵션).**
   비파괴이므로 강한 확인 불필요. `recents:remove` IPC 한 번 → 목록 리렌더. (선택 구현:
   5초 undo 스냅바. 미구현 시 즉시 제거로 충분.)

4. **(b) 디스크에서 삭제 — 전용 강한 확인 모달.** (a)와 인터랙션·카피·색을 분리.
   - 모달 카피에 **삭제 대상 절대경로 + slug** 를 명시하고, **"이 작업은 되돌릴 수 없습니다"**
     를 분명히 표기.
   - **휴지통 vs 하드 삭제 결정: 휴지통(`shell.trashItem`)을 기본 1차 시도, 실패 시
     하드 삭제로 폴백.** electron `shell.trashItem(fullPath)` 사용 — OS 휴지통으로 보내
     비가역성을 완화(사용자 회수 가능). 휴지통 불가 환경(네트워크 볼륨/권한 등)에서
     `rejected` 시에만 `fs.rm(dir, { recursive:true, force:true })` 폴백 + 모달 카피에
     "휴지통 사용 불가 → 영구 삭제됩니다" 경고로 한 단계 더 강조.
   - 삭제 성공 시 **(b)는 (a)를 포함** — 디스크 삭제 후 recents 엔트리도 함께 제거.
   - **타이핑 확인은 과함**으로 판단(개인 로컬 도구, 휴지통 폴백 존재) → 명시적
     "삭제" 버튼 클릭으로 충분. 단 기본 포커스는 취소 버튼.

5. **dir-already-missing 케이스:** (b) 진입 자체를 막음(메뉴에서 숨김). 만약 race 로
   삭제 시점에 폴더가 이미 없으면 `recents:remove` 만 수행하고 성공 처리(에러 토스트 금지).

6. **경계/보안:** 삭제 대상은 recents 엔트리의 `projectDir` 절대경로로 한정. main
   프로세스 핸들러에서 `projectDir` 가 존재하고 그 안에 `.productune/` 가 있을 때만
   디스크 삭제 허용(임의 경로 삭제 RPC 방지). home/fs 루트 등 명백히 위험한 경로는 거부.

## Acceptance

- [AC-1] `recents:remove` IPC 신설(`project.ts`) — 입력 `{ projectDir }`, recents.json 의
  해당 `projectDir` 엔트리만 제거 후 갱신된 목록 반환. 디스크는 건드리지 않음. 존재하지
  않는 엔트리는 no-op 성공. preload(`removeRecent`)·타입 표면 노출.
- [AC-2] `project:delete`(또는 동등) IPC 신설 — 입력 `{ projectDir }`. (i) `projectDir`
  가 absolute 이고 그 하위에 `.productune/` 가 존재할 때만 진행, 아니면 `{ ok:false, error }`.
  (ii) `shell.trashItem` 1차 시도, 실패 시 `fs.rm(recursive,force)` 폴백, 폴백 사용 여부를
  결과(`{ ok, trashed:boolean }`)로 반환. (iii) 성공 시 recents 엔트리도 함께 제거.
  (iv) 폴더가 이미 없으면 recents 제거만 하고 `{ ok:true, trashed:false, alreadyGone:true }`.
- [AC-3] `ProjectCard` 에 ⋯ 메뉴 어피던스 추가 — hover/focus 시 노출, 키보드 접근 가능,
  `aria-haspopup`, ⋯ 클릭이 카드 열기로 버블되지 않음. 우클릭 컨텍스트 메뉴도 동일 항목 노출.
- [AC-4] 메뉴 항목이 exists 로 분기 — `exists:true`: 열기/목록에서 제거/디스크에서 삭제;
  `exists:false`: 목록에서 제거만. 디스크 삭제 항목은 위험색(빨강 계열)로 시각 구분.
- [AC-5] "목록에서 제거"(a) → 확인 없이 `recents:remove` 호출 후 카드 즉시 사라짐.
- [AC-6] "디스크에서 삭제"(b) → 전용 확인 모달 표출: 절대경로 + slug + "되돌릴 수 없습니다"
  카피, 기본 포커스 취소 버튼, 삭제 버튼 위험색. 휴지통 폴백이 하드 삭제로 떨어질 환경에선
  "영구 삭제" 경고 카피로 전환(또는 결과에 따라 사후 토스트). 확인 시 `project:delete` 호출
  → 성공 시 카드 + recents 동시 제거.
- [AC-7] dim(folder missing) 카드에서 (a)만 수행 가능하고 정상적으로 목록에서 사라짐.
  (b) 진입 경로가 노출되지 않음.
- [AC-8] i18n — 신규 카피(메뉴 항목, 삭제 모달 제목/본문/버튼, 경고)를 `app.home`(또는
  `app.home.delete`) 아래 en/ko 양쪽에 추가. UI-text 폰트 룰(Pretendard) 준수.
- [AC-9] `pnpm -C packages/gui tsc --noEmit` + lint 통과, 신규 에러 없음.

## Plan

착수 전 현재 소스를 재독할 것.

1. **main IPC** (`packages/gui/electron/ipc/project.ts`): `recents:remove` 핸들러 추가
   (loadRecents → filter(projectDir) → saveRecents → 반환). `project:delete` 핸들러 추가
   — 경계검사(absolute + `.productune/` 존재 + 위험경로 거부) → `shell.trashItem` →
   실패 시 `fs.rm` 폴백 → recents 동기 제거. `shell` 은 이미 import 됨(1행).
2. **preload** (`packages/gui/electron/preload.ts`): `removeRecent({projectDir})`,
   `deleteProject({projectDir})` 노출 + 반환 타입.
3. **경량 메뉴 컴포넌트** (`packages/gui/src/components/shared/`): hover/우클릭 popover.
   포털/배경클릭 닫기/esc 닫기/키보드 네비. 라이브러리 도입 금지.
4. **삭제 확인 모달** (`packages/gui/src/components/`): `DeployConfirmModal` 스캐폴드를
   참고해 신규 `ProjectDeleteConfirmModal` 작성(경로/slug/위험 카피, 취소 기본 포커스).
5. **`ProjectCard`/`HomeView` 배선**: 메뉴 어피던스 + exists 분기 + (a)/(b) 핸들러 +
   삭제/제거 후 목록 상태 갱신(낙관적 업데이트 또는 재조회).
6. **i18n**: en/ko `app.home(.delete)` 키 추가.
7. **검증**: 4 케이스 수동 동등 확인 — exists 카드 (a), exists 카드 (b)→휴지통,
   휴지통 불가→하드 폴백, dim 카드 (a). typecheck + lint.

## Out of scope

- 휴지통/삭제 외 일괄 정리(전체 dim 카드 한 번에 비우기) — 후속 티켓 후보.
- 프로젝트 rename/이동/아카이브.
- recents.json 외 다른 저장소(macOS Dock recent document) 동기 제거 — best-effort 범위 외.
- 타이핑("프로젝트명 입력") 강제 확인 — 본 설계에서 과함으로 제외.
- 삭제 undo(휴지통 회수 안내 토스트는 옵션, 앱 내 복원 미구현).
