# Releases

Version-by-version release notes for this project.

> Format
> - One `## <version>` line per shipped version, newest first. `<version>` is the exact
>   git tag (`v1.4`), the first token after `## `. The updater and the viewer split
>   sections on this line, so keep it verbatim. It is the only `#` line in a section.
> - Optional ` — <title> (YYYY-MM-DD)` after the version token.
> - Body: plain group labels `추가` · `변경` · `수정` · `알려진 한계`, each followed by one
>   blank line and `- ` items. Omit an empty group. `알려진 한계` only for a security limit.
> - One line per item: what changed, as the user sees it. No `###`, no bold, no backticks,
>   no reasons, no ticket ids, no commands for the reader to type.
> - When: written at release time, in the same change that cuts the `v*` tag.
> - Everything above the first `## ` line is preamble and is ignored by the parser.

## v1.12.1 — 상태줄 복원 (2026-10-04)

수정

- 상태줄에 버전과 | 구분자가 돌아왔어요
- running · dec · req 가 비어도 — 로 보여요
- branch 가 맨 뒤로 갔어요
- 담당자 화살표가 → 로 나와요

## v1.12 — 뷰어 화면 재작업 · 대기 목록 · 쓰기 보안 (2026-10-02)

추가

- 뷰어 홈 「현재 버전」: 단계 막대 · 지금 여기 · 티켓 선후 그래프 · 대기 목록
- PRD 읽기 화면: 목차 · 접기 · 「결정할 것」 상자 · 항목 카드
- 기능 화면: 영역별 묶음 · 기능마다 한 줄 정의 · 함께 쓰는 기능 링크
- 뷰어에서 용어 사전과 릴리즈 노트를 읽어요
- 지난 버전 폴더의 열린 티켓도 뷰어에 보여요
- 규율 문서 이름을 누르면 뷰어에서 바로 열려요
- 뷰어 탭이 저절로 새로고침되고, 탭 제목에 프로젝트와 항목이 나와요
- 상태줄과 [prdt state] 줄에 기다리는 결정(dec)과 사용자 작업(req)이 따로 보여요
- prdt dispatch caps 로 발주 한도를 보고 prdt settings set dispatch.* 로 바꿔요

변경

- 발주 대기 안내가 한 줄로 짧아졌어요
- prdt schedule report 가 발주 종류를 다시 계산해 기록과 맞춰요
- 뷰어 홈 왼쪽 패널 순서: 진행 상황 · 아티팩트 · PRD · 티켓 · 결정
- 상태줄의 작업 순서(CP)와 홈의 진행 표가 빠졌어요. 작업 순서는 뷰어 홈에서 봐요
- 메타 백업 원격은 https · http · ssh · git 주소만 받아요. 로컬 경로는 거부돼요
- .prdt/meta.git 에 허용 목록 밖 설정이 있으면 git 을 돌리기 전에 거부해요

수정

- 클론에 딸려 온 메타 저장소 설정으로 명령이 실행되던 문제
- 뷰어가 프로젝트 밖 파일을 읽을 수 있던 문제
- 워커가 트랙 기록을 쓸 수 있던 문제
- 브랜치와 같은 이름의 태그가 트랙 커밋을 가리던 문제
- 업데이트한 기기에서 viewer.html 이 없고 티켓 링크가 안 걸리던 문제
- 범위 표기 v0.1~v0.4 가 취소선으로 깨져 보이던 문제

알려진 한계

- 워커 쓰기 방어는 흔한 형태만 막아요. 변수 경로 · 스크립트 파일 · 모르는 편집 도구는 못 막아요
- Windows 경로 C:/x 는 ssh 주소로 읽혀 허용돼요
## v1.11.1 — 결정 티켓 · 링크 쓰기 방어 · 고스트 입력 (2026-09-30)

> 패치 릴리스입니다. T-810 · T-813 · T-814 · T-818 · T-825 · T-826 · T-830 · T-833 · T-835 · T-838 · T-842 · T-843 · T-847 · T-850 을 반영합니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **문서를 쓰는 prdt 명령이 뷰어를 스스로 다시 만듭니다.** `tickets new` · `fmt` · `wiki reindex` · `schedule report` · `artifacts sync` 등이 `docs/` 를 바꾸면 명령이 끝난 뒤 `viewer.html` 이 갱신되고, 창은 열리지 않습니다. 생성이 실패하면 60초 안에는 다시 시도하지 않습니다. `viewer.html` 이 이미 있을 때만 동작합니다. (T-838)

### Changed
- **결정 티켓의 `options` 표가 한 행 = 선택지 하나입니다.** `prdt tickets new --type decision` 이 `| 선택지 | pros | cons | trade-off | recommend |` 머리글로 시작합니다. 옛 방향으로 닫힌 티켓도 `fmt --check` 를 그대로 통과합니다. (T-825)
- **결정 티켓 계약이 바뀌었습니다.** 문구를 제안하는 선택지는 초안과 번역을 함께 적고, `problem` 은 쉬운 한 줄 · 실제 관측 · As-is / To-be 그림 · 갈리는 곳을 담으며, `options` 에 To-be 를 잇는 열이 하나 붙습니다. (T-826)
- **`prdt track land` 가 실수를 더 막습니다.** `--test` 명령을 `pipefail` 로 돌려 파이프 앞 명령이 실패해도 land 가 실패합니다(`dev` 는 그대로). 종료 코드 141 이면 `| head` 가 파이프를 닫아 결과를 알 수 없다는 설명이 실패 메시지에 붙습니다. `prdt track open --base main` 으로 연 트랙은 `--base` 없는 `land` 를 거부하고, `--base main` 과 `--base dev` 를 모두 안내합니다. (T-813 · T-835 · T-833)
- **워커(developer · qa · designer)는 `Agent` 로 하위 에이전트를 만들 수 없습니다.** `subagent_type` 이 무엇이든 한 줄로 거부하며 PO 는 그대로 통과합니다. (T-818)
- **QA 발주가 메타 문서만 바꿀 때는 점유로 세지도 거부하지도 않습니다.** `change_meta.files` 가 전부 메타 allowlist 아래이고 코드 경로가 아닐 때만입니다. (T-814)
- 규율 문구 조정: retro 5단계 · 8단계, patch-cycle 의 `land` 줄, PO habit 한 줄(뷰어 재생성), `contracts/tickets.md`. 기기 미러(`~/.prdt/discipline`)는 재설치 뒤 `prdt doctor` 로 드리프트 경고가 없는지 확인하세요. (T-820 · T-816 · T-851 · T-839 · T-826)

### Fixed
- **다른 저장소가 커밋한 심볼릭 링크를 따라 prdt 가 내 파일을 덮어쓰던 문제.** 뷰어 재생성 작업자 · `prdt viewer` · 전달 페이지 · 상태줄 조각 · 뷰어 생성기의 `.prdt/scratch/` 임시 파일과, 메타 exclude 파일(`.prdt/meta.git/info/exclude`)이 링크 · 하드 링크를 따라가지 않습니다. 링크가 끼어 있으면 아무것도 쓰지 않고 조용히 끝나며 명령은 실패하지 않습니다. `.prdt` 자체가 링크이면 `prdt viewer` 안내가 지우라고 하지 않고 "링크를 따라가지 않는다" 고 알려 줍니다. (T-842 · T-847 · T-850)
- **`prdt` 를 시작할 때 포커스 · 마우스 이동 글자(고스트 입력)가 새 Claude Code 입력창에 섞이던 문제.** 모드를 끈 뒤 읽지 않은 입력을 버립니다. (T-843)
- **`prdt doctor` 가 README 실행 블록의 `#` 주석 뒤를 경로로 읽어 낡았다고 경고하던 문제.** (T-810)
- **뷰어의 티켓 상세 패널과 카드에서 코드 블록의 긴 줄이 잘리던 문제.** 이제 줄바꿈되고 복사한 글자는 원본과 같습니다. (T-830)

### Known limits
- `.prdt` 나 `docs/` 가 프로젝트 밖을 가리키는 심볼릭 링크인 프로젝트는 뷰어 자동 재생성이 걸리지 않습니다. `prdt` 를 실행한 뒤 약 190 ms 안에 미리 친 글자는 버려집니다(시작도 약 85 ms 늦어집니다). 실행 중인 세션에서 마우스 이동 보고가 계속 들어오는 현상은 재현하지 못해 아직 고치지 않았습니다.
- 링크 방어는 이번에 다룬 쓰기 통로(뷰어 관련 파일과 메타 exclude 자동 저장)에만 적용됩니다. `.prdt` 아래의 다른 쓰기 통로(예: `prdt init`)는 아직 링크를 따라갈 수 있어, 믿지 않는 저장소에서는 `prdt init` 을 돌리지 마세요. 나머지는 v1.12 에서 이어 갑니다.

## v1.11 — critical path 기반 병렬 작업 배치 (2026-09-29)

> 적용: `prdt update` (이제 설치 전에 버전과 이 노트를 보여 주고 `1. update` / `2. skip` 을 묻습니다) 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **`prdt schedule`** — 티켓 `deps` 로 프로젝트별 critical path 를 계산해 다음에 보낼 작업 순서를 보여 줍니다(`--json`). 상태줄 끝에 critical path 맨 앞(`CP T-…`)이 보입니다.
- **발주 기록** — 발주마다 `.prdt/schedule.jsonl` 에 한 줄(그때의 critical path · 따랐는가 · 이유 · 걸린 시간). critical path 맨 앞이 아닌 작업을 이유 없이 보내면 경고만 합니다(막지 않음). `prdt schedule report` 가 버전 관측 문서를 만듭니다.
- **`prdt track open | review | land | drop`** — 트랙마다 `tracks/<T-NNN>` worktree 를 만들고, PO 가 로컬에서 검토한 뒤 합친 트리에서 테스트해 `dev` 로 합칩니다. push 없음. `main` 은 `land --base main` 을 직접 줄 때만.
- **`prdt settings`** — 기기 설정(말투 `register.*` · 자동 열기 `viewer.auto-open` · 요금제 `plan.tier` · CLI 언어 `cli.lang`)을 한 명령으로 보고 바꿉니다. `prdt register set` 은 그대로 동작합니다. CLI 문구는 한국어 · 영어 메시지 목록에서 읽습니다.
- **뷰어로 건네기** — `prdt tickets --link` · `prdt viewer <경로|id>` 와 PO 가 쓴 문서의 자동 열기가 파일 대신 최신 뷰어를 그 항목이 선택된 채로 엽니다. 없는 번호는 홈에 안내가 뜹니다.

### Changed
- 같은 checkout 에 Developer · QA 발주가 이미 돌고 있으면 두 번째는 거부합니다. worktree 로 보낸 워커는 공유 checkout(`code/`)에 쓸 수 없습니다.
- 기기 자원 한도에 모델 등급별 동시 발주 수가 추가됐습니다(기본값 = 전체 한도).
- 핫 주입 규율을 부속 문서로 나눠 `contracts.md` 가 20.8 KB → 15.3 KB, 역할별 주입이 19~21% 줄었습니다. 크기 상한도 같이 낮췄습니다.
- 답 형식(register `form=outline`): 굵은 제목 → `-` 항목 → 들여쓴 `·` 설명, 번호는 고를 선택지 · 순서 있는 단계에만.
- 뷰어: 이번 버전 티켓 · PRD · 산출물 · 결정 문서 링크는 홈에서 열립니다(홈에 "결정" 묶음 신설). 지난 버전은 전처럼 탭에서. 진행 상황 표의 행 이름은 PRD 의 `#### 키 — 이름` 에서 읽습니다.
- 자동 열기는 PO(메인 세션)가 건넨 것만 엽니다 — 워커가 `prdt viewer` · `prdt tickets --link` 를 돌려도 창이 뜨지 않습니다.
- 상태줄 · 뷰어 홈 진행률이 티켓 종류로 단계를 추정하지 않고 버전 전체 done/total 을 보여 줍니다.
- Define 진입 때 세션 모델 권고를 하지 않습니다. 배너에 왼쪽 색 띠를 쓰지 않고, 이 띠를 AI 티로 잡습니다.

### Fixed
- `prdt update` 가 선택 메뉴의 기본값 때문에 Enter 한 번에 설치되던 문제. 이제 `1` 을 입력해야만 설치하고, 노트를 보여 준 그 커밋에만 착지합니다.
- 새 worktree 에서 core 가 빌드되지 않아 전체 테스트가 실패하던 문제(설치 때 core 빌드).
- 발주 표식이 동시 발주에서 서로 바뀌던 문제 — 거부에는 짝이 확인된 표식만 씁니다.
- 상태줄의 티켓 번호가 티켓 md 파일을 직접 열던 문제 — 이제 PO 링크와 같은 뷰어 페이지로 엽니다.
- 뷰어에서 항목을 열면 라이트/다크 토글이 가려지던 문제 — 토글을 왼쪽 탭 줄 맨 아래로 옮겼습니다.

## v1.10.4 — 답의 단계가 기호로 보임 (2026-09-28)

> 패치 릴리스입니다. T-754 를 반영합니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Changed
- **register `form=outline` 의 답이 단계마다 다른 기호를 씁니다.** 굵은 제목 → `1.` `2.` `3.` 번호(묶음마다 1 부터) → 3칸 들여쓴 `·` 설명, 번호 묶음 사이에 빈 줄 한 줄. 모든 항목이 한 단계 `-` 목록으로 나와 계층이 안 보이던 문제를 고칩니다. "목록이 6줄을 넘을 때만 제목" 규칙은 없어졌습니다.

## v1.10.3 — 기본 fable 경로를 임시로 opus 로 (2026-09-28)

> 패치 릴리스입니다. T-739 를 반영합니다. v1.11 의 라우팅 설정화(T-737) 전까지 쓰는 임시 수정입니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Changed
- **fable 을 기본으로 쓰던 7곳이 opus 로 바뀌었습니다(effort 는 그대로).** playbook 최소 모델 5개 — designer `inject-edit` · `prd-clarity` · `scope-challenge`, developer `plan-first` (opus/high), QA `grill` 첫 회 (opus/medium) — 와 출하 전 전체 코드 리뷰(opus/medium), Define 진입 시 세션 모델 권고(모든 단계 opus). 근거: opus 5.5 가 설계 검토 1건에서 fable 5.1 보다 나았고(9.0 대 8.5 / 17, 치명 결함 4/4 대 3/4), 호출 비용은 약 1/4 입니다(사용자 제공 벤치마크 — 과제 1건, 참고 수준). 워커의 fable 격상 요청(`escalate_to`)은 그대로 fable 로 갑니다. 바뀐 곳마다 `T-737` 표시가 있습니다.

### Fixed
- README 설치 줄이 gitignore 대상 빌드 경로를 실행 블록에 적어 `prdt doctor` 가 README 를 태그 기준으로 낡았다고 경고하던 문제.

## v1.10.2 — core 수정이 설치만으로 node bridge 에 실림 (2026-09-28)

> 패치 릴리스입니다. T-731 · T-732 · T-734 를 반영합니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행 — 이번부터 이 한 번으로 node bridge 도 새로 빌드됩니다.

### Fixed
- **v1.10 에서 고친 메타 자동 백업의 거짓 실패(`cannot lock ref … is at X but expected Y`)가 계속 나던 문제.** 원인은 수정 코드가 아니라 배포 경로였습니다: prdt CLI 와 훅이 실행하는 `packages/core/dist/bin/meta-cli.cjs` 는 gitignore 대상이고 설치가 이를 빌드하지 않아, 2026-09-22 이후 core 수정(T-686 동시 push 락 포함)이 실행되지 않았습니다. 이제 설치·업데이트가 `src/` · `package.json` · `tsconfig.json` 이 브리지보다 새로우면 다시 빌드합니다. 빌드할 수 없는 환경(npm 없음 · 빌드 실패)에서도 설치의 나머지는 끝까지 진행하고 그 사실을 알립니다. 의존성이 없을 때 안내는 `pnpm install` 입니다.
- **빌드 락이 브리지 갱신을 영구히 막지 않습니다.** 빌드 중 강제 종료로 남은 락은 빌드 프로세스 pid 로 버려짐을 판정해 다음 설치가 바로 다시 빌드하고, 종료 신호를 받아도 빌드가 아직 돌면 락을 유지해 동시 빌드가 생기지 않습니다. 버려진 락을 여러 설치가 동시에 치워도 빌드는 한 번이며, 그 사이 다른 설치가 새로 잡은 락은 건드리지 않습니다. 락 때문에 건너뛸 때는 락 경로를 출력합니다.

### Added
- **`prdt doctor` 가 낡은 node bridge 를 경고합니다** — 브리지가 없거나 빌드 입력보다 오래되면 경로와 가장 최근에 바뀐 파일을 이름으로 알립니다. CLI·훅이 실제로 실행하는 `PRDT_REPO` 쪽 브리지를 판정하고, `src/` 안의 `.DS_Store` · 편집기 임시 파일은 무시합니다.

## v1.10.1 — v1.10 회고 규율 반영 · 반환 봉투 결과 칸 (2026-09-27)

> 패치 릴리스입니다. v1.10 회고에서 닫힌 티켓 세 건(T-725·T-726·T-728)을 반영합니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **반환 봉투에 합격 기준별 결과 칸이 생겼습니다** — `results[]{item,verdict,evidence}`. `summary`(≤200자)는 결과 한 줄로 남고, 합격 기준마다 결과·근거를 적는 워커(QA 등)는 이 칸에 담습니다. 반환 게이트의 되묻기 문구가 이 칸을 가리키고, `task`≤80·`summary`≤200 캡은 그대로입니다. GUI `QaEnvelope` 타입이 이 필드를 선언하고, 게이트 되묻기 문구와 이 필드를 쓴 반환의 왕복을 테스트가 고정합니다.

### Changed
- **v1.10 회고에서 세 번 이상 반복 관측된 다섯 가지가 정본 규율에 반영됐습니다.** contracts §Language 말투 줄이 "새 낱말을 만들지 않는다"와 "라벨·제목은 의문문으로 쓰지 않는다"를 명시적으로 포함하도록 늘었고("문제 · 개선 효과" — "뭐가 문제인가 고치면 뭐가 나아지나?"는 위반), contracts §Git 은 `git stash`/`git stash pop`을 bare 로 쓰지 말고(WIP 커밋 또는 이름 붙은 `stash push -u -m <tag>`) 스크래치 삭제는 이 디스패치가 만든 이름 붙은 대상만 지우도록(글롭 금지) 못박았습니다. PO habit 은 사용자의 화면·레이아웃 모양 지시를 산문이 아니라 ASCII 스케치로 되읽는 절차를 얻었습니다.

## v1.10 — PRD·티켓·위키 구조 통합 · 정적 뷰어 · major 1 북극성 첫 관측 (2026-09-27)

> CLI 아티팩트 단독 릴리스입니다. GUI(.dmg)는 이 버전에 포함되지 않습니다 — GUI 유예는 major 1 전체에 걸리고 그 근거는 [[fact--gui-deferral]] 한 곳에 있습니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **major 1 북극성을 처음 관측했습니다** — GUI 없이 관측할 수 있는 새 북극성("개발 지식이 어느정도 있는 기획/개발자가 인지비용 소모를 적게, 여러 프로덕트를 관리하기 용이한 프로덕트")을 이번 라운드에서 세우고, v1.6 이후 다섯 버전 만에 처음으로 측정값을 남겼습니다: 문서 3건(티켓·결정·산출물)을 뷰어만으로 찾기까지 PO에게 경로를 물은 횟수 3회→0회, `prdt doctor`가 검사하는 PRD·티켓·feature·wiki 간선 0개→6개. 기록은 `docs/artifacts/v1.10/north-star-observation.md`.
- **저장소를 통째로 여는 정적 오프라인 뷰어** — PRD·티켓·결정·산출물을 한 화면에서 읽습니다. 서버도 Electron도 없이 파일 하나를 더블클릭으로 열고, 본문은 생성 시점에 페이지 안에 인라인되며, 활동 바 + 목록/상세 패널로 버전별 티켓과 닫힌 PRD 섹션을 찾아갑니다. 지금은 데스크탑 전용입니다 — 320px 폭에서 레이아웃이 깨지는 것을 확인하고 폰 대응은 다음 라운드로 미뤘습니다.
- **PRD가 무엇이 바뀌었는지 정해진 자리에서 말합니다** — 열린 버전 섹션에 `### 이 버전이 뒤집은 것 (reversed)`을 둬 앞선 결정 중 무엇을 뒤집었는지 산문을 읽지 않아도 보이고, 스코프 항목마다 `#### <key> — <label>` 주소가 붙어 티켓이 `prd_item: v1.10#<key>`로 항목을 직접 가리킵니다. 닫힌 버전 섹션을 한 파일(`history.md`)에 몰아 두던 방식을 버리고, 버전마다 `docs/prd/versions/v<N>.<m>.md` 한 파일로 물러납니다 — v1.1·v1.2.1·v1.4처럼 PRD 섹션이 통째로 빠진 라운드가 있었다는 사실을 이 개편으로 찾아냈습니다.
- **PRD·티켓·feature·wiki 사이에 기계가 걷는 연결이 생겼습니다** — 채택된 연결은 frontmatter 키로 착지하고 `prdt doctor`가 검사합니다. `feature:` 값은 닫힌 어휘 위에 서서, 같은 대상(GUI)을 다섯 이름으로 부르던 문제를 없앴습니다.
- **GUI 유예를 말하는 자리가 하나로 좁혀졌습니다** — 결정 페이지·PRD 머리말·How 표·위키가 각자의 문장으로 말하던 것을 위키 fact 페이지 [[fact--gui-deferral]] 한 곳으로 모으고, 나머지는 그 페이지를 인용만 합니다.
- **티켓 틀을 다시 짰습니다** — `상태`·`문제`(As-is/To-be)·`대안`·`관련사항`(버전 안에서의 위치·기능 맵은 손으로 쓰지 않고 위 연결에서 그려집니다)·`합격 기준`·`근거`·`진행 기록` 순서로 고정되고, 사람 이름 대신 역할(`사용자`·`Designer`·`PO`)만 씁니다. 사용자 판정을 기다리는 결정을 위한 `type: decision` 티켓이 새로 생겨 `deps`로 무엇이 그 결정에 막혀 있는지 보입니다 — 다만 결정 티켓은 push·deploy 동의를 담지 못합니다, 그 동의는 진행 중인 세션에서 사용자가 직접 한 말로만 존재합니다.
- **검토용 HTML 산출물의 이름표 문구를 그 자리에서 고칩니다** — 데이터에서 온 값(수·티켓 id·날짜)은 모양으로 구분돼 고쳐지지 않고, 페이지는 저장소에 쓰지 않은 채 변경 목록을 내려받아 PO가 반영합니다.
- **인증 정보 값이 컨텍스트에 들어오지 않습니다** — `prdt env check`가 키의 존재와 길이만 답하고 값은 찍지 않으며, `.env`·`.env.*`·`*.pem`·`*.key`·`credentials.json`·`*.p12` 내용을 찍으려는 도구 호출은 훅이 거부합니다. 이전에는 production 값만 막혀 있었습니다.
- **주입되는 규율이 정해 둔 바이트 예산을 넘으면 `prdt doctor`가 실패합니다** — 이전에는 줄 수만 셌습니다.
- **디스패치가 기기 자원 한도를 봅니다** — 자원이 한도를 넘으면 새 발주를 대기시키고, `prdt dispatch ls`로 이 기기의 진행 중인 디스패치를 봅니다.

### Changed
- **세션마다 드는 주입이 페르소나별 27~32% 줄었습니다** — contracts·habit·플레이북 메뉴 문서를 압축하고, 턴마다·툴 호출마다·디스패치마다 반복되던 알림도 같은 잣대로 줄였습니다. 규율의 뜻은 그대로입니다 — 문안 변경은 전부 Designer `inject-edit` 한 사람의 손을 거쳤습니다.
- **v1.9가 남긴 결함 9건이 닫혔습니다** — 재개된 워커 호출자에 핀이 없던 것, 핀이 훅 문장을 바이트로 붙들어 문구를 못 고치던 것, 백업 실패 배너가 지워지지 않던 것, 테스트 스위트가 개발 기기에서 완주되지 않던 것, 레지스터(말투 설정) 준수 여부를 아무도 보지 않던 것, 훅 등록 56건 중 48건이 두 이벤트에 중복되던 것, 반환 게이트 상태 파일 3개의 메타 분류, 심링크 안전 writer 잔여, Define 화면 세트의 커버리지·interactive 판정 기준 부재.
- **v1.9에서 넘어온 규율 문안 8건을 문안/기제로 재판정했습니다** — 사람에게 조심하라고 적은 것과 어길 수 없게 만든 것을 구분해 기록했습니다.

### Fixed
- **동시에 도는 메타 자동 백업이 거짓 실패를 보고하던 문제** — 같은 원격에 두 백업이 겹치면 실패로 찍혔습니다. 이제 경합이 있으면 미루고 다음 경계에 재시도합니다.
- **메타 백업 원격이 없을 때 안내가 실패할 push를 권하던 문제** — 두 가지 고칠 방법을 대신 알려줍니다.
- **QA용 VM이 실제로는 꺼졌는데 실패로 보고되던 문제** — 정지 판정을 종료 코드 대신 "끈 뒤 프로세스가 없다"로 바꿨습니다.
- **호출 거버너의 강제 중단이 워커의 최종 보고 자체를 막던 문제** — 이제 SubagentHandback 보고는 항상 통과합니다.
- **override 위조 탐지가 훅 자신의 고정 문구를 위조와 구별하지 못하던 문제** — 헤더·BEGIN·END를 닫힌 집합으로 다시 세웠습니다.

## v1.9 — 프롬프트·하네스 시스템 레벨 검토 (2026-09-17)

> CLI 아티팩트 단독 릴리스입니다. GUI(.dmg)는 이 버전에 포함되지 않습니다 — Phase 4 는 v2.0 으로 이월됐습니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **Define 이 화면 승인으로 닫힙니다** — PRD 승인만으로 Build 로 넘어가던 것을, 사용자가 이번 버전의 화면을 실제로 보고 승인해야 닫히도록 바꿨습니다. 승인 대상은 DS 쇼케이스와 **눌러서 돌아다니는 프로토타입** 두 가지이고, 프로토타입 옆의 화면 목록이 곧 「이번 버전이 무슨 화면을 건드리나」의 정본입니다. 링크를 건네받기 전의 OK·침묵·재진입은 승인이 아닙니다. 화면이 없는 라운드(규율·훅 편집)에는 N/A 경로가 따로 있습니다.
- **그 화면을 만드는 단계에 호출자가 생겼습니다** — 디자인 산출물이 만들어지느냐가 워커의 눈치에 달려 있던 것을(사용자 표현으로 "좀 랜덤") 없앴습니다. DS 방향이 먼저 굳고 그 위에 프로토타입이 열리며, 그 프로토타입은 사용자에게 가기 전에 접근성 항목(대비·포커스·터치 영역·폭별 글자 깨짐)에 대해 한 번 검수됩니다.
- **합격선 달성이 상태 전이가 됩니다** — 합격선을 넘긴 뒤 도착한 요구는 기본값이 「다음 버전」이고, 이번 라운드에 넣으려는 쪽이 근거를 댑니다. 근거는 확인 가능한 사실 둘뿐입니다 — 이번 버전의 열린 티켓이 그것 없이 못 닫히거나, 지목된 바깥 프로젝트가 이미 그것을 쓰고 있거나. 「중요하다」는 근거가 아니며, 근거 없이 넣으면 편입은 되고 기록에 그렇게 남습니다.
- **`prdt doctor` 검사 4종** — 상주 중인 기기 자원(VM·컨테이너) 보고 · 존재하지 않는 파일을 가리키는 훅 등록 · 한 (이벤트, matcher) 에 중복 등록된 훅 · 출시 태그 시점 기준으로 낡은 README. 전부 **보고 전용**이고 아무것도 고치지 않습니다.
- **자원 표식** — 에이전트가 VM·Docker 스택을 쓰면 표식을 남기고, 마지막 표식이 빠질 때 끕니다. 표식 없는 자원은 아무리 오래 떠 있어도 에이전트가 끄지 않습니다. VM 을 새로 띄우는 것은 사용자 승인을 받고, 이미 떠 있는 것에 합류하는 것은 받지 않습니다.
- **티켓이 목적을 담습니다** — 다만 항상이 아니라 두 경우에만: 첫 발주 뒤 합격 조건이 바뀐 티켓과, 실재하는 기능 스펙 파일을 가리키는 티켓.

### Changed
- **「relevant tests」의 뜻이 정해졌습니다** — 규율은 처음부터 "relevant tests green" 이라고 적었는데 그 뜻이 어디에도 없어서 실무가 「전량」으로 굳었고, 검증 1회의 비용이 변경 크기가 아니라 프로젝트 무게를 따라갔습니다. 이제 relevant 는 바뀐 파일에서 유도됩니다 — 자기가 바뀌었거나, 바뀐 파일을 import 하거나, 본문이 그 이름을 말하거나. 전량 실행은 Ship 진입 1회로 자리를 갖습니다.
- **배포 때 README 를 갱신합니다** — 릴리스노트는 「무엇이 바뀌었나」의 누적이고 README 는 「지금 이 제품이 무엇인가」인데, 후자에는 규칙이 없어 여섯 버전을 밀렸습니다. 이제 태그 시점 기준으로 세 가지가 확인됩니다 — 실행 블록이 가리키는 경로가 존재하는가, 보여주는 명령을 CLI 가 받는가, 페르소나·스테이지 이름이 실제와 맞는가.
- **주입되는 규율이 가벼워졌습니다** — `contracts.md` 75/80줄 · `po/habit.md` 55/64줄. 컷마다 그 줄을 쓴 티켓의 합격 조건을 먼저 읽는 절차를 거쳤고, §Secrets 는 「줄이면 금지 범위가 좁아진다」는 이유로 그대로 뒀습니다.

### Fixed
- **클론한 저장소가 사용자 파일을 덮어쓸 수 있던 문제** — `.prdt/` 는 클론에 딸려 오고 git 은 symlink 을 실어 나릅니다. 임시 파일 이름을 아무 경로로의 symlink 으로 심어 둔 저장소를 클론하면 **첫 디스패치**가 그 대상을 자르고 채웠고, 이름 바꾸기가 링크를 먹어 흔적도 남지 않았습니다. 임시 파일은 이제 `O_EXCL` 로 만들고 이어쓰기는 `O_NOFOLLOW` 를 씁니다.
- **검증 스크린샷이 기기를 떠나던 문제** — QA 가 검증 화면을 두는 자리가 메타 자동저장의 제외 목록에 없어, 영구 커밋이 되고 동의 없이 도는 자동 백업으로 올라갔습니다. 라운드 끝에 지우는 습관이 있었지만 자동저장이 매 턴 돌아 **삭제가 경주에서 지는 구조**였습니다.
- **설치 스크립트가 모르는 인자를 무시하던 문제** — 바이트를 재려던 명령이 그대로 설치로 돌아, 사용자 설정에 훅 로스터가 한 벌 더 등록되고 `prdt` 명령이 깨졌습니다. 이제 모르는 인자는 **쓰기 전에** 중단하고, 쓰는 대상 세 곳을 먼저 알려줍니다.
- **설치와 제거가 서로 다른 기준으로 판정하던 문제** — `~/.prdt` 나 홈 경로에 symlink 이 낀 기기에서 업그레이드가 훅 등록을 **두 배**로 만들고, 제거가 스크립트만 지우고 등록을 남겼습니다. 이제 셋이 같은 기준을 씁니다.
- **레지스터 줄이 조용히 사라지던 문제** — 말투 설정을 읽는 호출이 제한 시간을 넘기면 아무 말 없이 그 줄을 버렸습니다. 09-15 이후 전달 1,084건 중 87건이 그랬습니다. 이제 「이번 턴에는 못 받았다」고 말합니다 — 무엇이었을지는 추측하지 않습니다.
- **훅이 죽지도 않았는데 죽었다고 보고하던 문제** — 같은 훅이 한 세션에서 동시에 돌면 뒤 실행이 앞 실행의 진행 중 표식을 「중간에 죽었다」로 읽었습니다. 관측된 경고 179건 중 161건이 이것이었습니다.
- **`prdt resource up/down` 이 세션 id 를 기본값으로 쓰던 문제** — 한 세션의 병렬 작업 둘이 표식 하나를 공유해, 먼저 끝난 쪽이 남이 쓰는 VM 을 끌 수 있었습니다.
- **`prdt estimate` 가 레코드 하나에 죽던 문제** — 형제 명령은 이미 같은 상황을 세고 있었습니다.

## v1.8 — 규율 전량 도달 · doctor 자가 판정 · 집행층 방어 3종 (2026-09-04)

> CLI 아티팩트 단독 릴리스입니다. GUI(.dmg)는 이 버전에 포함되지 않습니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **규율이 세션에 전량 도착합니다** — doctrine·contracts·habit·플레이북 메뉴를 합친 페이로드가 주입 한도(약 10,000자)를 넘으면 앞 2KB 미리보기만 도착하고 나머지는 통째로 잘리던 결함을 닫았습니다. 이제 파트당 하나의 훅 출력으로 나눠 전량 전달하고, `prdt doctor` 가 규율이 실제로 발화했다는 증거(등록만이 아니라 실제 발화 + 마커 노화)를 봅니다.
- **`prdt doctor` 판정 줄이 규율↔실집행 계열을 스스로 나눕니다** — 검사마다 소속 계열을 선언하고, "검사가 돌았다" · "위반이 없다" · "볼 수 없었다(스킵)"를 구분해 한 줄로 보고합니다(`verdict=… violations=N ran=N skipped=N`). 스킵된 검사가 있으면 위반이 0이어도 `clean`이 아니라 `not-established`로 보고합니다.
- **모델 가용성 프리플라이트** — 디스패치를 태우기 전에 카나리 호출 1회(수 초, 토큰 사실상 0)로 해당 모델이 지금 쓸 수 있는지 확인합니다. 한도 소진으로 인한 실행층 사망과 모델 자체의 거부를 더는 같은 실패로 취급하지 않습니다.
- **`prdt artifacts sync` / `prdt artifacts check`** — 사용자 리뷰 산출물이 `docs/artifacts/<version>/` 버킷 + `manifest.json` + `archive/`로 정본화되고, 매니페스트는 손으로 쓰지 않고 `sync`가 디스크에서 유도합니다. `check`는 버킷에 배치되지 않는 파일과 형식이 깨진 항목을 보고합니다.
- **`prdt doctor` 신규 검사** — 훅 미러 drift · discipline 미러 drift · statusline 등록 drift(사용자/프로젝트 층, malformed 값 포함) · `docs/features/` 참조 그래프 정합성 · 중복 티켓 id · 손상된 티켓 frontmatter에 대한 내성.

### Changed
- **승격 경로 판정이 이중부정과 squash merge를 정확히 읽습니다** — `"Never push to main without a PR."`처럼 PR 정책을 가장 정확하게 적은 문장이 오히려 false negative로 버려지던 휴리스틱을 고쳤고, GitHub squash merge 제목(`<title> (#123)`)도 PR-merge 증거로 인식합니다. "PR 증거 없음"과 "PR 불필요"를 doctor가 별도 상태(`no-evidence`)로 구분해 보고합니다. v1.7은 이 자리의 오판정으로 실제 잘못된 main push를 낸 적이 있습니다.
- **override align 검사가 프로젝트 층에만 적용됩니다** — 기기 층 override는 참고만 하고 판정 대상에서 빠집니다.
- **비싼 테스트 셋업은 파일당 한 번만 구축합니다** — 설치·시드 데이터베이스·컨테이너 기동처럼 비용이 큰 공유 셋업은 테스트 케이스마다 다시 만들지 않고 파일당 한 번만 만들어 재사용하며(신선한 셋업이 필요한 idempotency/cleanup 검증은 예외), 그 규율을 어긴 스위트가 남기던 대용량 임시 디렉터리 누수를 정리했습니다.

### Fixed
- **디스패치 게이트·호출 거버너가 공백 하나로 무력화되던 문제** — 두 훅의 top-level JSON 파서가 compact 포맷만 전제해, harness가 pretty-print로 바꾸면 deny도 경고도 없이 게이트가 사라졌습니다. 구조를 읽도록 고쳤습니다.
- **호출 거버너 카운터를 지우거나 잘라 한도를 영구 무력화할 수 있던 문제** — 삭제·truncate·정규 파일을 가리키는 symlink로 카운터를 우회하거나 다른 파일을 오염시킬 수 있었습니다. `prdt doctor`가 missing · truncated · symlinked · non-regular 네 상태를 모두 보고합니다.
- **stage guard가 붙여넣기로 조용히 사라지던 문제** — 워커 반환을 붙여넣고 그 아래에 직접 배포 요청을 타이핑하면 알림 마커가 본문 중간에 있다는 이유로 무발화됐습니다. 마커의 시작과 끝 양쪽을 함께 보도록 고쳐, 실제 라이브 캡처만 non-fresh로 판정합니다.
- **`.html`/`PRD.md` 산출물을 쓸 때 macOS 키체인 다이얼로그가 뜨던 문제** — auto-open 훅이 샌드박스 프로세스에서 앱을 콜드 스타트시켜 발생했습니다. 대상 앱이 이미 실행 중이 아니면 여는 대신 Finder로 reveal하도록 바꿨고, 워커의 Write에는 더 이상 발화하지 않습니다.
- **statusline 등록 실패가 침묵하던 문제** — 기존 `statusLine`이 이미 있으면 prdt 것이 등록되지 않고도 아무 신호가 없었습니다. `prdt doctor`가 등록 상태(정상 / 미등록 / 다른 대상 / 파일 결손)를 프로젝트 층 오버라이드까지 포함해 보고하고, 복구 명령을 함께 출력합니다.
- **doctor의 drift·base·shape 오탐 3건**을 정리했습니다.

## v1.7 — Define 방향 소유권 · 호출 거버너 · 주입 방어 (2026-08-25)

> CLI 아티팩트 단독 릴리스입니다. GUI(.dmg)는 이 버전에 포함되지 않습니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.
>
> **이 라운드는 자체 합격선을 통과하지 못했습니다.** 목표는 티켓당 토큰 20% 감소였고 실측은 **−17.7%** 였으며, 라운드 중 신규 스코프를 편입해 짝 조항도 불합격입니다. 산출물은 전부 착지했고 아래 내용은 실제로 동작하지만, 이 버전은 목표 미달로 닫힙니다.

### Added
- **Define 진입의 방향 fork** — 새 버전 섹션은 PRD·위키·티켓이 이미 완비돼 있어도 designer 의 첫 반환이 `ready` 가 될 수 없습니다. 첫 반환은 2~3안 + 각 안의 득실 + 단일 추천을 담은 방향 fork 이고, 사용자의 답은 `[ctx].direction_pin` 으로 **개작 없이** PRD 에 들어갑니다. 문서가 두꺼울수록 질문이 0건이 되던 경로를 닫습니다.
- **ambiguity 4조건 판정식** — ⓐ사용자에게 보이는 결과가 달라지는가 ⓑ되돌림 비용이 결정 비용보다 큰가 ⓒ기록된 결정을 뒤집는가 ⓓ기록이 비워둔 칸을 채우는가. 하나라도 yes 면 사용자 몫이고, 전부 no 면 designer 가 정하되 **PRD 의 `### Autonomous decisions` 에 한 줄을 남깁니다.** 흔적 없는 자율 결정은 위반입니다.
- **`scope-challenge` playbook** — 스코프가 이미 완성돼 도착해 PO 가 fork 재료를 만들 수 없을 때. `prd-clarity` 와 별도 세션에서 돌고, 산출물은 fork 표뿐이며 PRD 를 건드리지 않습니다.
- **호출 거버너** — 디스패치당 API 턴을 세어 developer 는 40턴 경고 · 60턴 차단, qa·designer 는 모든 대역에서 경고만. 차단은 도구 호출만 막고 반환은 항상 열려 있어, 워커가 `unresolved[]` 로 돌아오면 남은 조각을 새 컨텍스트에서 다시 냅니다. 8개 프로젝트 실측: 차단 5회 전부 설계대로 복귀, 분할이 절감의 **10.2배** 이득.
- `prdt doctor` — 훅의 **발화 증거**(등록만이 아니라 실제 발화 + 마커 노화)와 meta exclude 쌍의 drift 를 봅니다.

### Changed
- PRD 의 읽기 단위가 **표준 머리 + 살아 있는 Phase 절 + 버전 섹션 하나**로 좁혀지고, 기능의 현재 스펙은 `docs/features/<feature>.md` 가 갖습니다.
- 디스패치당 예산 규율 — 독립 읽기는 한 턴에 병렬로, 연속 검증은 한 호출로. 검증 4종은 모두 실행되고 없어지는 것은 API 왕복뿐입니다.
- `contracts.md` — `[ctx].direction_pin`(축자 전달) · 툴링 소유 런타임 상태의 read-only 명문화(자기 카운터를 지워 차단을 피하는 것은 tampering).

### Fixed
- **파생 경로가 harness 구조를 위조할 수 있던 문제.** override 주입 훅이 파일 본문은 gutter 뒤에 두면서 **경로는 raw 로** 넣어, 줄바꿈 하나를 담은 디렉터리 이름이 위조된 블록 종료·위조된 `[prdt discipline …]` 헤더·임의 규칙 줄을 column 0 에 세울 수 있었습니다. git 이 그런 경로를 clone 으로 옮기므로 실제 도달 가능한 경로였습니다. 경로는 이제 shape 로 판정해 한 줄 평문만 통과하고 나머지는 통째로 보류합니다 — 보고된 2곳이 아니라 **17곳**이었고, gutter 안에 들어 있던 보류 알림 자신도 포함됩니다.
- **위조된 tool 인자로 오케스트레이터를 정지시킬 수 있던 문제.** 거버너가 바이트 윈도우의 첫 매치로 신원을 읽어, 자기 신원을 보내지 않는 메인 세션이 tool 페이로드 안의 위조 키에 끌려 들어갔습니다. 이제 **최상위 멤버 walk** 로 읽어 중첩 깊이가 자격을 박탈합니다. tool **출력**이 같은 페이로드에 실리는 신설 경로도 함께 닫았습니다.
- 거버너 훅의 문자열 처리 비용 — 원인이 알고리즘이 아니라 로케일이었습니다. `LC_ALL=C` 로 28KB 페이로드에서 ~120ms → 29.6ms(읽기 전용 하한 26.5ms).
- meta exclude 쌍의 파리티 — `.return-flags.json` 이 TS 쪽에만 있어, node 브리지 없는 기기에서 큐 파일이 meta 히스토리에 계속 쌓였습니다.
- 잘못된 형태의 `[ctx]` 를 워커가 뜨기 전에 거절하고, 규약을 벗어난 반환을 PO 프롬프트로 알립니다.

## v1.6 — 4칸 override 체계 · 기기 위키 · CLI 릴리스 (2026-08-18)

> CLI 아티팩트 단독 릴리스입니다. GUI(.dmg)는 이 버전에 포함되지 않습니다.
> 적용: `prdt update` 또는 `packages/core/scripts/install.sh` 재실행.

### Added
- **4칸 override 체계** — 기기(`~/.prdt/overrides/`) · 프로젝트(`.prdt/overrides/`) 2층이 매 턴 주입. 우선순위는 정본 < 기기 < 프로젝트이며, **비-override 바닥**(Secrets · 동의 게이트 · read-only/carve-out)은 어떤 층도 움직일 수 없습니다. compaction 후 재주입 구멍도 봉합.
- **기기 위키** `~/.prdt/wiki/` — 이 기기의 모든 prdt 프로젝트가 공유. `prdt wiki search`가 양 저장소를 합산하고 기기 히트에 `machine:` 접두를 붙입니다.
- `prdt wiki refs '<change_meta>'` — 디스패치에 실을 위키 후보를 기억이 아니라 도구로 유도.
- `prdt tickets --link T-NNN …` — 티켓 id를 열 수 있는 링크로 해석(디렉터리를 옮긴 티켓도).
- `prdt tickets --assignee <po|designer|developer|qa|user>` — 사람이 수행자인 작업 조회.
- `prdt init`이 `docs/RELEASES.md` 스텁을 떨굽니다 — preamble 자체가 포맷 규약입니다.
- `prdt doctor` 검사 추가 — override 층 캡(≤20줄) · 기기 위키 페이지 예산 · 두 층 정규화 중복 · `v*` 태그 대비 릴리스 노트 누락 · main-push 훅 소유권.

### Changed
- **패치 릴리스 모델 확정** — 격리 패치 미지원, 평시는 선형 소형 사이클(hotfix와 계획 릴리스가 같은 기계), 긴급은 main hotfix(`ALLOW_MAIN_PUSH=1`, 명령당 env 전용).
- **main-push 차단의 소유자가 CLI로 이전** — `prdt init`이 설치하고 `prdt doctor`가 self-heal. 전역 `core.hooksPath` 기기에서는 쓰지 않고 정직하게 보고합니다.
- projectRoot 해석이 **조상 체인의 outermost + physical**로 통일(CLI · 훅 4종 · statusline).
- discipline — `assignee: user` 정식화 · 사용자에게 셸 명령을 넘기지 않는 규칙 · 직접 측정하지 않은 진단을 티켓 전제로 쓰지 않는 규칙 · Retro의 override align 스텝(줄 단위 판정).
- installer가 조용히 성공하지 않습니다 — manifest 실패 시 종료 코드 비0, `settings.json` 무변경.

### Fixed
- `prdt tickets`/`history`가 인덱스를 지우고 자기 슬라이스만 채워, 이후 `wiki search`가 프로젝트 페이지를 **조용히 누락**하던 문제. 갓 clone한 프로젝트도 인덱스를 스스로 파생합니다.
- uninstall이 존재하지 않는 스크립트를 가리키는 훅 등록을 남겨 **매 프롬프트마다** 에러가 나던 문제.
- 훅이 없는 self-load 경로에서 프로젝트 override 층이 **조용히 누락**되던 문제.
- 신뢰 경계 밖 본문의 인용 처리 — 모든 줄이 gutter 뒤로 도착하고, 읽을 수 없는 본문은 빈 채로 렌더되지 않고 **그렇다고 말합니다**. defense-in-depth이며 보증이 아닙니다.
- statusline이 파일 내용으로 프로젝트·버전·stage를 위조당할 수 있던 문제.

### Removed
- `installPrePushHook` TS export(호출자 0건) — 훅 설치는 CLI가 소유합니다.

## v1.5 — Anchor DS reskin, audience-mode, security guards (2026-07-24)

### Added
- **audience-mode (planner / developer)** — PO 대화 어투를 사용자에 맞춤: `planner`(기본, 평이한 어휘·결론 우선·점진적 상세) / `developer`(현행). per-user 저장(`~/.prdt/audience-mode`), 온보딩 + Settings에서 선택. (T-326)

### Changed
- **GUI Anchor Design System 리스킨** — 전 GUI를 Anchor semantic 토큰으로 전환, Light/Dark 자동 스왑, Pretendard. accent는 단일 토큰 스왑(브랜드 violet 유지). (T-359)
- **QA discipline** — 반응형·텍스트 컴포넌트에 멀티폭 시각 가독 판정 의무화(존재 assertion만으로 pass 금지), 폭세트는 PRD 타깃표면에서 도출. (T-411)
- **보안 가드** — 워커/서브에이전트가 프로덕션 시크릿을 컨텍스트로 pull 금지(ambient env·로그 ingestion 포함), deploy는 명시 승인 하에 키참조만. (T-412)

### Fixed
- **trust auto-accept를 v1 prdt 라인에 이식** — 비개발자 fresh 머신 첫 세션에서 PO가 roleplay 없이 정상 동작. (T-408)
- **GUI 배너 훅 등록 parity** — audience·overrides 훅이 GUI-only 사용자에게도 등록·적용(이전엔 4/6종만 등록되고 재설치 시 de-register). (T-413)
- **리스킨 라이트 모드/활성 상태 회귀** — md-recipes 전역 토큰 그림자로 라이트서 다크 패널·안 보이는 텍스트, 알파-suffix invalid CSS로 활성 칩 테두리 소실 정정. (T-417)
- **trust-accept 손상 파일 보호** — 손상된 `~/.claude.json` 조우 시 재작성 중단(상태 유실 방지). (T-418)

## v1.4 — CLI update flow, glossary, release notes + debt cleanup (2026-07-22)

### Added
- **`prdt` 실행 시 인터랙티브 업데이트 프롬프트** — 원격에 새 버전이 있으면 하루 한 번 update / skip / skip-this-version 3지선다 + 릴리스 노트 미리보기. 비대화형·오프라인은 조용히 통과. (T-393)
- **`prdt migrate`가 루트 `CLAUDE.md`를 wiki(또는 `--archive`)로 이관** — prdt 프로젝트가 상위 CLAUDE.md 정체성에 오염되지 않도록, 원본은 보존하며 walk-up 경로에서 제거. (T-396)
- **wiki `term` 타입 (개념 사전)** — 서비스 내부 개념을 canonical 정의로 `prdt wiki`에서 관리·검색·상호링크. (T-395)
- **`docs/RELEASES.md` 규약** — 버전별 사용자향 릴리스 노트, `v*` 태그 끊는 변경에 함께 작성. (T-394)

### Changed
- **statusline** — stage별 티켓 카운트 + version total 분리 표기, 긴 task slug 16자 cap. (T-403)
- **모델 라우팅** — prd-clarity·plan-first를 Fable tier로, Ship-entry 누적 code-review는 fable/medium(티켓 단위 fresh-eyes는 sonnet 유지), security-pass는 opus 고정. (T-391)
- **post-close 패치 라이프사이클** — 닫힌 버전의 사후 패치는 불변 `v<N>.<m>.<p>` 태그 + 경량 retro. (T-390)
- 내부 리팩터 — cost/banner/po-state 공유 헬퍼 추출, meta-split·git-workflow 중복 제거. (T-317/T-371/T-387)

### Fixed
- **`prdt migrate` 데이터 유실 방지** — 같은 날 이름 충돌 시 CLAUDE.md 삭제 전 wiki 기록 성공 확인 + 유니크 접미사. (T-396)
- **update-on-run 원격 파싱** — 대기 버전 노트를 원격 RELEASES에서 읽어 올바른 버전 표시 + skip 영구 음소거 버그 해소. (T-403)
- **`code.dir` 검증** — 오염된 값(절대경로·`..`)이 프로젝트 밖을 anchor하지 못하게 (TS + Python 포트 동기). (T-387/T-403)

## v1.3 — physical meta/code split + NTF git-workflow (2026-07-21)

### Added
- NTF canonical branch workflow — `dev` as residence branch, `promote` to `main`, immutable `v*` tags (T-323, T-386)
- Branch-policy `pre-push` hook blocking direct pushes to `main`
- Cross-machine meta bootstrap + explicit backup push (T-374)

### Changed
- Physical meta/code split — `projectRoot ≠ codeRoot` resolver, triple parity, `meta relocate` tool (T-376, T-377, T-378)
- README restructured for a code-only repo

### Fixed
- Meta-split migration hardening — readiness checks C1–C4 + network timeout (T-385, T-386)

## v1.2 — meta/code split (2026-07-16)

### Added
- Meta-only git core module — two-git / one-worktree (T-364)
- Meta history track, backup remote, migration UI (T-366, T-367)

### Changed
- prdt meta split out of code tracking — `rm --cached`, history preserved
- Meta split applied by default at init — gitignore managed block, autosave wiring, meta-cli bridge (T-365)

### Fixed
- Meta git env leak + global gitconfig contamination blocked (T-364)
- GUI meta UI design-system parity — 7 readiness violations (T-368)
- code-review correctness pass (T-370)

## v1.1 — GUI polish + init UX + QA isolation (2026-07-15)

### Added
- `prdt init` version-selection arrow UI — gum/fzf + text fallback (T-332)
- Project tab restructure + project history tab (T-348, T-349)
- Persistent model-version display (T-342)
- QA CUA VM isolation setup + frontmost gate (T-357)

### Changed
- `prdt init` prompt reduced to slug/version only (T-331)
- Machine-override hook separated — immune to persist-truncation loss (T-358)

### Fixed
- Korean IME residual on send (T-344, T-354)
- Status-bar usage coexistence + worker-sprite stabilization (T-355)
- session-limit classified as rate-limit state with reset time (T-352)
- Clickable `file://` / artifact paths inside code spans (T-346)

## v1.0 — prdt core (2026-07-03)

### Added
- prdt v1 — `doctrine.md` + `discipline/contracts.md` (unified full+lite redesign)
- 4 habits, 17 playbooks + style library
- prdt CLI — `init` / `doctor` / `wiki` / `tickets` / `history` / `menus`
- 3 Claude Code hooks + statusline + persona agents + install/uninstall
- `prdt migrate` (full/lite → prdt, opt-in) + `flip` to make prdt the default
- Cost estimation (usage × price table)

### Changed
- README positions prdt as productune's current production line

## v0.5 — GUI Planner-UX (2026-06-25)

### Added
- GUI Planner UX build (pre-prdt productune app) — 257 tickets closed

### Fixed
- Brand polish, PO sprite, first-turn PO reply, tray visibility (T-PATCH-256/257)
