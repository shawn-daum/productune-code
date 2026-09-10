# Releases

Version-by-version release notes for this project.

> **Format** — [Keep a Changelog](https://keepachangelog.com) style, adapted for prdt.
> - One `## <version>` section per shipped version, **newest first**. `<version>` is the
>   exact git tag string (`v1.4`) as the first token after `## ` — this is the anchor the
>   prdt updater parses, so keep it verbatim.
> - Optional ` — <title>` and date after the version token: `## v1.4 — release-notes (2026-07-22)`.
> - Group changes under `### Added` / `### Changed` / `### Fixed` / `### Removed` (omit empty groups).
> - **When**: written at release time. When you close a version, add its `## <version>` section
>   here in the same change that cuts the `v*` tag — never after the fact, never by a nightly job.
> - Everything above the first `## ` heading is preamble and is ignored by the parser.

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
