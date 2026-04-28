# Overview

## 한 줄 설명

**productune** = Codex CLI 또는 Claude Code 를 PO(Product Owner) 로 앉혀두고, 사용자의 한 문장 요청을 받아 Claude Code 의 3 명 전문가 (Designer / Developer / QA) 에게 단계별 자동 위임하는 로컬 dev-workflow. **planner 역할은 PO 안으로 흡수** 됨.

**비전**: 개발에 잘 모르는 기획자가 프로덕트를 성공적으로 만들 수 있는 툴 (Phase 1: CLI / Phase 2: dogfood / Phase 3: UI).

각 전문가는 **사람의 기억 구조처럼 3계층 메모리**: task(세션) → project(repo 안 markdown) → persona(모든 프로젝트 공유 graph DB). 옛 프로젝트 디자인이 새 프로젝트에 섞여 들지 않으면서도 일반 원칙은 축적.

## 동작 흐름

```
사용자: "로그인 모달에 비밀번호 찾기 링크 추가"
  │
  ▼
productune        (PO, Codex 또는 Claude — 사용자 선택)
  │   ├─ 자체적으로 decompose / risk-flag / pipeline 결정 (구 my-planner 역할)
  │
  ├─ claude --agent pdt-designer   → docs/design/login-modal.md 작성 (default opus)
  ├─ claude --agent pdt-developer  → 실제 코드 수정 (default sonnet)
  └─ claude --agent pdt-qa         → lint / build / test 실행 (default haiku)
  │
  ▼
사용자에게 ≤5 bullet 요약
```

각 persona 는 매번:
1. 자기 wiki(Graphiti, group_id 격리) 검색
2. 대상 프로젝트의 `docs/<persona>/` markdown 검색
3. 작업 수행
4. 의미 있는 학습은 `promotion_candidates` 로 PO 에 보고 — PO 가 사용자 승인 후 mechanical write

## 페르소나 매트릭스 (Why / How / What — Golden Circle)

| 페르소나 | Default | Why mode | How mode | What mode |
|---|:---:|---|---|---|
| **productune** (PO) | sonnet | **opus + ⚡xhigh** — MVP PRD 첫 round | sonnet/medium — 라우팅, 티켓 관리 | — |
| **pdt-designer** | opus | **opus + ⚡xhigh** — net-new DS | sonnet/low — 단순 token 매핑 / haiku — compliance check | — |
| **pdt-developer** | sonnet | — | **opus + high** — refactor / 2턴+ 디버깅. **opus + ⚡xhigh** — 3턴 째 / 시스템 차원 | sonnet/medium — PRD 구현 |
| **pdt-qa** | haiku | — | sonnet/high — 복잡 e2e / stress / test 환경 bypass 요청 | haiku/low — npm test, lint/build |

PO 가 task 난이도 → tier 매핑 시 [OSS 7-level task complexity hierarchy](https://github.com/ulab-uiuc/LLMRouter) 차용. Effort `xhigh` 는 opus 에만 허용.

## Real Engineering 워크플로

`PRD → Test → Issue → 구현 → Refactor → 반복` (mattpocock/skills 의 컨셉).

MVP 라운드: `MVP PRD 수립 → test 로 MVP 확립 → 실제 제품 → 배포 → 다음 round PRD update`.

### 공통 규칙 (모든 persona)

- **Graphiti MCP 서버**: 페르소나마다 `--group-id persona-<이름>` 으로 개별 인스턴스 spawn. 서로의 wiki 안 보임.
- **Backend**: FalkorDB (Docker `falkordb` 컨테이너) + Ollama `gemma4:26b` (엔티티 추출) + `nomic-embed-text` (임베딩). 전부 로컬.
  - 추출 품질을 hosted 급으로 올리려면 install.sh 옵션 [2] Anthropic 추천. 옵션 [3] 로컬에서도 더 강한 LLM (`gemma2:27b`, `qwen2.5:32b`) 로 교체 가능.
- **작업 전**: 항상 project tier(`docs/<persona>/*.md`) + wiki tier(Graphiti) 검색.
- **작업 후**: JSON 포맷으로 PO 에 반환 — `changed_files` / `design_doc_path` / `confidence` / `unresolved` / `promotion_candidates` 같은 명시적 구조.
- **역할 밖 거절**: 예) pdt-designer 가 코드 수정 요청 받으면 `{"refused": true, "suggested_persona": "pdt-developer"}` 반환. PO 가 다시 라우팅.

### 메모리 승격 규칙 (공통, **모두 user-gate**)

페르소나는 **자동 write 안 함**. `promotion_candidates` JSON 만 반환 → PO 가 한 줄 prompt → user `y` 시 PO 가 mechanical write.

- **Session → Project**: 의사결정/제약/비자명한 프로젝트 사실 후보 → user 승인 → `docs/<persona>/*.md` 에 날짜 찍고 추가 (커밋 대상).
- **Project → Wiki**: 둘 이상 프로젝트에서 반복되는 패턴 또는 "항상 이렇게 해" 라고 사용자가 말한 것만 → user 승인 → PO 가 `[PROMOTION-APPROVED]` 마커 붙여 persona 재호출 → `mcp__graphiti__add_memory` write.
- **Wiki 반박**: 이전 사실과 모순되는 새 사실은 새 episode 로 추가 → Graphiti bi-temporal 이 자동으로 이전 후순위.
- **직접 호출 (PO 없이) 시**: persona 가 wiki write 거절. 마커 없으면 `mcp__graphiti__add_memory` 절대 호출 안 함.

## Ticket system

- `<project>/.codex/po-state.json` 에 `current_round`, `current_task` (with `ticket_id`, `stage`, `assignee_persona`, deps, linked_tickets), `past_tickets`, `rounds`
- Ticket close 시 `<project>/docs/tickets/<round-id>/T-<id>.md` 자동 export (git-versioned)
- 후일 Phase 3 의 UI dashboard backend

## Quality-based escalation

페르소나가 `confidence: low` 또는 `unresolved` 항목 보고 시 PO 가 3-option 메뉴 surface:

```
[1] retry — 같은 session resume + model + effort 한 단계 ↑ (Loop cap 2)
[2] skill 검색 — mattpocock + phuryn + skill-fetch 9 registry
[3] 그냥 진행 — Follow-ups 로 surface
```

## 지금 당장 가능한 것 / 필요한 것

**바로 됨:**
- `claude --agent pdt-developer -p "..."` 등 페르소나 직접 호출 (Graphiti 없이도 project tier 와 MEMORY.md 로 동작)
- `productune` PO 오케스트레이션 (`my-po` 호환 alias)

**Skill 라이브러리 + Graphiti 켜려면:**
- `bash scripts/setup-skills.sh` (mattpocock + phuryn 클론)
- `ollama pull nomic-embed-text` (임베딩)
- `bash scripts/setup-graphiti.sh` (FalkorDB + Graphiti)
