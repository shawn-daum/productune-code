# productune

> 오케스트라처럼 — 들으면서 곡(제품) 을 tune 해 나가는 컨셉. 한 명의 시니어 PO + 3 명의 전문가 페르소나 (구 4명 — planner 는 PO 안으로 흡수) + 인간형 3-tier 기억 + Real Engineering 워크플로 — 모두 bash + markdown 으로.

## 비전

**개발에 잘 모르는 기획자가 프로덕트를 성공적으로 만들 수 있는 툴.**

타깃: 스펙 / 구현난이도 추정은 가능하지만 CLI 미숙 + 복잡 개발지식 X 인 기획자. "성공적으로" = 단순 동작이 아니라 PRD acceptance criteria 만족 + 사용자에게 가치 전달.

3-phase 롤아웃: **Phase 1 (지금) — CLI 핵심** / Phase 2 — dogfood / Phase 3 — UI 화. 자체 PRD 는 [`docs/prd/productune.md`](./prd/productune.md).

---

## 왜 만들었나

### 문제 1 — 단일 페르소나의 컨텍스트 오염
Claude Code 한 세션으로 디자인·구현·QA 다 시키면:
- 디자이너 모드일 때 했던 결정이 개발 단계에서 흐려짐
- 한 컨텍스트 안에 이질적 작업이 섞이면 모델이 평균값으로 수렴
- "이 프로젝트의 디자인" 과 "다른 프로젝트의 옛 디자인" 이 한 메모리에 뒤섞임

### 문제 2 — "그냥 시키기" 의 한계
사용자가 "X 좀 해줘" 한 줄 던지면:
- 누가 plan 짜고 / 디자인 하고 / 구현 하고 / 검증할지 사용자가 매번 결정
- 피드백 ("그건 별론데") 받으면 PR 다시 만들고 처음부터 재실행
- 진척 가시성 없음, 완료 시점도 모호

### 문제 3 — Real PO 행동의 부재
다년차 PO 가 자연스레 하는 일들이 LLM 워크플로엔 없음:
- 모호한 요청 복창 확인
- 리스크 영역 자발 플래그
- 디자인 산출물 → 구현 → "디자인 의도대로 구현됐나" cross-check
- 사용자 성향 학습 ("이 사람은 짧은 요약 선호", "테스트 항상 요구")

→ 이 3개를 한 번에 푸는 게 목표.

---

## 핵심 아이디어 3개

### 1. 다년차 PO 가 멀티 페르소나를 부린다

```
사용자 ─한 문장─▶ productune (PO, Codex 또는 Claude Code 선택)
                   │   ├ 자체 decompose / risk-flag / pipeline (구 my-planner 흡수)
                   │
                   ├─ pdt-designer   (UX 원칙 / Brand / DS / docs/design/*.md, default opus)
                   ├─ pdt-developer  (코드 구현, default sonnet)
                   └─ pdt-qa         (lint/build/test, default haiku)
                   │
사용자 ◀─≤5 bullet─ PO 가 결과 합성
```

PO 는 코드 안 짜고 디자인도 안 함. PRD 수립 + 라우팅 + gate + 합성 + 피드백 처리 + 티켓 관리.

### 2. 인간 기억 구조 닮은 3-tier 메모리

| 계층 | 범위 | 영속성 | 어디에 |
|---|---|---|---|
| **Session** | 한 task | 휘발성, task 끝나면 닫힘 | Claude Code 세션 (UUID) |
| **Project** | 한 repo | 프로젝트 전환 시 격리 | `docs/<persona>/*.md` (git commit) |
| **Wiki** | persona 글로벌 | 영속, 시간 가중 | Graphiti KG (`group_id=persona-<name>`) |

핵심 제약: **"디자이너가 옛 프로젝트 디자인을 새 프로젝트에서 바로 떠올리면 안 됨"** — project tier 가 디렉토리로 물리 격리. wiki 에는 *일반화된 원칙* 만 승격 ("consumer apps prefers pastel" 같은 거).

### 3. Task = Session 단위로 자연스러운 경계

새 작업 = 새 세션. 같은 작업의 follow-up = 같은 세션 resume. "어제 만든 X 다시" = past_tasks 부활. 인공적 turn-count rotation 불필요.

---

## 기존 Claude Code 와 무엇이 다른가

| | 기본 Claude Code | productune |
|---|---|---|
| 페르소나 | 단일 세션, 한 명이 다 함 | 3 명 전문가 + PO (planner 흡수) |
| 위임 결정 | 사용자가 매번 직접 | PO 가 자동 라우팅 + adaptive gate |
| 메모리 | MEMORY.md + 세션 transcript | 3-tier (session/project/wiki) + 페르소나별 격리 |
| 피드백 처리 | 같은 세션 안에서 응답 | 어떤 페르소나 소관인지 PO 가 판정 → 그 페르소나만 resume |
| 권한 | 한 페르소나가 다 가짐 | 페르소나별 좁은 allow-list (`tools: Bash(npm run *), ...`) |
| 진화 메커니즘 | 수동 system prompt 수정 | PO 가 실패 패턴 감지 → "pdt-qa 모델 sonnet 으로 올릴까요?" 자발 제안 |
| 모델 선택 | 사용자 수동 / 페르소나 frontmatter 고정 | PO 가 task 난이도 → tier 매핑 (OSS 7-level), `xhigh` effort 까지 4 단계 |
| 품질 검증 | 사용자 피드백으로만 | 페르소나 confidence + unresolved 자동 보고 → PO 가 retry / skill / 진행 3-option |
| 워크플로 | freeform | Real Engineering: PRD → Test → Issue → 구현 → Refactor (mattpocock skill 자동) |
| 병렬 작업 | 같은 cwd 두 세션 = race | `productune` 가 자동 git worktree 분리 |
| Task lifecycle | conversation 그대로 흐름 | ticket 단위 영속화 (current_round / current_task / past_tickets) → docs/tickets/ git-versioned |

---

## OpenClaw 같은 third-party harness 와 무엇이 다른가

OpenClaw 는 2026-04-04 Anthropic 가 차단한 카테고리:
- **자체 코딩 에이전트 CLI** (Claude Code 의 경쟁 제품)
- 사용자 Claude 구독의 OAuth 토큰을 자기네 클라이언트가 써서 Anthropic API 직접 호출
- Anthropic 입장에선 "구독 인증으로 외부 클라이언트가 우리 인프라 쓰는 것" → 가격 모델 파괴

productune 은:
- **bash 스크립트 + markdown 페르소나 정의** 만 추가
- LLM API 호출 주체 = `claude` (Anthropic 자체 CLI). OAuth 토큰 외부 노출 0.
- Anthropic 입장에서 보이는 트래픽 = 정상 Claude Code 사용. `--print` 헤드리스 모드는 Anthropic 이 공식 권장.
- 같은 logic 으로 Codex 도 본인 ChatGPT 구독 정상 사용.

→ "harness 가 갖춰야 할 거의 모든 슬롯을 채우면서, Anthropic 의 ToS 선 안에 명백히 들어가는 lightweight implementation".

---

## UX flow

### 첫 셋업 (한 번)

```sh
git clone <repo> ~/<your-path>/productune
cd ~/<your-path>/productune
bash scripts/install.sh
```

**install.sh 가 인터랙티브로 묻습니다:**

```
[install] Pick a default PO engine for `my-po`:
  [1] codex   — OpenAI 구독으로 PO, Claude 구독으로 페르소나 (비용 분산)
  [2] claude  — Claude 구독으로 PO + 페르소나 (100% Anthropic, ToS 가장 깔끔)
  [Enter]     — 일단 codex (나중에 변경 가능)
```

PATH 등록 한 줄:
```sh
echo "export PATH=\"$PWD/scripts:\$PATH\"" >> ~/.zshrc && source ~/.zshrc
```

선택 — 장기 메모리 (Graphiti) 까지 켜려면:
```sh
ollama pull nomic-embed-text
bash scripts/setup-graphiti.sh
```

### 평소 사용 — 한 명령

```sh
cd ~/<my-project>
my-po
```

Codex/Claude TUI 가 뜨고, 한 문장 던지면:

```
> 로그인 모달에 비밀번호 찾기 링크 추가해줘.

[PO] 새 task 'login-forgot-pw' 시작합니다.
→ planning 2 개 작업 (pdt-designer + pdt-developer)
→ delegating to pdt-designer for task #1 (model=opus, effort=high — UI 디자인)...
✓ pdt-designer: docs/design/login-forgot-pw.md
→ delegating to pdt-developer for task #2...
✓ pdt-developer: 2 files changed
→ design-compliance cross-check (pdt-designer)...
✓ matches intent
→ delegating to pdt-qa...
✓ pdt-qa: pass

## Changes
- src/components/LoginModal.tsx: 비번 찾기 링크 추가
- docs/design/login-forgot-pw.md: 디자인 명세

## QA
- lint: pass / build: pass

## Follow-ups
- 수동 확인: /login 에서 클릭 → 라우팅 동작
```

### 피드백 turn

```
> 그 디자인 좀 더 심플하게.

[PO] pdt-designer 후속으로 보고 그 세션 resume.
→ delegating to pdt-designer (resumed)...
✓ pdt-designer: docs/design/login-forgot-pw.md (v2)
→ pdt-developer (디자인 변경 반영)...
→ pdt-qa (재검증)...
[PO] ## Changes ...
```

PO re-decompose 안 함 (피드백은 디자인 세부 변경만). pdt-designer 만 resume → 영향받는 dev/pdt-qa 만 chain.

### 새로운 작업 / 옛 작업 부활

```
> 이제 README 에 ## License 섹션 추가해줘.
[PO] 새 task 'add-license-section' 시작합니다. ('login-forgot-pw' 는 archive)
...

> 어제 만든 sum.js 좀 다시 손대자.
[PO] 이건 'add-sum-helper' 후속처럼 보여요. 이어서 갈까요? (y/n)
> y
[PO] past_task 복원, pdt-developer 의 옛 session resume.
```

### 같은 프로젝트 두 번째 터미널 (자동 worktree 분리)

```sh
# 터미널 1: my-po 작업 중
# 터미널 2:
cd ~/<my-project>
my-po
[my-po] another PO is running on /Users/.../my-project (pid 12345)
[my-po] creating worktree at .../my-project-my-po-20260427-... on branch my-po/...
codex › "결제 화면 토스페이 추가"   # 터미널 1과 격리됨
```

종료 시 한번 묻기:
```
[my-po] 🧹 2 my-po worktree(s) safe to remove.
[my-po] clean up the safe ones now? [y/N]
```

명령으로도: `my-po gc` (dry-run), `my-po gc -y` (자동 정리).

### 타임라인 보기

```
> 지금까지 한 작업 타임라인 정리해줘.

## 프로젝트 타임라인 (my-project)

2026-04-23 14:30–15:10  login-forgot-pw          [done]
  요청  : 로그인 모달 비번 찾기 링크
  플로우: PO planning ✓ → pdt-designer ✓ → pdt-developer ✓ → pdt-qa ✓
  결과  : 2 files shipped. Designer copy 'TBD' 제외 모든 항목 만족.

2026-04-24 09:00–09:12  fix-readme-typo          [done]
  ...

진행중: add-license-section                       [in-progress]
  플로우 (지금까지): pdt-developer (turn 2) ⏳
```

PO 가 persona 호출 0번으로 `po-state.json` 만 읽고 렌더링.

---

## 기술 스택 (총 ~600 LoC bash + ~500 LoC markdown)

| 컴포넌트 | 구현 |
|---|---|
| PO 오케스트레이터 | Codex CLI 또는 Claude Code (사용자 선택) |
| 페르소나 4종 | `agents/{productune,pdt-designer,pdt-developer,pdt-qa}.md` + frontmatter (planner role 흡수) |
| 페르소나 호출 | `claude --agent X --print --output-format json` |
| 상태 저장 | `<project>/.productune/po-state.json` (current_task / past_tasks / recent_turns) |
| 사용자 성향 메모 | `~/.productune/po-memory.md` |
| 단기 기억 (session) | Claude Code 네이티브 `--resume <id>` |
| 중기 기억 (project) | repo 안 markdown (`docs/<persona>/*.md`) |
| 장기 기억 (wiki) | Graphiti MCP (FalkorDB + Ollama 로컬) |
| 병렬 격리 | `git worktree` + `<root>/.productune/po.lock` |
| 권한 모델 | persona frontmatter 의 `tools:` 패턴 allow-list |
| Doctrine | `~/.productune/po-instructions.md` (≤500 줄) |

---

## 한계 / 다음 단계

**해결됨 (2026-04-28)**
- 메모리 압축 자동화 — `install.sh` 가 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` 을 `~/.productune/productune.env` 에 기본값으로 박아두고 `my-po` 가 자동 export. shell rc 편집 불필요. (직접 `claude --agent` 호출 시엔 미적용 — 한계로 남음.)
- Graphiti 추출 품질 — install.sh 옵션 [3] Local description 보강 (대체 모델 `gemma2:27b`, `qwen2.5:32b` 추천). setup-graphiti.sh sanity-check 에 호스티드 옵션 ([2] Anthropic) fallback 안내 추가.
- PO disposition 명시화 — silent 분류 폐지. 모든 turn 에 `→ continuing '<slug>'` / `→ new task '<slug>'` 1줄 trace + 사용자 override prefix (`/new`, `/continue`, `/resume <slug>`). 교정이 ≥2번 누적되면 `~/.productune/po-memory.md` 에 패턴 학습.

**여전히 한계**
- 직접 `claude --agent my-X` 호출 시 autocompact env 미상속 — wrapper 안 거치니 의도된 한계. shell rc 직접 추가로 보완.
- Pure-local Graphiti 의 entity 추출 품질은 호스티드보다 거칠 수 있음 — 옵션 [2] Anthropic 으로 추출만 호스티드로 올리거나, 더 큰 로컬 모델로 보완.
- "Hosted LLM + Ollama embed" 형태의 진정한 hybrid — Graphiti 의 default `config.yaml` 이 LLM/embed 가 같은 `OPENAI_API_URL` env 를 공유하는 구조라 별도 config 생성 작업 없이는 불가. 별도 plan 필요.
- Disposition 휴리스틱의 "When in doubt" 케이스 — 명시 trace + override 로 교정창은 짧아졌지만, 분류 자체의 정확도는 휴리스틱 한계 안에 있음. LLM 기반 분류는 비용/지연 trade-off 로 미루기.

**검토 가능한 다음 step**
- 다중 사용자 / 팀 — `~/.productune/po-memory.md` 가 single-user. 팀 공유하려면 별도 sync 필요
- 시각적 timeline — 지금은 텍스트 렌더링. web UI 또는 Mermaid gantt 차트 출력
- 페르소나 자동 평가 — 지금은 사용자 피드백으로만 evolution 트리거. 자동 quality metric 가능

---

## 한 줄 요약

> Anthropic 가 권장하는 사용 패턴 안에서, 시니어 PO 의 워크플로를 bash + markdown 으로 재현한 lightweight productune. 외부 SaaS / 새 런타임 / 새 인프라 0개. `git clone + bash install.sh + my-po` 세 줄로 시작.

**Repo**: https://github.com/shawn-kim-axz/productune
