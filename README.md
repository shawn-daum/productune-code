# productune (`prdt`)

> 오케스트라처럼, 들으면서 곡(제품)을 tune 해 나간다.
> **코드를 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들 수 있는 도구** —
> Claude Code 위에서 도는 PM 오케스트레이션 시스템. CLI **`prdt`** + Electron **GUI**.

이 저장소는 **코드 전용(code-only) repo**다. PRD·티켓·위키 같은 프로젝트 메타는
별도 git(`.prdt/meta.git`)이 관리하며 여기에 포함되지 않는다 — [메타/코드 분리](#메타코드-분리-v12) 참고.

## 한 장 요약

```
사용자 ─한 문장─▶ prdt-po (오케스트레이터 — 판단·라우팅·git·위키 큐레이션만)
                    │  intent만 담은 [ctx] 디스패치 — 절차는 worker 소유
                    ├─▶ prdt-designer   PRD·UX·브랜드·디자인시스템
                    ├─▶ prdt-developer  구현·리팩터·버그픽스
                    └─▶ prdt-qa         smoke·grill·보안·라이브 검증

lifecycle:  Define → Build → Ship → Retro → idle   (gate 없음 — PO 판단 + 진입 ritual)
지식:       doctrine(철학) + contracts(공유 규율) + persona별 habit/playbook
기억:       docs/wiki/ — inbox 1줄 append → Retro에서 큐레이션. SQLite FTS(한글) 검색
강제:       hook(주입·재주입·기록)만 기계, 나머지는 prdt doctor(non-blocking lint)
```

핵심 원칙: **PO는 메뉴만, 레시피는 worker** · **Markdown = SoT, DB는 파생물** ·
**강제는 사후·증거 기반** · **산출물이면 ticket, 의식이면 위키 log 1줄**.

## 설치

요구사항: [Claude Code](https://claude.com/claude-code) CLI, `jq`, `python3`.

```bash
packages/core/scripts/install.sh     # idempotent — discipline을 ~/.prdt로 미러, agents·hooks 등록
```

## 사용

```bash
prdt                        # PO와 대화 시작 — "OOO 만들고 싶어" 한 문장이면 됨
                            #   (미init 프로젝트면 init: slug·version → 곧바로 PO 진입)
```

```bash
prdt doctor                 # non-blocking lint: state·ticket·wiki·discipline cap
prdt wiki search "질의"     # 위키 검색 (FTS5 trigram, 한글)
prdt wiki reindex|lint      # 파생 index.md 재생성 / 위키 lint
prdt tickets [--ready|--backlog|--version v1|--feature auth]
prdt history                # 버전별 티켓 집계 + retro 포인터
prdt meta log|remote|split  # 메타 git 조작 (v1.2 — 아래 참고)
prdt update                 # repo pull --ff-only + 재설치
```

프로젝트 측 구조(prdt가 관리하는 프로젝트에 생기는 것들):

```
.prdt/                      # po-state.json · config.json · meta.git(메타 저장소) · index.db(파생)
docs/
├── prd/PRD.md              # 단일 living PRD (경로 고정)
├── artifacts/<slug>.<ext>  # 사용자 리뷰 산출물
├── tickets/<version>/T-NNN.md   # ticket-lite (전역 id · 3값 status)
│   └── backlog/            # backlog = version 없는 ticket (승격 = git mv)
└── wiki/                   # decision-- · fact-- · learning-- · feature-- · retro--v*
```

## 개발 (이 repo)

pnpm workspace + turbo 모노레포. Node 20+, `pnpm@10`.

```bash
pnpm install
pnpm dev          # GUI 개발 서버 (vite — @productune/gui)
pnpm test         # 전체 테스트 (turbo run test — core·gui vitest)
pnpm build        # 전체 빌드
pnpm lint         # locale 키 체크 등
```

```
packages/core/                # discipline + CLI + hooks + core 라이브러리(TS)
├── doctrine.md               # 빌드 철학 (전 페르소나 주입)
├── discipline/               # contracts.md + {po,designer,developer,qa}/{habit.md,playbooks/}
├── agents/prdt-*.md          # thin pointer (주입 실패 시 self-load)
├── scripts/                  # prdt CLI(python) · hooks/ · install.sh · statusline
└── src/                      # git-workflow(meta split 등) core API — GUI가 사용
packages/gui/                 # Electron GUI (vite + react + vitest, smoke는 playwright)
```

GUI 단독 명령: `pnpm --filter @productune/gui smoke`(playwright smoke),
`... dist:mac`(mac DMG 패키징).

## 메타/코드 분리 (v1.2)

v1.2부터 한 워킹트리를 **두 git이 나눠 관리**한다(two-git / one-worktree):

- **코드 repo**(이 저장소, `.git`) — 제품 코드만. `.gitignore`의
  `# >>> prdt meta (managed) >>>` 블록(도구가 생성·갱신, 수동 편집 금지)이
  메타 경로(`docs/prd`, `docs/tickets`, `docs/wiki`, `.prdt` 등)를 전부 ignore한다.
- **메타 repo**(`.prdt/meta.git`) — PRD·티켓·위키 등 allowlist 경로만 추적.
  `prdt meta log|remote|split`으로 조작하며, 커밋은 PO가 자동으로 쌓는다.

그래서 이 repo를 clone하면 `docs/` 메타 문서가 없는 게 정상이다 — 설계 문서·티켓·위키는
메타 repo 소유이고, 이 README는 코드 repo 단독으로 완결되도록 쓰였다.
