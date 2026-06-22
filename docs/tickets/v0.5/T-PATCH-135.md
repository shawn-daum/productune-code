---
ticket_id: T-PATCH-135
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L
risk_flags:
  - cli-gui-parity
  - unbounded-walk-up-guard
  - multi-root-ancestor-ambiguity
  - non-interactive-cli-default
  - nested-repo-surprise
  - shell-and-node-and-react-three-surfaces
qa: true
qa_status: pass
slug: parent-folder-init-detection
depends_on: []
---

# T-PATCH-135 — 상위 폴더 init 재귀 탐지 (CLI + GUI, 조상 walk-up)

## Request

현재 init 탐지는 **현재 디렉터리만** 본다. 사용자가 이미 productune 프로젝트인
디렉터리의 **하위 폴더**에서 `productune` CLI 를 돌리거나, GUI 에서 그런 하위 폴더를 열면,
조상 어디엔가 `.productune` 루트가 있어도 아무도 위로 걷지 않는다. 결과: 같은 프로젝트
안에 중첩 init 이 생기거나, 사용자가 "왜 빈 프로젝트가 새로 생기지?" 하고 혼란.

**경계 있는 조상 walk-up**(home/fs 루트에서 정지)으로 가장 가까운 productune 루트를 찾고,
발견 시 사용자 반응 플로우 ["그 루트를 대신 열기" / "여기에 그대로 init" / "취소"]를 준다.
**CLI 진입과 GUI 다이얼로그 양쪽**을 커버한다.

## 코드 사실 (착수 전 재검증 — 라인은 스냅샷 기준)

- **GUI 탐지** `packages/gui/electron/ipc/project.ts`
  - `detectProductuneLayout(dir)`(79~131): **현재 dir 만** 검사. kinds:
    self-current / self-legacy / self-healable / none.
  - `scanDescendantsForProductune`(133~159): **하향(자식)만** 스캔.
  - `dialog:openFolder`(318~353), `project:openKnownDir`(357~395): self-* → 즉시 처리,
    아니면 **descendant 스캔만** 하고 끝. **상향(조상) walk-up 경로 없음.**
- **CLI 진입** `packages/core/scripts/productune` (POSIX sh/bash)
  - `init` 케이스(222~): 주석 224~226 "Always uses $PWD ... never walks up to a parent
    git toplevel" — 의도적으로 상위로 안 감(부모가 다른 프로젝트일 수 있다는 이유).
    `PROJECT_ROOT="$(cd "$PWD" && pwd -P)"`(242), git toplevel 분기(249~273) →
    `node lib/init-project.mjs --slug ...`(288~) 호출.
  - **단, "조상에 productune 루트가 있나"를 보는 로직은 없음.** git toplevel 만 본다.
- **유일한 기존 상향 탐색**: `packages/core/scripts/hooks/session-start-doctrine.sh`
  `build_migration_block`(41~) — migration 전용 특수 목적. 재사용 대신 **참고**용.
  (cwd walk-up 패턴: 118행 주석 "Tier 1 (project, cwd walk-up)".) 다른 hook 들도
  `pre-git-posture.sh`(182), `post-delegate-state-write.sh`(80) 에서 po-state.json
  walk-up 패턴 보유 — **정지조건/패턴 일관성 참고**.

## 설계 결정 (이 티켓에서 확정)

### 공통 — walk-up 알고리즘 계약 (CLI/GUI 동일하게 구현)

1. **탐색 대상:** 시작 dir 의 부모부터 위로 올라가며 각 단계에서
   `<ancestor>/.productune/config.json` (또는 self-healable 증거: `turns/`,
   `po-state.json schema_version>=1`) 존재 여부 확인. **시작 dir 자신은 제외**
   (자신은 기존 self-* 탐지가 먼저 처리).
2. **정지 조건 (bounded):** 다음 중 하나라도 만나면 정지.
   - fs 루트(`/`) 도달,
   - 사용자 home(`os.homedir()` / `$HOME`) 도달 — home 자체는 검사하되 그 위로는 안 감,
   - 최대 깊이 캡(예: 16단계) — 비정상적으로 깊은 경로 방어,
   - 권한 오류/심볼릭 루프 — 즉시 정지(throw 금지, "못 찾음" 처리).
3. **다중 루트 처리:** 위로 올라가다 **첫 번째(가장 가까운)** productune 루트에서 멈추고
   그것을 후보로 제시. 그 위에 또 다른 루트가 있어도 더 안 올라감(가장 안쪽 프로젝트가
   사용자 의도에 가장 가깝다). 단 self-healable 후보도 self-current 와 동급으로 취급
   (기존 healable 정책과 일관).
4. **결과 형:** `{ found:boolean, rootDir?, kind?, distance? }`. distance=조상 단계 수
   (UX 카피/로깅에 사용).

### CLI (`packages/core/scripts/productune` init 케이스)

5. `node lib/init-project.mjs` 호출 **직전**에 walk-up 검사 삽입. 검사 로직은 sh 에서
   직접 디렉터리를 올라가며 `[ -f "$d/.productune/config.json" ]` 확인(또는 헬퍼 추가).
6. **조상 루트 발견 시 프롬프트** (TTY 일 때, `[ -t 0 ] && [ -t 1 ]`):
   ```
   [productune] 상위 폴더에 이미 productune 프로젝트가 있습니다:
                <rootDir>  (현재 위치에서 N단계 위)
   여기서 무엇을 할까요?
     [o] 그 프로젝트를 대신 사용 (cd 안내)   ← 기본
     [i] 여기에 그대로 새 프로젝트 init
     [c] 취소
   선택 [O/i/c]:
   ```
   - `o`(기본): init 중단 + `해당 루트로 이동 후 다시 실행하세요: cd <rootDir>` 안내(자동
     cd 는 자식 셸 한계로 불가 → 명령 안내). exit 0.
   - `i`: 기존 $PWD init 흐름 그대로 진행(중첩 허용 — 사용자가 명시 선택).
   - `c`: 아무 것도 안 하고 exit 0.
7. **비대화형(non-TTY)** 일 때: **안전 기본 = init 중단 + 경고 후 비제로 종료 또는 명확한
   안내 exit.** 의도치 않은 중첩 프로젝트 자동 생성을 막는다. 단 명시 플래그
   `--here` (또는 기존 `--skip-doctrine` 옆에 신설) 가 주어지면 검사 무시하고 여기서 init.
   (CI 스크립트 escape hatch.) 플래그 명/동작은 PR 에서 init 케이스 기존 플래그 파서
   235~239 와 일관되게 확정.

### GUI (`dialog:openFolder` / `project:openKnownDir`)

8. 두 핸들러에서 **현재 흐름 순서 유지** + 한 단계 추가:
   self-* 처리(기존) → **조상 walk-up 검사(신규)** → descendant 스캔(기존) → none.
   즉 현재 dir 이 self 가 아니고, 조상에 루트가 있으면 descendant 보다 **조상을 우선**
   제시한다(가까운 부모가 자식 후보보다 사용자 의도에 가깝다). 단 조상·자식 둘 다 있으면
   조상 우선, 결과 kind 에 둘 다 실어 렌더러가 최종 결정하게 둘 수도 있음(아래 AC-5).
9. **신규 result kind `ancestor`** 반환: `{ kind:'ancestor', dir, ancestorRoot, distance,
   config }`. 렌더러 프롬프트 UX:
   - 모달/배너: "상위 폴더에 productune 프로젝트가 있습니다: <ancestorRoot>".
   - 버튼 ["그 프로젝트 열기"(기본) / "여기에 init" / "취소"].
   - "그 프로젝트 열기" → `project:openKnownDir(ancestorRoot)` 재호출(self-current 로 열림).
   - "여기에 init" → 기존 `project:installAt(dir)` 흐름.
   확인 모달 선례(`NewProjectModal`/`DeployConfirmModal`) 스캐폴드 재사용.
10. **none 폴백 보존:** 조상도 자식도 없으면 기존 `{ kind:'none' }` 그대로(install 제안 등
    현행 유지).

## Acceptance

- [AC-1] 공통 walk-up 헬퍼가 시작 dir **자신 제외**, 부모부터 위로 검사하며
  `.productune/config.json`(+ self-healable 증거) 첫 발견에서 정지하고 그 루트를 반환한다.
- [AC-2] 정지 조건이 모두 동작: fs 루트 / home 경계 / 최대 깊이 캡 / 권한·심볼릭 오류 시
  throw 없이 "못 찾음" 반환. home 위로는 절대 올라가지 않음.
- [AC-3] 다중 조상 루트가 있을 때 **가장 가까운(가장 안쪽)** 루트가 선택된다.
- [AC-4] CLI: 하위 폴더에서 `productune init` 시 조상 루트 발견되면 TTY 프롬프트 표출
  (o/i/c, 기본 o). `o`→init 중단 + cd 안내, `i`→여기 init, `c`→취소. 비-TTY 는 안전
  기본(중단 + 안내)이며 `--here`(또는 확정된 escape 플래그)로 우회 가능.
- [AC-5] GUI: `dialog:openFolder` / `project:openKnownDir` 가 self-* 아님 + 조상 루트 존재
  시 `kind:'ancestor'`(ancestorRoot/distance/config) 반환. 조상·자식 동시 존재 시 조상
  우선(또는 둘 다 실어 렌더러 결정 — PR 에서 확정하되 기본은 조상 우선).
- [AC-6] GUI 렌더러: `ancestor` 결과에 대해 ["그 프로젝트 열기"(기본)/"여기에 init"/"취소"]
  프롬프트 표출. "열기"→ancestorRoot 를 self 로 정상 오픈, "init"→여기 install, "취소"→무동작.
- [AC-7] 회귀 없음: 현재 dir 이 self-current/legacy/healable 이면 walk-up 을 타지 않고
  기존대로 즉시 처리. 조상·자식 모두 없으면 기존 `none` 흐름 보존.
- [AC-8] CLI/GUI **동등성**: 같은 디렉터리 트리에서 CLI 검사와 GUI 검사가 같은 조상 루트를
  선택한다(정지조건/선택규칙 일치). 가능하면 단일 SoT(헬퍼/상수) 공유.
- [AC-9] i18n(GUI 프롬프트) + CLI 프롬프트 한국어 카피 추가. UI-text 폰트 룰 준수.
- [AC-10] `pnpm -C packages/gui tsc --noEmit` + lint 통과. CLI 스크립트 sh 문법 검증
  (`bash -n`) 통과. 비-TTY 경로 수동/스크립트 확인.

## Plan

착수 전 현재 소스를 재독할 것.

1. **공통 walk-up SoT.** GUI 측은 `project.ts` 에 `findAncestorProductuneRoot(dir)` 추가
   (detectProductuneLayout 재사용, 부모부터 정지조건까지 루프). CLI 측은
   `packages/core/scripts/productune` 또는 `lib/` 에 동일 규칙의 sh 헬퍼/노드 헬퍼 추가.
   **정지조건 상수(최대 깊이/home 경계)를 양쪽에서 일치**시킬 것(주석으로 SoT 명시,
   가능하면 node 헬퍼 한 곳을 CLI/GUI 가 함께 호출).
2. **GUI 핸들러 배선** (`dialog:openFolder` 318~, `project:openKnownDir` 357~): self-* 처리
   직후 walk-up 검사 → `ancestor` kind 반환 분기 추가, 그 다음 descendant→none 유지.
   preload/타입에 `ancestor` 결과 형 반영.
3. **GUI 렌더러 프롬프트**: openFolder/openRecent 결과 처리부에 `ancestor` 케이스 모달 추가
   (`NewProjectModal`/`DeployConfirmModal` 스캐폴드 참고). 3버튼 핸들러 배선.
4. **CLI init 케이스**: `node lib/init-project.mjs` 호출 직전 walk-up 검사 삽입 + TTY
   프롬프트(o/i/c) + 비-TTY 안전 기본 + `--here` escape 플래그(파서 235~239 와 일관).
5. **i18n + CLI 카피**: en/ko GUI 키 + CLI 한국어 프롬프트 문자열.
6. **검증**: 트리 픽스처(루트/하위/더 깊은 하위, 다중 조상)로 CLI·GUI 동일 선택 확인.
   비-TTY 기본 + `--here` 확인. typecheck/lint/`bash -n`.

## Out of scope

- 조상·자식 동시 존재 시의 복잡한 멀티선택 UI(루트 목록에서 고르기) — 기본은 조상 우선
  단일 후보. 다중후보 picker 는 후속 후보.
- session-start-doctrine.sh `build_migration_block` 등 기존 hook 의 walk-up 로직 변경
  (참고만, 건드리지 않음).
- 자동 `cd`(셸 자식 프로세스 한계) — CLI 는 명령 안내만.
- git toplevel/nested-repo init 정책 변경(249~273) — 본 티켓은 productune 루트 탐지에
  한정, git init 분기는 그대로.
- descendant 스캔 알고리즘 자체 변경.
