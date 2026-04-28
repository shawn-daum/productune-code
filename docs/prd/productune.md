# PRD: productune

**Slug**: productune    **Created**: 2026-04-28    **Status**: Round 1 / MVP — in-progress

> 자체 PRD. productune 이 만들고자 하는 제품에 대한 정의이자, 동시에 productune 자기 자신의 다음 라운드 목표를 누적 기록하는 곳.

---

## Why — 비전

**개발에 대해 잘 알지 못하는 기획자가 프로덕트를 성공적으로 만들어낼 수 있는 툴.**

"잘 알지 못한다" =
- 제품 스펙, 구현 난이도는 어느 정도 가늠 가능
- CLI 환경에 익숙하지 않음
- 복잡한 개발 지식 (빌드 시스템, 디버깅, 아키텍처 패턴) 은 깊이 모름

"성공적으로" = "특정 문제를 해결하는 방식으로 시장에 내놓을 수 있는 상태" — 단순히 동작하는 게 아니라 PRD 가 정의한 acceptance criteria 를 만족하고 사용자에게 가치를 전달.

오케스트라처럼 4 명의 전문가 페르소나 (PO + Designer + Developer + QA) 가 함께 곡 (제품) 을 tune 하면서 만들어 가는 컨셉. PO 가 지휘자 역할, 각 페르소나가 자신의 악기 (영역) 를 연주.

## Who — 타깃 사용자

| 항목 | 정의 |
|---|---|
| **주 사용자** | 기획자 / 1인 PM / 제품 오너 — 코드를 직접 짜진 않지만 무엇을 만들지 정의할 수 있는 사람 |
| **공통 특성** | 스펙 / 구현 난이도 추정 가능, CLI 미숙, 복잡 개발 지식 X |
| **사용 시점** | 새 MVP 시작 / 기존 제품의 다음 라운드 / 실험 프로토타입 |
| **사용하지 않는 사람** | 풀스택 개발자가 코드 직접 짜는 것이 더 빠른 케이스 — productune 은 **위임 + 검증** 도구이지 IDE 보조가 아님 |

## How — 3-phase 롤아웃

| Phase | 목표 | 인터페이스 | 상태 |
|---|---|---|---|
| **Phase 1 (지금)** | CLI 기반 핵심 구조 + dogfood-ready | terminal 명령어 (`productune`) | **현재 작업 중** |
| Phase 2 | 사용자가 실제 프로젝트 1 개로 dogfood 완주 → MVP 검증 | 동일 (CLI) | Phase 1 완료 후 |
| Phase 3 | UI 화 — onboarding + 일반 사용 모두 UI | web/desktop UI (스펙 미정) | Phase 2 합격 후 |

> Phase 1, 2 가 성공해야 Phase 3 진입. UI 는 검증된 흐름 위에 얹는 layer 이지, 검증 전에 만들지 않음.

## What — Phase 1 MVP 범위 (현재 집중)

### 핵심 기능

1. **`productune` 명령어** — 사용자 entry point. terminal 에서 한 줄로 시작.
2. **4 페르소나 시스템** (Golden Circle):
   - `productune` (PO; default sonnet) — Why: PRD 수립 / Discovery / 라우팅. How: 티켓 관리 / 교통정리.
   - `my-designer` (default opus) — Why: UX 원칙 + Brand Identity + Design System. How: 검수 / 외부 툴 추천.
   - `my-developer` (default sonnet) — What: 명료한 구현. How: 아키텍처 / 디버깅.
   - `my-qa` (default haiku) — What: 기능 검증. How: 복잡 UX / e2e / stress.
3. **Real Engineering 워크플로** — `PRD → Test → Issue → Refactor → 반복`. PO 가 각 stage 에 적절한 페르소나 호출 + transition 시 사용자에게 1줄 announce.
4. **Ticket system** — task 가 ticket 단위로 영속화 (`po-state.json` + `docs/tickets/<round>/T-<id>.md`). status / 작업자 / I/O / dependency / 링크 추적. 후일 UI dashboard 의 backend.
5. **Dynamic model tier + effort** — task 난이도에 맞춰 PO 가 페르소나마다 모델 (haiku/sonnet/opus) + effort (low/medium/high/⚡xhigh) 동적 선택. OSS 7-level task complexity hierarchy 차용.
6. **Quality-based escalation** — 페르소나 산출물의 confidence 가 낮으면 사용자 확인 후 (a) tier-up retry 또는 (b) skill 검색 + 적용.
7. **Skill 통합** — [mattpocock/skills](https://github.com/mattpocock/skills) (Real engineering 컨셉) + [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (PM 워크플로) 페르소나별 자동 매핑.
8. **3-tier 메모리** — Session / Project (`docs/<persona>/*.md`) / Wiki (Graphiti, persona-global). User-gated promotion.

### Non-goals (Phase 1)

- Web/desktop UI
- Multi-user / 팀 공유
- Codex agent 를 페르소나 런타임으로 사용
- 자동 deploy / CI 통합
- GitHub repo rename (현 `coolchestration` → `productune` 은 별도 결정)
- Filesystem dir rename

## Acceptance criteria (Phase 1 완료 기준)

다음 모두 충족 시 Phase 1 합격:

- [ ] `claude agents` 가 정확히 4 페르소나 (productune / my-designer / my-developer / my-qa) 인식
- [ ] `productune` 명령으로 새 프로젝트에서 시작 가능 (`my-po` 호환 alias 도 동작)
- [ ] PRD 작성 → test 정의 → issue 분해 → 구현 → QA 의 한 round 가 1 명의 기획자 사용자에 의해 끝까지 완주됨 (manual dogfood)
- [ ] 라운드 종료 시 `<project>/docs/tickets/<round-id>/` 에 ticket markdown 들이 자동 export 됨
- [ ] PO 가 task 별로 model + effort 를 동적 선택하고 trace 에 명시 (`→ delegating to my-developer (model=opus, effort=⚡xhigh — 3턴 째 디버깅)`)
- [ ] 페르소나가 confidence + unresolved 필드를 출력 → PO 가 미달 시 3-option 메뉴 surface
- [ ] 적어도 페르소나당 1 개 skill 이 자동 invoke 됨 (mattpocock 또는 phuryn)
- [ ] `docs/testing.md` 의 Phase 0–6 모두 pass

## Phase 2 — 사용자 dogfood (next round)

- 사용자가 자기 실제 프로젝트 1 개에 productune 적용
- MVP PRD → test → 구현 → 배포 한 사이클
- 사용 후기 → docs/prd/productune.md Round 2 로 누적 (이 파일 자체)
- Phase 2 합격 기준은 Round 2 진입 시점에 정의

## Phase 3 — UI 화 (future)

- onboarding (install + 첫 setup) 을 GUI 로
- 일반 사용 (PRD 작성 / ticket 진행 / timeline 보기) 을 GUI 로
- backend = Phase 1 의 ticket system + po-state.json + 페르소나 shell-out 그대로
- 스펙은 Phase 2 합격 후 별도 PRD round 로 정의

## OSS reference

이 PRD 와 doctrine 의 핵심 컨셉은 모두 정립된 OSS standard 위에 구축:

- **Real Engineering 워크플로** — [mattpocock/skills](https://github.com/mattpocock/skills) (23 skill: to-prd, to-issues, tdd, triage-issue, request-refactor-plan 등)
- **PM 워크플로** — [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (65 skill, 8 plugin: pm-product-discovery, pm-product-strategy, pm-execution 등)
- **Task complexity 7-level** — LLMRouter, vLLM Semantic Router, LiteLLM, NVIDIA llm-router
- **Cascade routing + retry** — RouteLLM, C3PO, Maxim AI 의 3-tier cascade
- **Quality-based retry / LLM-as-a-judge** — Anthropic engineering "Demystifying evals", LangSmith, MLflow, Confident AI
- **Skill discovery** — PolySkill, skill-fetch (9 registry 통합)

## Open questions

- Phase 2 진입 시점: Phase 1 acceptance criteria 다 통과한 후 즉시 vs 1 주일 stabilization 후?
- Dogfood 프로젝트 후보: 사용자가 직접 픽 (별도 메모)
- GitHub repo `coolchestration` → `productune` 리네임 시점: Phase 1 완료 후
- pm-skills 의 65 skill 중 productune (PO) 에 매핑할 우선순위: 각 plugin 의 Discovery / Strategy / Execution 그룹부터
- 한국어/영어 doctrine 분기: 현재 doctrine 영어 + UI 안내 한글 — 일관성 필요?

## Activity log

- **2026-04-28** — Round 1 (MVP) 시작. PRD 초안 작성. 4-phase persona 구조 + Real Engineering 워크플로 + dynamic tier + quality escalation + skill 통합 합의. (commit: `0731a09` rebrand)
