# prdt v1 — productune 통합 재설계

> full productune + productune-lite → **prdt** 단일 시스템.
> lite에서 검증된 "판단 기반" 뼈대 위에, full의 자산을 선별 이식하고,
> 메모리를 promotion gate에서 **LLM Wiki**로, 지식 배치를 **PO 중앙집중에서 persona 분산**으로 전환한다.
>
> 상태: 설계 확정 (2026-07-02, 사용자와 1:1 논의로 전 항목 합의). 구현 전.

---

## 0. 왜

| 진단 | full productune | productune-lite |
|---|---|---|
| 구조 | 5-phase + hook 18개(~3,157줄) + ticket ceremony | 3 soft stage + PO 판단 (VM smoke 검증 완료) |
| PO 비대 | PO doctrine 735줄 vs developer 28줄. QA의 GRILL 선택 로직·designer S1 계약·dev plan 절차가 전부 PO 쪽에 존재. test trigger는 PO/QA 양쪽에 byte-identical 복제(SYNCED PAIR 자백) | PO habit + bookshelf 4개 — 얇지만 같은 중앙집중 구조 |
| 메모리 | 4-quadrant promotion gate + 3 tier — 분류 비용 > 기억 가치. tier 혼동·orphan bookshelf·수동 drain | `docs/memory.md` 단일 파일 — 섹션당 ~20줄 cap이라 지식이 compound되지 않고 증발. 검색 없음 |
| 교훈 | 규칙이 on-demand 파일에 묻히면 PO는 어긴다 (lite PRD 경로 사건과 동일 패턴이 full에도) | 판단 기반 lifecycle 자체는 작동함 |

---

## 1. 핵심 원칙

1. **Doctrine ≠ Discipline.**
   - **Doctrine** = 제품 빌드 철학. PO가 제창하고 모든 페르소나의 *판단*에 스며드는 신념 — TDD, YAGNI(필요한 것만), 수레바퀴 재발명 금지, 동작 증명 없이 done 없음. `doctrine.md` ≤20줄, 전 세션 주입.
   - **Discipline** = 행동 규율. habit·playbook·계약·고정 경로 등 위반 판정 가능한 운영 규칙. 기존 "doctrine/" 디렉토리를 `discipline/`으로 개명.
2. **PO는 메뉴만, 레시피는 worker.** PO discipline에 worker의 절차(how)가 한 줄도 없어야 한다. PO는 intent(무엇·왜·acceptance)를 전달하고, worker가 자기 playbook에서 워크플로우를 선택한다.
3. **Markdown = SoT, DB = 파생물.** 위키·ticket 모두 md + frontmatter가 원본, SQLite는 언제든 재빌드되는 인덱스 (Hermes 방식).
4. **강제는 사후·증거 기반.** 기본은 판단 + boundary ritual. 기계 장치는 dogfood에서 반복 위반이 관찰된 곳에만, doctor 경고 → warn hook → block hook 순으로 추가.
5. **산출물이면 ticket, 의식이면 log.** 산출물이 남는 작업(design/impl/ops)만 ticket. ritual(retro·readiness·큐레이션)은 위키 log 1줄.
6. **파생 문서는 사람이 아니라 도구가 유지.** playbook 메뉴(`_index.md`)·위키 `index.md`는 frontmatter에서 CLI가 생성 — orphan/SYNCED PAIR 문제를 형식 차원에서 제거.

---

## 2. 네임스페이스 · 구조

에이전트 `prdt-{po,designer,developer,qa}` · CLI `prdt` · 미러 `~/.prdt/` · 프로젝트 상태 `.prdt/`.
버전은 이름에 박지 않는다(v2가 와도 재이름 없음 — 버전은 schema_v가 든다). pdt-*/pdtl-*과 충돌 없이 공존 → 옵트인 전환.

### repo 측 (productune repo, v1 브랜치)

```
packages/core/
├── doctrine.md                    # 빌드 철학 (≤20줄) — 전 페르소나 주입
├── discipline/
│   ├── contracts.md               # 유일한 공유 규율 (≤80줄): dispatch/return envelope ·
│   │                              #   고정 경로 맵 · status enum · DoD · commit 규약
│   ├── po/
│   │   ├── habit.md               # ≤60줄: lifecycle 판단 · 큐레이션 · git · 대화 — "how" 없음
│   │   └── playbooks/             # curate-wiki · retro · readiness-dispatch ...
│   ├── designer/
│   │   ├── habit.md
│   │   ├── playbooks/             # prd-clarity · ds-3up · hifi · ds-conformance ...
│   │   └── style-library/         # full에서 그대로 이식 (레퍼런스 데이터, 비주입)
│   ├── developer/
│   │   ├── habit.md
│   │   └── playbooks/             # plan-first · implement · code-review · refactor · bugfix
│   └── qa/
│       ├── habit.md
│       └── playbooks/             # smoke · grill · security-pass · live-verify · ds-conformance
├── agents/prdt-*.md               # ≤10줄 thin pointer
└── scripts/
    ├── prdt                       # entrypoint (init 포함)
    ├── prdt-doctor / prdt-wiki    # (또는 prdt 서브커맨드)
    ├── install.sh / uninstall.sh
    ├── statusline-prdt.sh         # 순수 표시 전용 (부수효과 금지 — §10)
    └── hooks/                     # 최소 3개 (§9)
```

### 프로젝트 측

```
.prdt/
├── config.json                    # slug · created_at · surfaces{} (full surface-config 이식)
├── po-state.json                  # { schema_version, stage, version, current_task }
└── index.db                       # SQLite: wiki FTS5(trigram) + tickets 테이블. git 미추적, 재빌드 가능
docs/
├── prd/PRD.md                     # 단일 living PRD (경로 고정)
├── design.md                      # 단일 living DS
├── artifacts/<slug>.<ext>
├── tickets/<version>/T-NNN.md     # ticket-lite (§6)
└── wiki/                          # §7
```

### 홈 측

```
~/.prdt/
├── discipline/                    # Tier 0 미러 (install.sh, 1-way)
└── overrides/<persona>.md         # 사용자 커스터마이징 overlay (§8)
```

---

## 3. 라이프사이클

```
Define → Build → Ship → Retro → idle
```

- lite의 soft stage 그대로: gate 없음, PO 판단으로 진행, load-bearing fork에서만 confirm.
- **open-gate (진입 ritual)**: 체크는 "떠날 허가"가 아니라 "다음 stage 진입 준비"에 붙는다. Ship 진입 = readiness pass(DS conformance + surface-conditional security), Retro 진입 = 위키 통합 + doctor. N/A skip은 판단 + 위키 log 1줄.
- **Retro는 정식 stage** (full의 Close 개명): inbox 큐레이션 → 위키 lint(orphan·모순·stale) → 비대 파일 분화 → `retro--v<N>.md` → doctor → idle 또는 다음 버전.
- full의 Design/Deploy phase는 폐지: Design = Build 안의 선행 순서(designer 먼저, DS 승인 fork 유지), Deploy = Ship 안의 `ops` ticket 1개.
- **Ship patch loop**: 라이브 검증이 잡은 버그는 `stage:"ship"` 유지한 채 impl ticket으로 patch→재배포→재검증. 재배포 이력은 버전당 1개인 ops ticket에 append.

### Stage 역행 (예: DS를 갑자기 바꾸고 싶을 때)

stage는 잠금장치가 아니라 **자세 포인터** — 역행은 금지도 자동도 아닌 "결정 번복" 이벤트다.
- **손질 수준** → stage 유지, design ticket 하나로 처리 (ship patch loop과 동일 원리).
- **전면 교체 (승인된 결정 번복)** → load-bearing fork: 사용자 confirm 후
  (a) 현 버전 흡수: stage를 `build`로 되돌림 + 기존 decision 페이지 **supersede** (안 하면 PO가 영구히 충돌 flag), 또는
  (b) 다음 버전 스코프로 이월. 뒤집히는 기존 작업량 기준으로 PO가 추천.

---

## 4. Delegation — intent dispatch

### 계약 (contracts.md)

- PO는 **intent만** 전달: `[ctx] {slug, goal, change_meta:{files, user_facing, risk_flags, stage}, acceptance, wiki_refs, user_lang, prd_path}`. **절차 지시 금지.**
- worker는 **절차 지시가 와도 playbook 선택은 스스로** 한다 (양방향 방어 — PO의 옛 버릇 회귀 대비).
- return envelope: `persona · task · summary · confidence` + 조건부 `blocked · refused · needs_info/next_question · unresolved[] · files_written[] · memory_notes[] · playbooks_run[]{name, why} · escalate_to{model, effort, playbooks, why}`.

### 메뉴판 사전 매칭 + escalate (routing)

- 각 playbook frontmatter가 `when`(trigger)과 `model_floor/effort`를 선언 → CLI가 persona별 `_index.md` 메뉴판을 **생성** (doctor가 frontmatter와 어긋나면 검출).
- **PO는 dispatch 전 change_meta를 메뉴판에 조회**해 걸릴 만한 playbook들의 floor 최댓값으로 띄운다. 판단 행위는 PO에, 지식 소유는 persona에.
- 사전 판단이 빗나가면 worker가 `escalate_to`로 반환 → PO가 그 tier로 재dispatch. 상향 오차는 공짜(가볍게 돌고 끝), 하향 오차만 haiku 1회 비용.
- PO의 routing bias는 위키 learning 페이지에서 (calibration-log 폐지).

### worktree 격리 (기본 in-place, 트리거 3개에서만)

① 병렬 dev 2개가 겹칠 수 있는 영역 ② 실험적/파괴적 refactor(통째 폐기 가능성) ③ 동일 프로젝트 두 번째 PO 인스턴스.
구현은 Agent dispatch의 네이티브 worktree 격리 옵션 사용 — full의 worktree 생성/gc 스크립트 일체 불요.

### dev↔QA 루프

impl 후 user-facing/risky 변경은 QA 자동 dispatch(확인 없음), 재시도 cap ~3, worker 간 직접 호출 없음(PO 단일 창구 유지).

---

## 5. Playbook 스키마

```markdown
---
name: grill
persona: qa
when: "risk_flags 有 · refactor · load-bearing 변경"     # 메뉴판 trigger 열
model_floor: sonnet
effort: medium
---
# Grill — 적대적 검증
(절차 본문: worker만 읽는다. PO는 frontmatter에서 생성된 메뉴판만 본다.)
```

persona별 초기 구성:

| persona | playbooks | 이식 원천 (full) |
|---|---|---|
| qa | smoke · grill · security-pass · live-verify · ds-conformance | security-6, surface-config, qa/habit 모드 |
| developer | plan-first · implement · code-review · refactor · bugfix | (신설 — full은 28줄뿐이었음, §5b) |
| designer | prd-clarity · ds-3up · hifi · ds-conformance · brand-assets | prd-clarity-loop, phase2-3 S1 criteria, anti-default, design-review 루브릭 |
| po | curate-wiki · retro · readiness-dispatch | (신설) |

### 5b. Developer discipline — 도입하는 개발 문화

| 문화 | prdt 형태 |
|---|---|
| Conventional Commits | `feat:/fix:/refactor:` — git log가 기계가 읽는 작업 원장. contracts에 규칙 |
| Definition of Done | build·lint·typecheck·해당 테스트 green + acceptance 검증 — contracts에 명문화 |
| Fresh-eyes review | risk 변경만, **새 세션** developer가 code-review playbook 실행 (작성자≠리뷰어) |
| Tidy First (Kent Beck) | refactor 커밋과 기능 커밋 분리 — refactor playbook 1원칙 |
| ADR | 위키 decision 페이지가 곧 ADR. dev의 아키텍처 선택 → memory_note → decision 페이지 |
| Blameless post-mortem | Ship patch로 잡은 라이브 버그마다 learning 페이지 1개 ("왜 로컬 green이 못 잡았나" 포함) |

TDD는 doctrine(철학)에 두고, playbook에서는 "로직/회귀 위험 영역 test-first, UI 글루는 판단"으로 실용화.

---

## 6. Ticket-lite

- 경로 `docs/tickets/<version>/T-NNN.md`. **md = SoT** (git 이력·worker 접근성·무도구 생존성), **SQLite = 파생 인덱스** (`.prdt/index.db` tickets 테이블).
- frontmatter (7±1): `id · slug · type(design|impl|qa|ops) · status(open|done|dropped) · assignee · feature? · created/closed`. **frontmatter는 PO만 쓴다** (worker는 body만).
- body 3섹션: `## Request` / `## Acceptance` / `## Outcome`. 진행 노트도 body가 겸함 → **briefs/ 폐지**.
- status는 3값 enum. blocked·review는 상태가 아니라 open인 채로 적는 서사. **인덱싱 시 CHECK 제약이 enum을 기계 검증** — lint hook 불요.
- `blocked` 장기화·전이 이상은 doctor가 경고.

### 히스토리 3층

| 층 | 무엇 | 어디 |
|---|---|---|
| 사실 | raw ticket | `docs/tickets/**` (md, git) |
| 질의 | 집계·검색 (`prdt history`, `prdt tickets --feature auth`) | index.db (파생) |
| 서사 | 기능별 living page `feature--<slug>.md` (full feature-history의 기능 단위 분해) · 버전 요약 `retro--v<N>.md` | 위키 |

ritual(retro·readiness·큐레이션)은 ticket을 만들지 않는다 — 위키 log 1줄. artifact가 있는데 참조 ticket이 없으면 doctor가 경고(디자인 단계 ticket 누락 문제의 처방).

---

## 7. Wiki — promotion gate의 대체물

```
docs/wiki/
├── index.md          # 파생물: CLI가 frontmatter에서 생성. PO turn-open에 읽는 유일한 것
├── inbox.md          # turn close 시 memory_notes 1줄 append (원본 그대로, 싸고 유실 없음)
├── log.md            # append-only: ingest/lint/ritual 기록
├── decision--*.md    # 결정 (= ADR). 번복은 supersede 링크
├── fact--*.md        # 안정적 사실 (스택·배포 타겟·제약)
├── learning--*.md    # 라우팅/품질 교훈 (routing bias 원천, calibration-log 대체)
├── feature--*.md     # 기능별 living page
└── retro--v*.md      # 버전 회고
```

- frontmatter: `title · type · status(live|superseded) · version · links[]` + 본문 `[[wikilink]]`.
- **2단 큐레이션**: turn close = inbox append만 / stage boundary(주로 Retro) = 통합 — 기존 페이지 갱신·cross-link·모순 flag·index 재생성. 새 파일 남발이 아니라 기존 페이지 갱신이 기본 (Karpathy: ingest는 기존 페이지 10~15개를 갱신하는 행위).
- **검색**: SQLite FTS5, **trigram tokenizer**(한글 대응). `prdt wiki search "<query>"` — worker가 필요한 지식을 **pull**로 당겨감 (PO push 의존 축소). vector는 검색 인터페이스만 추상화해 두고 v1 제외 (임베딩 API 의존성 회피; 나중에 백엔드 무손실 교체).
- **cross-project store(옛 Tier 2) 없음** — YAGNI 자기 적용. universal 교훈은 overrides(§8)에 사용자가 직접.
- 큰/비가역 결정만 기록 전 사용자 confirm (lite 규칙 유지).

---

## 8. Overrides — 사용자 커스터마이징 overlay

- 주입 = `core habit → ~/.prdt/overrides/<persona>.md`(있으면) 순서로 연결, **last-wins**.
- 사용자는 core 파일을 절대 수정하지 않음 → `git pull` 충돌 원천 차단.
- root Claude 자체 메모리에는 의존하지 않는다 (prdt 시야 밖 · 엔진 종속 · 큐레이션 불가). 자동 보너스로만 취급.

---

## 9. 강제 장치 — hook 3 + doctor

**hook (전부 기계적, 판단 개입 없음):**
1. session-start discipline 주입 (doctrine.md + contracts + habit + overrides + 메뉴판)
2. post-compact 재주입 (긴 세션에서 규율 증발은 판단으로 못 막음)
3. post-dispatch state 기록 (session_id 등 — statusline에서 부수효과 분리 이관, §10)

**`prdt doctor` (non-blocking lint, Retro/boundary ritual + 수동 실행):**
- ticket: enum 위반 · 고아 ticket · artifact 있는데 참조 ticket 없음 · blocked 장기화
- wiki: orphan 페이지 · superseded 참조 · inbox 적체 · index 불일치
- discipline: 파일 cap 초과(§11) · 메뉴판↔frontmatter 불일치
- state: po-state shape · stage 값

full hook 18개의 나머지는 처분표(§12)에서 contract 승격 / playbook 이동 / doctor 흡수 / 사유 있는 폐기로 정리.

---

## 10. CLI · 온보딩 · statusline

- `prdt` 첫 실행 = **3항목 인터랙티브 init을 PO 실행 전에 완료**: slug 확인(기본값 폴더명) → 첫 버전 v1 → stage=define. GUI 온보딩과 같은 순서, **같은 init 모듈 공유**.
  (full의 결함: version이 P1까지 미설정 → statusline이 `if not version: exit` → 침묵. init이 결정론적으로 끝나므로 prdt는 0초부터 표시.)
- statusline 포맷: `<slug> · <stage> <done>/<open+done> · T-NNN <task>→<persona> · <branch>`
  - 추가: slug, 진행 task+담당 persona (full은 주석에만 있고 코드는 dead variable)
  - 제거: "phase N:" 숫자
  - **순수 표시 전용** — full statusline에 숨어 있던 usage-state 기록·cost turns.jsonl 기록 부수효과는 hook #3으로 이관.
- 서브커맨드: `prdt init · doctor · wiki search|reindex|lint · tickets [--version|--feature] · history · migrate`.

## 11. 토큰 예산 cap (doctor가 경고)

| 파일 | cap |
|---|---|
| doctrine.md | ≤20줄 |
| contracts.md | ≤80줄 |
| PO habit | ≤60줄 |
| worker habit | ≤40줄 |
| playbook 메뉴판 | ≤15줄/persona |
| wiki index | 1줄/페이지 |
| playbook 본문 | ≤80줄 (초과 시 분할) |

full의 교훈: cap을 자백("~137/100 breach")만 하고 방치 → doctor가 기계 검출로 차이를 만든다. 비대 파일 분화는 Retro ritual의 정규 항목.

---

## 12. 실행 계획

**전략 = 재구성 + 자산 이식** (in-place 수술 아님): productune repo의 v1 브랜치에서 새 트리를 새 경로·새 이름으로 작성. 기존 full/lite는 flip까지 무수정. main(GUI 작업 진행 중)을 주기 merge — 새 경로라 충돌 최소. 롤백 = flip 되돌리기.

1. **처분표 (disposition table)** — hook 18개 + PO bookshelf 규칙 각각: `contract 승격 / playbook 이동 / hook 유지(3) / doctor 흡수 / 폐기(사유)`. 유실을 "실수"가 아닌 "결정"으로.
2. **GUI↔discipline 결합 감사** — GUI가 `pdt-po` 에이전트명·po-state 스키마·ticket 경로를 하드코딩한 지점 목록화 (flip 시 어댑터 수정 범위 확정). v1 작업 초반 1회.
3. **코어 구축** — 트리·contracts·doctrine.md·habit들·playbook 이식·prdt CLI(init/wiki/doctor)·hook 3종·statusline.
4. **계층 검증** — ① VM smoke (lite 방식 무인 dogfood) → ② 기존 full 프로젝트 시나리오 재현 1개 → ③ 실프로젝트 1개 v1 병행 운영.
5. **마이그레이션 도구** (`prdt migrate`) — full: po-state v2→prdt shape, tickets 이식, calibration-log→learning 페이지, tier1 bookshelf→위키. lite: memory.md 4섹션→위키 페이지 분해. **옵트인** (flip이 기존 프로젝트를 강제 전환하지 않음).
6. **flip** — install이 prdt-* 설치 + pdt-*/pdtl-* 폐기 안내. old full은 그 시점까지 치명 버그 외 freeze(단, GUI는 main에서 계속 → merge로 유입).

### Dogfood 교정 프로토콜

일탈 발견 → 원인 분류 → 처방: 규칙이 안 보였다(항상 주입층으로 승격) / 모호했다(재작성+반례) / 판단과 충돌했다(설계 수정 — 규칙이 틀림) / 알고도 반복 위반(그때만 doctor→warn hook→block hook). 전 건 위키 learning 기록.

**Watchlist (고위험 일탈 지점, 런마다 채점):**
- PO가 메뉴판 무시하고 절차 직접 지시 (full 버릇 회귀)
- worker가 escalate_to 대신 무리한 저품질 반환
- PO의 inbox 큐레이션 적체 / Retro ritual 생략
- 무인 모드에서 load-bearing fork 무확인 통과
- designer 경로 일탈 (lite 흉터 — contracts 상주로 방어)
- ticket frontmatter enum 위반 (index-time 검증이 잡는지 확인)

## 13. v1 스코프 계약

**In**: 위 전부.
**Out (v1.1+)**: vector search 백엔드 · cross-project wiki(`~/.prdt/wiki/`) · codex 엔진 · 팀/멀티유저 · GUI의 prdt 네이티브 재작업(어댑터만) · skill 시스템 재편(기존 skill은 playbook이 참조만).
스코프 추가 요구는 이 문서 개정으로만 — "이왕 하는 김에" 금지 (doctrine: YAGNI).
