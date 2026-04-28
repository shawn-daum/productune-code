# productune end-to-end 테스트

점진적 6-phase 테스트 플랜. 각 phase 가 통과해야 다음 phase 로 — 건너뛰면 실패 진단이 어려워짐. **Phase 6 통과 = Phase 1 (CLI MVP) 합격 = Phase 2 (사용자 dogfood) 진입 자격**.

## Phase 0 — 사전 준비 (한 번만, 약 5분)

```sh
# 0.1 — Graphiti 가 쓸 임베딩 모델 pull
ollama pull nomic-embed-text

# 0.2 — Graphiti infra 기동 (FalkorDB 컨테이너 + graphiti clone + uv sync)
bash <productune-clone>/scripts/setup-graphiti.sh   # clone 한 경로 그대로
```

**합격 기준:**
- `docker ps | grep falkordb` 결과에 컨테이너가 Up 상태로 표시
- `ls ~/.graphiti/mcp_server/main.py` 존재
- `ollama list | grep nomic-embed-text` 에 모델이 보임

여기서 실패하면 메모리 관련 phase (2–4) 가 동작 안 함. Phase 1 은 Graphiti 없이도 동작 — MCP spawn 시 경고가 떠도 무시해도 됨.

## Phase 1 — 페르소나 smoke test (약 1분)

Claude Code 가 페르소나를 인식하고 정상 JSON 으로 응답하는지 확인.

```sh
# 1.1 — 인식된 페르소나 목록
claude agents
# 기대: 4 개 user agent — productune / my-designer / my-developer / my-qa
# (my-planner 는 PO 안으로 흡수됨 — 별도 페르소나 없음)

# 1.2 — productune (PO) 자가 introspection
claude --agent productune -p "Describe your role in one sentence and list the JSON fields you produce when planning a task. Return as JSON." --output-format json | jq '.result' -r
# 기대: PO 역할 설명 + tasks, pipeline, risk_flags, user_facing_artifacts, open_questions 같은 필드 언급
```

**합격 기준:** JSON 파싱 성공, 페르소나가 자기 역할을 정확히 식별.

## Phase 2 — 단일 페르소나 task 실 프로젝트 (약 3–5분)

진짜 프로젝트 오염 방지용 임시 디렉토리 사용.

```sh
# 2.1 — 고칠 오타 하나 박힌 일회용 타깃 프로젝트 생성
mkdir -p /tmp/co-test && cd /tmp/co-test
git init -q
cat > README.md <<'EOF'
# Test project
This is a temperery test for the productune setup.
EOF
git add . && git commit -q -m "init"
```

이제 페르소나를 한 번에 하나씩 테스트:

```sh
# 2.2 — productune (PO): 요청 분해 (PO 가 자체적으로 planning — 구 my-planner 역할)
claude --agent productune -p "The README has a typo. Decompose this into tasks (return JSON with tasks array)." --output-format json | jq '.result' -r

# 2.3 — Developer: 실제 fix 수행
claude --agent my-developer -p "Fix the typo in README.md. The misspelling is on line 2." --output-format json | jq '.result' -r
git diff   # 변경 확인

# 2.4 — QA: 검증
claude --agent my-qa -p "Verify the README change. Run git status and git diff, confirm exactly one typo was corrected, nothing else." --output-format json | jq '.result' -r
```

**합격 기준:**
- productune 이 `tasks` 들어 있는 JSON 반환 (planner 역할 흡수)
- Developer 가 README.md 한 글자만 변경 (`temperery` → `temporary`), 그 외 손대지 않음
- QA 가 pass 보고

## Phase 3 — 풀 PO 오케스트레이션 + task 라이프사이클 (약 10–15분)

Codex PO 가 여러 페르소나에 위임하는 흐름 + task 단위 세션 모델 (current_task / past_tasks / 부활 / 타임라인 렌더링) 검증.

> **사전 마이그레이션**: 옛 버전 테스트 스위트로 만든 stale `<project>/.codex/po-state.json` (top-level `persona_sessions` 인 legacy flat schema) 이 남아있으면 먼저 삭제:
>
> ```sh
> rm -f /tmp/co-test/.codex/po-state.json
> ```
>
> PO 가 다음 실행 시 현행 `current_task` / `past_tasks` 스키마로 새로 생성.

```sh
cd /tmp/co-test

# 3.1 — 다시 고칠 거리가 있도록 reset
git reset --hard HEAD~0 >/dev/null 2>&1 || true
cat > README.md <<'EOF'
# Test project
This is a temperery test for the productune setup.

## Features
- adds 2 numbers
EOF
git add . && git commit -q -m "reset" 2>/dev/null || true

# 이전 사이클의 legacy po-state 삭제 (안전 — 세션이 새로 시작됨)
rm -f .codex/po-state.json

# 3.2 — PO 시작 — 셋 중 하나 고르기

# 방법 A (테스트용 권장): 인터랙티브 TUI
codex --profile productune
# → Codex TUI 열림. 아래 prompt 를 TUI 안에서 입력, Enter 로 제출.
# 멀티라인: Shift+Enter 로 줄바꿈, Enter 로 제출. 붙여넣기도 OK.

# 방법 B: 초기 prompt 를 CLI 인자로 함께 던져서 TUI 시작
# prompt 에 backtick 이 있으면 SINGLE quote 사용, 안 그러면 zsh 가 실행해버림:
codex --profile productune 'README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서 `function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.'

# 멀티라인이면 heredoc:
codex --profile productune "$(cat <<'EOF'
README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서
`function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.
EOF
)"

# 방법 C: 완전 비대화형 (스크립팅 / CI 스타일)
codex exec --profile po --output-last-message /tmp/po-out.txt \
  'README 의 오타 하나 찾아서 고치고, `sum.js` 에 `function sum(a,b) { return a+b; }` 를 export 해줘.'
```

어떤 방법을 고르든 PO 에 던질 초기 task 는:

> README 의 오타 하나 찾아서 고치고, 그 다음 `sum.js` 라는 파일 만들어서 `function sum(a,b) { return a+b; }` 를 export 해줘. 테스트는 안 돌려도 되고.

**관찰 포인트:**
1. PO 가 paraphrase 하거나 그대로 진행 (Stage 1 질문 건너뛸 만큼 명확)
2. PO 가 자체 decompose 수행 (planner 역할 흡수) — `→ planning N 개 작업` 또는 trivial 이면 `→ delegating to my-developer (decompose 생략, single-step)` 진척 마커
3. Decomposition 결과 task list (대개 2 개 — 오타 fix + sum.js 생성, 둘 다 `my-developer` 페르소나, "테스트 안 돌려도" 라서 `my-qa` 스킵)
4. ≤3 task + 위험 플래그 없음 → Gate 1 pause 없이 my-developer 로 직진
5. `→ delegating to my-developer...`, `✓ my-developer complete`
6. PO 가 ≤5-bullet 요약으로 마무리

**합격 기준:**
- `git diff` 에 오타 fix + 기대 내용의 `sum.js` 가 보임
- PO 가 페르소나 호출 사이에 진척 마커를 찍음
- 최종 요약은 PO 가 자기 말로 합성한 문장 (raw JSON 덤프 아님)
- PO 가 시작 시 `→ new task '<slug>'` 한 줄 trace 를 찍음
- 실행 후 `cat .codex/po-state.json | jq '.current_task'` 결과에 `slug`, `started_at`, `request_summary`, `persona_sessions.my-developer` (실제 UUID), `persona_session_meta.my-developer.turns ≥ 1` 가 채워져 있음
- `recent_turns` 에 `current_task.slug` 와 일치하는 `task_slug` entry 가 최소 1개

### 3.3 — 후속 turn (같은 task)

**방법 A 또는 B** 로 시작했다면 첫 task 끝나도 Codex TUI 안에 있음 — 그냥 다음 turn 으로 입력. **방법 C** (`codex exec`) 였다면 `codex resume --last` 로 재개.

후속 prompt:

> 어 그리고 `sum.js` 에 음수 들어가면 에러 던지게 수정해줘.

**관찰 포인트:**
- PO 가 새 task 를 시작하지 **않음**. continuation 시그널 ("그", "그리고", `current_task.artifacts` 에 이미 있는 `sum.js` 참조) 감지.
- PO 가 `→ continuing '<slug>'` 1줄 trace 출력. (doctrine 상 silent 분류 금지 — confidence 와 무관하게 trace 필수.)
- PO 자체 re-decompose 안 함 (continuation 이라 기존 plan 재사용).
- `→ delegating to my-developer...` (단독), 세션 resume.
- `✓ my-developer complete` — sum.js 업데이트.

**합격 기준:**
- 위임 전에 `→ continuing '<slug>'` trace 가 보임
- my-developer 만 호출, 새 세션이 아니라 resume 된 세션
- `jq '.current_task.slug' .codex/po-state.json` 가 이전과 **같은 slug** (archive 도, 새 task 도 없음)
- `jq '.current_task.persona_session_meta.my-developer.turns' .codex/po-state.json` 가 1 증가

### 3.4 — 새 task (다른 의도 → archive + 새 current_task)

같은 Codex TUI 에서 진짜 무관한 요청:

> 이제 README 에 "## License" 섹션 추가해서 MIT 라고 적어줘.

**관찰 포인트:**
- PO 가 `→ new task 'add-license-section' (또는 비슷한 slug)` trace 출력 (정확한 표현 유연)
- 이전 task archive: `jq '.past_tasks[-1]' .codex/po-state.json` 결과에 직전 `current_task` 내용 + `ended_at`, `final_status`, `outcome_summary` 가 채워짐
- 새 `current_task` 가 빈 `persona_sessions` 로 할당 (my-developer 가 새 session id 받음, 이전 거 아님)

**합격 기준:**
- `jq '.past_tasks | length' .codex/po-state.json` 가 ≥1
- `jq '.past_tasks[-1].final_status' .codex/po-state.json` 가 `done` / `blocked` / `abandoned` 중 하나
- `jq '.past_tasks[-1].outcome_summary' .codex/po-state.json` 가 1–2 문장 (null 도, raw JSON 도 아님)
- `current_task.slug` 가 archive 된 entry 의 slug 와 다름

### 3.5 — 타임라인 렌더링 (페르소나 호출 0)

같은 TUI 에서:

> 지금까지 한 작업 타임라인 정리해줘.

**관찰 포인트:**
- PO 가 페르소나에 `→ delegating to ...` 를 **하나도** 안 찍음. 답변 전체가 `po-state.json` 만으로 렌더링됨.
- 출력이 시간순으로 그룹화 — `slug`, `started_at — ended_at`, `final_status`, `outcome_summary`, `artifacts` 표시.
- 진행 중인 `current_task` 가 `in-progress` 상태로 함께 표시.

**합격 기준:** 이 turn 에 `→ delegating` 라인 0; 시간순 리스트가 최소 2 entry (`past_tasks[]` 1개 + 현재).

### 3.6 — 과거 task 부활

같은 TUI 에서:

> 어제 만든 sum.js 좀 다시 손대자. 함수 위에 JSDoc 주석 달아줘.

**관찰 포인트:**
- PO 가 `past_tasks` 의 `artifacts` 또는 slug 에서 "sum.js" 매치 검색.
- PO 가 한 줄 propose: `이건 'add-sum-helper' 후속처럼 보여요. 그 task 이어서 갈까요? (y/n)`. `y` 응답.
- 확인 후: PO 가 방금 생성한 `add-license-section` task archive, `add-sum-helper` past entry 를 `current_task` 로 복원 — 이전 `persona_sessions.my-developer` session id 까지 그대로.
- 다음 페르소나 호출이 *원래* my-developer 세션을 resume → dev 가 sum.js 컨텍스트를 "기억" 함.

**합격 기준:**
- 부활 후 `jq '.current_task.slug' .codex/po-state.json` 가 부활된 slug 와 일치
- 부활된 task 의 `my-developer` session id 가 직전 archive 된 것과 동일 (사전에 `past_tasks` 스냅샷 떠놨다면 비교)
- license-section task 가 `past_tasks` 로 이동

### 3.7 — Disposition override prefix

같은 TUI 에서:

```
/new license-redo  README 의 라이선스 섹션 다시 작성. Apache-2.0 으로.
```

**관찰 포인트:**
- PO 가 `/new` prefix 인식, disposition 휴리스틱 전체 스킵.
- `→ new task 'license-redo'` trace 출력.
- 이전 task (current 였던 것) 가 `past_tasks` 로 archive.
- `/new <slug>` 뒤 텍스트 (실제 요청) 만 PO decomposition / 페르소나에 전달.

이어서 같은 TUI 에서:

```
/continue 위에 한 줄 코멘트로 "AS-IS, no warranty." 도 추가해.
```

**관찰 포인트:**
- prompt 에 continuation 대명사가 없어도 `→ continuing 'license-redo'` trace 출력.
- 단일 step / 단일 페르소나 요청이라 PO decomposition 생략 ("→ delegating to my-developer (decompose 생략, single-step)").

이제 `/resume` prefix 테스트 (3.6 에서 `add-sum-helper` 가 past_tasks 에 있다고 가정):

```
/resume add-sum-helper  주석 위에 @example 한 줄 더 보강.
```

**관찰 포인트:**
- `→ resuming 'add-sum-helper'` trace 출력.
- 현재 `license-redo` archive, `add-sum-helper` 가 이전 `persona_sessions` 그대로 `current_task` 로 복원.

**합격 기준:**
- 세 trace (`→ new task`, `→ continuing`, `→ resuming`) 모두 정확한 slug 로 출력
- `jq '.current_task.slug' .codex/po-state.json` 가 가장 최근 prefix 의 slug 와 일치
- `jq '.past_tasks | map(.slug)' .codex/po-state.json` 에 archive 된 slug 들이 시간순으로 정렬

### 3.8 — install.sh 멱등 재실행 + autocompact append

이 sub-phase 는 `productune.env` 를 갈아엎으니 먼저 백업.

```sh
cp ~/.codex/productune.env ~/.codex/productune.env.before-test 2>/dev/null || true
rm ~/.codex/productune.env
bash <productune-clone>/scripts/install.sh   # Enter (engine), Enter (Graphiti) 응답
grep -E 'GRAPHITI_(LLM|EMBEDDER)_PROVIDER|CLAUDE_AUTOCOMPACT|MY_PO_ENGINE' ~/.codex/productune.env
```

**합격 기준:**
- `MY_PO_ENGINE=codex` (default)
- `GRAPHITI_LLM_PROVIDER=openai` (default option [1])
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` (Part A append 가 동작)

멱등성 재확인 — 사용자 override 시뮬레이션을 위해 autocompact 값 수동 변경 후 install.sh 재실행해서 그대로 보존되는지:

```sh
sed -i.bak 's/CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70/CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85/' ~/.codex/productune.env
rm ~/.codex/productune.env.bak
bash <productune-clone>/scripts/install.sh   # 기존 env 파일 인식, 재프롬프트 안 함
grep CLAUDE_AUTOCOMPACT ~/.codex/productune.env
# 기대: CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85 (보존, 70 으로 리셋 안 됨)
```

원래 설정 복원:

```sh
mv ~/.codex/productune.env.before-test ~/.codex/productune.env 2>/dev/null || true
```

## Phase 4 — 메모리 tier (Phase 0 필요)

### 4.1 — Project tier

페르소나가 새로 학습한 게 있을 때 `docs/<persona>/` 에 쓰는지 확인:

```sh
cd /tmp/co-test
ls docs/ 2>/dev/null
# Phase 3 실행 결과로 페르소나가 docs/my-developer/project-notes.md 같은 파일 자동 생성했을 수도
find docs/ -type f 2>/dev/null
```

**합격 기준:** 직전 실행에서 페르소나 1개 이상이 docs/ 파일을 채웠음 (보장은 아님 — promote 할 만한 게 있었느냐에 따라 달림. hard check 라기보단 관찰).

### 4.2 — Wiki tier (Graphiti)

> Note: 이전 doctrine 버전은 `group_id="persona:<name>"` (콜론) 을 썼는데 Graphiti API 가 invalid 로 거절. 현 doctrine 은 `persona-<name>` (대시) 사용. 두 번째 쿼리에서 "Graphiti validation error — colon in group_id" 메시지가 뜨면 Claude Code 가 캐시된/오래된 agent 정의를 로드 중이라는 뜻 — `bash scripts/install.sh` 재실행 후 새 세션 시작.

my-designer 페르소나에 원칙 하나 가르치고 다시 쿼리. 주의: **`claude --agent` 호출 한 번마다 새 세션 생성** — `--resume` 없으면. 즉 두 호출 사이에 지식을 옮기는 건 Graphiti 뿐.

```sh
cd /tmp/co-test
claude --agent my-designer -p "From now on, save this principle to your wiki: 'For consumer-facing apps, prefer pastel color palettes over monotone.'" --output-format json | jq '.result' -r
# 기대: my-designer 가 mcp__graphiti__add_memory 를 group_id=persona-designer 로 호출

# 새 세션에서 retrieval 검증:
claude --agent my-designer -p "Search your wiki for color palette preferences. What do you know?" --output-format json | jq '.result' -r
# 기대: my-designer 가 방금 저장한 사실을 참조
```

**합격 기준:** 두 번째 호출이 다른 Claude 세션인데도 원칙을 retrieve (같은 group_id 안에서 Graphiti 가 세션 간에 영속).

### 4.3 — Bi-temporal 모순

```sh
claude --agent my-designer -p "Update your wiki: actually, I've changed my mind — for consumer apps I now prefer high-contrast monotone palettes, not pastel." --output-format json | jq '.result' -r

# 다시 쿼리:
claude --agent my-designer -p "What do I prefer for consumer app color palettes? Check your wiki." --output-format json | jq '.result' -r
# 기대: 새로운 (monotone) 답. 옛날 (pastel) 은 deprecated/invalidated 로 언급될 수 있음
```

**합격 기준:** 최신 답이 새 사실을 반영. Graphiti 의 temporal 처리가 옛 사실을 자동 후순위화.

### 4.4 — 페르소나 격리

my-developer 가 my-designer 의 palette 지식을 못 보는지 (다른 group_id):

```sh
claude --agent my-developer -p "Search your wiki for color palette preferences. What do you know?" --output-format json | jq '.result' -r
# 기대: 관련 정보 없음 (my-developer 의 group 은 persona-developer 이지 -my-designer 가 아님)
```

**합격 기준:** my-developer 가 빈 결과 또는 "no relevant facts" 반환.

## Phase 5 — 페르소나 진화 (수동, 약 2분)

QA 실패를 가짜로 주입해 PO 의 evolution 제안 트리거:

```sh
cd /tmp/co-test
# 가짜 QA 실패 3개를 프로젝트 po-state 에 수동 주입
mkdir -p .codex
cat > .codex/po-state.json <<'EOF'
{
  "persona_sessions": {},
  "recent_turns": [
    {"ts": "2026-04-23T10:00:00Z", "persona": "my-qa", "task": "verify build", "result": "fail"},
    {"ts": "2026-04-23T11:00:00Z", "persona": "my-qa", "task": "verify lint", "result": "fail"},
    {"ts": "2026-04-23T12:00:00Z", "persona": "my-qa", "task": "verify tests", "result": "fail"},
    {"ts": "2026-04-23T13:00:00Z", "persona": "my-qa", "task": "verify build", "result": "pass"},
    {"ts": "2026-04-23T14:00:00Z", "persona": "my-qa", "task": "verify build", "result": "fail"}
  ]
}
EOF
```

이제 PO 시작, 아무 작은 task 던지기 (CLI 인자로 prompt 함께 던지면 TUI 가 그걸로 시작):

```sh
codex --profile productune 'README.md 에 한 줄 더 추가해줘.'
```

(동등: `codex --profile productune` 만 실행 후 TUI 안에서 입력.)

**관찰 포인트:** 실행 직전에 PO 가 다음 비슷한 안내: "my-qa 가 최근 이 프로젝트에서 4/5 실패. sonnet 으로 올려볼까요? (one-off: `--model sonnet`, 영구: agents/my-qa.md 수정)".

**합격 기준:** PO 가 패턴을 자발적으로 surface 하고 evolution 을 제안 (자동 mutate 안 함).

## Phase 6 — MVP 확립 (Phase 1 완료 합격 기준)

> 이 phase 는 productune 자체의 PRD acceptance criteria 와 동일. 통과해야 Phase 2 (사용자 dogfood) 진입 자격.

### 사전 조건

```sh
# 새 프로젝트 (productune 자기 적용 아닌, 별개 dogfood-style)
mkdir -p /tmp/productune-mvp-test && cd /tmp/productune-mvp-test
git init -q
echo '# MVP test project' > README.md
git add . && git commit -q -m "init"

# productune 명령 + 페르소나 인식 + skill 라이브러리 + Graphiti 모두 준비된 상태여야 함
which productune
claude agents     # productune / my-designer / my-developer / my-qa 4개
ls ~/.claude/skills/mattpocock ~/.claude/skills/phuryn  # skill 디렉토리 존재
```

### 6.1 — Real Engineering 워크플로 한 round 완주

기획자 역할로, 단일 명령 + 한 문장으로 시작:

```sh
productune
> "TODO 앱 MVP — 추가 / 완료체크 / 삭제 + 로컬 저장. 만들고 싶어."
```

**관찰 포인트 (PO 가 자발적으로 stage transition announce):**

```
→ Stage: PRD 작성 (productune Why-essential, opus, ⚡xhigh)
   ✓ to-prd skill auto-invoke + grill-me 식 문답 시작
   ✓ docs/prd/<your-slug>.md 또는 docs/prd/productune.md round 헤더 추가
→ Stage: Test 정의 (my-qa What, haiku)
   ✓ acceptance criteria → test 정의
→ Stage: Issue 분해 (productune How, sonnet, to-issues skill)
   ✓ vertical-slice ticket 생성 (T-001, T-002, ...)
→ Stage: 구현 (my-developer What, sonnet, tdd skill auto-invoke)
   ✓ 각 ticket 처리, confidence 보고
→ Stage: QA (my-qa What, haiku)
   ✓ test 실행, pass/fail
→ 사용자에게 final summary + deploy checklist
```

**합격 기준:**
- 4 페르소나 모두 적어도 1번씩 호출됨 (productune / my-designer 또는 skip / my-developer / my-qa)
- 각 호출 trace 에 model + effort 명시 (`model=sonnet, effort=medium` 류)
- `confidence` 가 출력 JSON 에 들어 있음 — `low` 면 PO 가 3-option 메뉴 surface 했어야 함
- 적어도 페르소나당 1 개 skill 자동 invoke (mattpocock 또는 phuryn) — trace 에서 확인 가능

### 6.2 — Ticket 영속화

```sh
jq '.current_round, .current_task.ticket_id, .current_task.stage' /tmp/productune-mvp-test/.codex/po-state.json
# 기대: "v1.0-MVP", "T-NNN", "<stage>"

ls /tmp/productune-mvp-test/docs/tickets/v1.0-MVP/ 2>/dev/null
# 기대: 완료된 ticket 들이 markdown (T-001.md, T-002.md ...)

cat /tmp/productune-mvp-test/docs/tickets/v1.0-MVP/T-001.md
# 기대: title / Round / Stage / Status / Period / Request / Inputs / Outputs / Linked tickets / Outcome
```

**합격 기준:**
- `current_task` 가 ticket schema (`ticket_id`, `stage`, `assignee_persona`, `input/output/deps`) 를 완전히 채움
- 닫힌 ticket 이 `docs/tickets/<round>/T-<id>.md` 에 자동 export 됨

### 6.3 — Quality escalation (의도적 어려움)

```sh
productune
> "src/middleware.ts 를 Next.js 16 의 새 proxy 구조로 마이그레이션"
# 의도: my-developer 가 모를 가능성 높음 → confidence=low → 3-option 메뉴
```

**관찰 포인트:**
- `→ delegating to my-developer (model=sonnet, effort=medium)` 첫 시도
- `✓ my-developer: confidence=low, unresolved: [...]`
- `[PO] my-developer 결과 confidence=low. [1] retry / [2] skill 검색 / [3] 진행 — [1/2/3]?`

사용자 `1` 응답 시:
- `→ retry my-developer (model=opus, effort=high — same session resume, ⚡tier-up)`
- 두 번째 시도 후에도 low → opus + ⚡xhigh (Loop cap 2 의 마지막 시도)

**합격 기준:**
- 3-option 메뉴가 정확히 surface
- Path 1 retry 시 model + effort 가 한 단계 ↑
- Loop cap 2 후에도 fail 이면 `blocked` 마크 + final summary 에 follow-up

### 6.4 — 사용자 prefix override

```sh
productune
> "/effort xhigh 디자인 시스템 신규 정의해줘"
# 기대: → my-designer (Why-essential, model=opus auto-promoted, effort=⚡xhigh — user override)

> "/dev:opus/high 그 컴포넌트 멀티-파일 refactor"
# 기대: → my-developer (How, opus, high — user override per-persona)

> "/skill 'next.js 16'"
# 기대: skill-fetch 호출 → 후보 surface → 사용자 선택
```

**합격 기준:**
- 모든 prefix 인식 + 적용
- xhigh + sonnet/haiku 충돌 시 자동 opus 승격 (한 줄 confirm 또는 자동)

### 6.5 — 종합 (Phase 1 acceptance)

다음 모두 만족:

- [ ] 6.1–6.4 위 phase 모두 pass
- [ ] `claude agents` 4 페르소나 (no my-planner)
- [ ] `productune` + `my-po` 둘 다 동작
- [ ] `bash scripts/install.sh` 재실행 멱등 (env file 보존)
- [ ] `bash scripts/setup-skills.sh` 재실행 멱등
- [ ] `docs/prd/productune.md` 의 acceptance criteria 모두 ✓ (또는 의도적 deferred 만 □)

이 phase 통과 시 Phase 1 완료. Phase 2 (사용자 실 프로젝트 dogfood) 진입 가능.

## Troubleshooting

**"MCP server 'graphiti' failed to start"** — Phase 0 미완. `setup-graphiti.sh` 실행. wiki tier 가 필요 없는 phase 라면 경고 무시 가능.

**"codex --profile productune fails to parse config"** — 드물지만 Ollama 의 `responses` API 가 준비 안 됐으면 profile `local` 이 에러 가능. `productune` 에는 영향 없음. 우회: `codex --oss --local-provider ollama -m qwen3.5:4B` 를 `--profile local` 대신 사용.

**"persona doesn't respect gate"** — PO 는 시작 시 `po-instructions.md` 를 읽음. 세션 도중에 수정했으면 Codex 재시작.

**"--session-id can only be used with --continue or --resume if --fork-session is also specified"** — (또는 PO 가) `claude --session-id <uuid>` 로 그 id 의 새 세션을 *생성* 시도. 미지원 — `--session-id` 는 fork-session flow 안에서만 허용. 정상 패턴: 첫 호출에 `--session-id` 생략 (Claude 가 할당, 응답 JSON 의 `.session_id` 로 반환), 이후 호출에 `--resume <id>` 사용. `--resume` 와 `--session-id` 동시 사용 금지. PO doctrine 인 `~/.codex/po-instructions.md` 가 이미 이 패턴 — 만약 PO 에서 이 에러를 만나면 `bash scripts/install.sh` 로 최신 doctrine 재배포.

**`kill -9` 후 stale `.codex/po.lock`** — 수동 정리 불필요. 다음 `productune` 호출이 lock 읽고, `kill -0` 으로 PID 가 죽었음을 확인하면 `[productune] stale lock from pid <X>; reclaiming` 출력 후 lock 삭제, 정상 진행.

**Legacy `po-state.json` 스키마 (flat `persona_sessions`)** — task-lifecycle 변경 전에 셋업했다면 `<project>/.codex/po-state.json` 이 다음 모양일 수 있음:

```json
{ "persona_sessions": {"my-designer": "uuid", ...}, "recent_turns": [...] }
```

새 doctrine 은 top-level 이 아니라 `current_task.persona_sessions` 아래를 읽음. 가장 단순한 마이그레이션은 그냥 비우고 PO 가 다음 실행에 새로 만들도록 두는 것:

```sh
rm /path/to/project/.codex/po-state.json
```

페르소나 tier 지식 (project markdown + Graphiti wiki + MEMORY.md) 은 영향 없음 — in-flight session id 만 리셋. 다음 페르소나 호출이 새 세션으로 시작. 업그레이드 시점에 진행 중이던 task 는 대개 이미 완료 상태라 무리 없음.

**"claude --agent exits with missing `uuidgen`"** — macOS 에는 항상 있음; Linux 면 PO delegation 템플릿에서 `python3 -c 'import uuid; print(uuid.uuid4())'` 로 대체.

**일반**: `claude --debug --agent <name> -p "..."` 로 MCP 연결 시도 + tool discovery 확인 가능.
