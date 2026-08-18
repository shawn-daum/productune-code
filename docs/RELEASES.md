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
