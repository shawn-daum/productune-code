# prdt — productune (현행 버전)

> 오케스트라처럼, 들으면서 곡(제품)을 tune 해 나간다.
> **개발을 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들 수 있는 도구.**
>
> **`prdt`가 productune의 현재 프로덕션 버전이다.** full productune(5-phase + hook 18개)과
> productune-lite(판단 기반)를 하나로 합쳐 이 버전으로 통합했다 — lite에서 검증된 "판단 기반"
> 뼈대 위에 full의 자산을 선별 이식. 이전 버전(5-phase full / lite)은 은퇴했고,
> 신규·기존 프로젝트 모두 prdt를 쓴다 (기존 프로젝트는 [`docs/MIGRATION.md`](docs/MIGRATION.md)로 전환).
> 설계 SoT: [`docs/prdt-v1-design.md`](docs/prdt-v1-design.md)

## 한 장 요약

```
사용자 ─한 문장─▶ prdt-po (오케스트레이터 — 판단·라우팅·git·위키 큐레이션만)
                    │  intent만 담은 [ctx] 디스패치 — 절차는 worker 소유
                    ├─▶ prdt-designer   PRD·UX·브랜드·디자인시스템   (playbook 5종)
                    ├─▶ prdt-developer  구현·리팩터·버그픽스        (playbook 5종)
                    └─▶ prdt-qa         smoke·grill·보안·라이브 검증 (playbook 5종)

lifecycle:  Define → Build → Ship → Retro → idle   (gate 없음 — PO 판단 + 진입 ritual)
지식:       doctrine(철학 ≤20줄) + contracts(공유 규율 ≤80줄) + persona habit/playbook
기억:       docs/wiki/ — inbox 1줄 append → Retro에서 큐레이션. SQLite FTS(한글) 검색
강제:       hook 3종(주입·재주입·기록)만 기계, 나머지는 prdt doctor(non-blocking lint)
```

핵심 원칙: **PO는 메뉴만, 레시피는 worker** · **Markdown = SoT, DB는 파생물** · **강제는
사후·증거 기반** · **산출물이면 ticket, 의식이면 위키 log 1줄** (전체는 설계 §1).

## 설치 / flip

```bash
# v1 브랜치에서
packages/core/scripts/prdt-install.sh          # prdt 설치 (구 시스템과 공존, 옵트인)
packages/core/scripts/prdt-flip.sh             # 이 기기를 prdt 기본으로 전환 (구 pdt/pdtl 은퇴)
packages/core/scripts/prdt-flip.sh --rollback <backup-dir>   # 원복
```

flip 유의점(빌드 중이던 legacy 프로젝트 처리 등): [`docs/prdt-v1-flip.md`](docs/prdt-v1-flip.md)

## 사용

```bash
prdt                        # 프로젝트 루트에서 첫 실행 = 3항목 init (slug·version·stage)
prdt po                     # PO와 대화 시작 — "OOO 만들고 싶어" 한 문장이면 됨
                            #   (= claude --agent prdt-po 의 shortcut; 미init이면 init부터)
```

```bash
prdt doctor                 # non-blocking lint: state·ticket·wiki·discipline cap
prdt wiki search "질의"     # 위키 검색 (FTS5 trigram, 한글)
prdt wiki reindex|lint      # 파생 index.md 재생성 / 위키 lint
prdt tickets [--ready|--backlog|--version v1|--feature auth]
prdt history                # 버전별 티켓 집계 + retro 포인터
prdt migrate [--dry-run]    # 기존 full/lite 프로젝트를 prdt로 전환 (옵트인)
```

## 프로젝트 구조 (프로젝트 측)

```
.prdt/                      # po-state.json(4필드) · config.json(slug·surfaces) · index.db(파생)
docs/
├── prd/PRD.md              # 단일 living PRD (경로 고정)
├── design.md               # 단일 living 디자인시스템
├── artifacts/<slug>.<ext>  # 사용자 리뷰 산출물
├── tickets/<version>/T-NNN.md   # ticket-lite (전역 id · 3값 status · body 3섹션)
│   └── backlog/            # backlog = version 없는 ticket (승격 = git mv)
└── wiki/                   # decision-- · fact-- · learning-- · feature-- · retro--v*
```

## repo 구조 (이 저장소, v1 브랜치)

```
packages/core/
├── doctrine.md             # 빌드 철학 (전 페르소나 주입)
├── discipline/             # contracts.md + {po,designer,developer,qa}/{habit.md,playbooks/}
│   └── designer/style-library/   # 디자인 앵커 레퍼런스 (비주입)
├── agents/prdt-*.md        # thin pointer (주입 실패 시 self-load)
└── scripts/                # prdt CLI · hooks/prdt-*.sh · statusline-prdt.sh · install/flip
packages/gui/               # Electron GUI — prdt 어댑터(A1~A8) 진행 예정 (감사 문서 참고)
```

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/prdt-v1-design.md`](docs/prdt-v1-design.md) | 설계 SoT (원칙·lifecycle·계약·위키·hook·cap) |
| [`docs/prdt-v1-disposition.md`](docs/prdt-v1-disposition.md) | 구 hook 18개 + PO 규칙 전수 처분표 (유실은 결정) |
| [`docs/prdt-v1-gui-coupling.md`](docs/prdt-v1-gui-coupling.md) | GUI 결합 감사 + 어댑터 작업 목록 A1~A8 |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | **전환 매뉴얼 (동료용)** — 기기 전환·프로젝트 이관·트러블슈팅 |
| [`docs/prdt-v1-flip.md`](docs/prdt-v1-flip.md) | flip 체크리스트·유의점·롤백 |

이전 버전(5-phase full productune)의 문서·코드는 main 브랜치에 남아 있다 — 런타임은 은퇴·freeze
상태(치명 버그 예외만)이나, GUI 앱 개발은 아직 main에서 진행 중이라 prdt 어댑터(A1~A8) 완료 전까지
공존한다. 그 이전 README(full 시스템 소개)는 `git show main:README.md` 로 볼 수 있다.
