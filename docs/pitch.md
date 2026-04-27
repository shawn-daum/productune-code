# coolchestration

> 한 명의 시니어 PO + 4명의 전문가 페르소나 + 인간형 3-tier 기억 — 모두 bash 스크립트와 markdown 으로.

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
사용자 ─한 문장─▶ PO (Codex 또는 Claude Code)
                   │
                   ├─ planner    (요구 분해, 영향 파일 매핑)
                   ├─ designer   (아키텍처/UX 설계, docs/design/*.md)
                   ├─ developer  (코드 구현)
                   └─ qa         (lint/build/test 검증)
                   │
사용자 ◀─≤5 bullet─ PO 가 결과 합성
```

PO 는 코드 안 짜고 디자인도 안 함. 라우팅·gate·합성·피드백 처리만.

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

| | 기본 Claude Code | coolchestration |
|---|---|---|
| 페르소나 | 단일 세션, 한 명이 다 함 | 4 명 전문가 + PO 오케스트레이터 |
| 위임 결정 | 사용자가 매번 직접 | PO 가 자동 라우팅 + adaptive gate |
| 메모리 | MEMORY.md + 세션 transcript | 3-tier (session/project/wiki) + 페르소나별 격리 |
| 피드백 처리 | 같은 세션 안에서 응답 | 어떤 페르소나 소관인지 PO 가 판정 → 그 페르소나만 resume |
| 권한 | 한 페르소나가 다 가짐 | 페르소나별 좁은 allow-list (`tools: Bash(npm run *), ...`) |
| 진화 메커니즘 | 수동 system prompt 수정 | PO 가 실패 패턴 감지 → "qa 모델 sonnet 으로 올릴까요?" 자발 제안 |
| 병렬 작업 | 같은 cwd 두 세션 = race | `my-po` 가 자동 git worktree 분리 |
| Task lifecycle | conversation 그대로 흐름 | current_task / past_tasks / 자동 timeline 렌더링 |

---

## OpenClaw 같은 third-party harness 와 무엇이 다른가

OpenClaw 는 2026-04-04 Anthropic 가 차단한 카테고리:
- **자체 코딩 에이전트 CLI** (Claude Code 의 경쟁 제품)
- 사용자 Claude 구독의 OAuth 토큰을 자기네 클라이언트가 써서 Anthropic API 직접 호출
- Anthropic 입장에선 "구독 인증으로 외부 클라이언트가 우리 인프라 쓰는 것" → 가격 모델 파괴

coolchestration 은:
- **bash 스크립트 + markdown 페르소나 정의** 만 추가
- LLM API 호출 주체 = `claude` (Anthropic 자체 CLI). OAuth 토큰 외부 노출 0.
- Anthropic 입장에서 보이는 트래픽 = 정상 Claude Code 사용. `--print` 헤드리스 모드는 Anthropic 이 공식 권장.
- 같은 logic 으로 Codex 도 본인 ChatGPT 구독 정상 사용.

→ "harness 가 갖춰야 할 거의 모든 슬롯을 채우면서, Anthropic 의 ToS 선 안에 명백히 들어가는 lightweight implementation".

---

## UX flow

### 첫 셋업 (한 번)

```sh
git clone <repo> ~/<your-path>/coolchestration
cd ~/<your-path>/coolchestration
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
→ delegating to planner...
✓ planner: 2 tasks (designer + developer)
→ delegating to designer for task #1...
✓ designer: docs/design/login-forgot-pw.md
→ delegating to developer for task #2...
✓ developer: 2 files changed
→ design-compliance cross-check (designer)...
✓ matches intent
→ delegating to qa...
✓ qa: pass

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

[PO] designer 후속으로 보고 그 세션 resume.
→ delegating to designer (resumed)...
✓ designer: docs/design/login-forgot-pw.md (v2)
→ developer (디자인 변경 반영)...
→ qa (재검증)...
[PO] ## Changes ...
```

planner 다시 안 부름. designer 만 resume → 영향받는 dev/qa 만 chain.

### 새로운 작업 / 옛 작업 부활

```
> 이제 README 에 ## License 섹션 추가해줘.
[PO] 새 task 'add-license-section' 시작합니다. ('login-forgot-pw' 는 archive)
...

> 어제 만든 sum.js 좀 다시 손대자.
[PO] 이건 'add-sum-helper' 후속처럼 보여요. 이어서 갈까요? (y/n)
> y
[PO] past_task 복원, developer 의 옛 session resume.
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
  플로우: planner ✓ → designer ✓ → developer ✓ → qa ✓
  결과  : 2 files shipped. Designer copy 'TBD' 제외 모든 항목 만족.

2026-04-24 09:00–09:12  fix-readme-typo          [done]
  ...

진행중: add-license-section                       [in-progress]
  플로우 (지금까지): developer (turn 2) ⏳
```

PO 가 persona 호출 0번으로 `po-state.json` 만 읽고 렌더링.

---

## 기술 스택 (총 ~600 LoC bash + ~500 LoC markdown)

| 컴포넌트 | 구현 |
|---|---|
| PO 오케스트레이터 | Codex CLI 또는 Claude Code (사용자 선택) |
| 페르소나 4종 | `agents/{planner,designer,developer,qa}.md` + frontmatter |
| 페르소나 호출 | `claude --agent X --print --output-format json` |
| 상태 저장 | `<project>/.codex/po-state.json` (current_task / past_tasks / recent_turns) |
| 사용자 성향 메모 | `~/.codex/po-memory.md` |
| 단기 기억 (session) | Claude Code 네이티브 `--resume <id>` |
| 중기 기억 (project) | repo 안 markdown (`docs/<persona>/*.md`) |
| 장기 기억 (wiki) | Graphiti MCP (FalkorDB + Ollama 로컬) |
| 병렬 격리 | `git worktree` + `<root>/.codex/po.lock` |
| 권한 모델 | persona frontmatter 의 `tools:` 패턴 allow-list |
| Doctrine | `~/.codex/po-instructions.md` (≤500 줄) |

---

## 한계 / 다음 단계

**지금 잘 안 되는 것**
- 메모리 압축의 자동화 — 사용자가 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` 직접 세팅 필요
- Graphiti wiki 검색 품질 — Ollama 로컬 모델 (gemma4:26b) 의 entity 추출이 OpenAI 모델보다 거칠 수 있음
- PO 의 task disposition 휴리스틱 — 가끔 continuation 으로 잘못 판단 (사용자가 "이거 후속이에요?" 한 줄로 교정)

**검토 가능한 다음 step**
- 다중 사용자 / 팀 — `~/.codex/po-memory.md` 가 single-user. 팀 공유하려면 별도 sync 필요
- 시각적 timeline — 지금은 텍스트 렌더링. web UI 또는 Mermaid gantt 차트 출력
- 페르소나 자동 평가 — 지금은 사용자 피드백으로만 evolution 트리거. 자동 quality metric 가능

---

## 한 줄 요약

> Anthropic 가 권장하는 사용 패턴 안에서, 시니어 PO 의 워크플로를 bash + markdown 으로 재현한 lightweight orchestration. 외부 SaaS / 새 런타임 / 새 인프라 0개. `git clone + bash install.sh + my-po` 세 줄로 시작.

**Repo**: https://github.com/shawn-kim-axz/coolchestration
