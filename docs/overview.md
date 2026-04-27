# Overview

## 한 줄 설명

**Codex CLI 를 "PO(Product Owner)" 로 앉혀두고, 사용자의 한 문장 요청을 받아 Claude Code 의 4개 전문가(Planner / Designer / Developer / QA)에게 단계별로 자동 위임**해서 일을 끝내는 로컬 개발 오케스트레이션.

각 전문가는 **사람의 기억 구조처럼 3계층 메모리**를 가집니다: task(세션) → project(repo 안 markdown) → persona(모든 프로젝트 공유 graph DB). 옛 프로젝트 디자인이 새 프로젝트에 섞여 들지 않으면서도, 일반 원칙은 축적됩니다.

## 동작 흐름

```
사용자: "로그인 모달에 비밀번호 찾기 링크 추가"
  │
  ▼
codex --profile po        (PO, OpenAI hosted)
  │
  ├─ claude --agent planner    → 작업 쪼개기, 영향 파일 맵핑
  ├─ claude --agent designer   → docs/design/login-modal.md 작성
  ├─ claude --agent developer  → 실제 코드 수정
  └─ claude --agent qa         → lint / build / test 실행
  │
  ▼
사용자에게 ≤5 bullet 요약
```

각 persona 는 매번:
1. 자기 wiki(Graphiti, group_id 격리) 검색
2. 대상 프로젝트의 `docs/<persona>/` markdown 검색
3. 작업 수행
4. 의미 있는 학습은 다시 wiki/docs 로 승격 기록

## 페르소나 기본 세팅

| | **planner** | **designer** | **developer** | **qa** |
|---|---|---|---|---|
| **역할** | 요구 분해·라우팅 | 아키텍처·스펙 설계 | 구현 | 빌드/린트/테스트 검증 |
| **모델** | sonnet | sonnet | **opus** | haiku |
| **permissionMode** | `plan` (읽기만) | `acceptEdits` (docs/ 만 쓰기) | `acceptEdits` (풀 편집) | `dontAsk` (whitelist 만) |
| **색** | 🔵 blue | 🟣 purple | 🟢 green | 🟡 yellow |
| **tools** | Read, Glob, Grep, WebFetch + graphiti MCP | + Write (docs/ 만), + WebFetch | + Write, Edit, Bash | + Bash (whitelist) |
| **쓰기 영역** | 없음 (plan 모드) | `docs/design/` 만 | 전체 | 없음 |
| **Bash 허용** | — | — | 전체 | `npm run *`, `npm test`, `git status/diff`, `curl localhost:*` 뿐 |
| **wiki group_id** | `persona-planner` | `persona-designer` | `persona-developer` | `persona-qa` |
| **memory** | `user` (글로벌 MEMORY.md 자동 주입) | `user` | `user` | `user` |

### 공통 규칙 (모든 persona)

- **Graphiti MCP 서버**: 페르소나마다 `--group-id persona:<이름>` 으로 개별 인스턴스 spawn. 서로의 wiki 는 안 보임.
- **Backend**: FalkorDB (Docker `falkordb` 컨테이너) + Ollama `gemma4:26b` (엔티티 추출) + `nomic-embed-text` (임베딩). 전부 로컬.
- **작업 전**: 항상 project tier(`docs/<persona>/*.md`) + wiki tier(Graphiti) 검색.
- **작업 후**: JSON 포맷으로 PO 에 반환 — `changed_files` / `design_doc_path` / `tasks` 같은 명시적 구조.
- **역할 밖 거절**: 예) designer 가 코드 수정 요청 받으면 `{"refused": true, "suggested_persona": "developer"}` 반환하고 종료. PO 가 다시 라우팅.

### 메모리 승격 규칙 (공통)

- **Session → Project**: 의사결정/제약/비자명한 프로젝트 사실은 `docs/<persona>/*.md` 에 날짜 찍고 추가 (커밋 대상).
- **Project → Wiki**: 둘 이상 프로젝트에서 반복되는 패턴 또는 "항상 이렇게 해" 라고 사용자가 말한 것만 `mcp__graphiti__add_memory` 로 올림. 프로젝트 고유 사실은 올리지 않음.
- **Wiki 반박**: 이전 사실과 모순되는 새 사실이 들어오면 그냥 새 episode 추가 → Graphiti 의 bi-temporal validity window 가 자동으로 이전 사실을 후순위로.

## 지금 당장 가능한 것 / 필요한 것

**바로 됨:**
- `claude --agent planner -p "..."` 등 4 페르소나 직접 호출 (Graphiti 없이도 project tier 와 MEMORY.md 로 동작)
- `codex --profile po` PO 오케스트레이션

**Graphiti wiki tier 켜려면 아직 필요한 것:**
- `ollama pull nomic-embed-text` (임베딩 모델)
- `bash <coolchestration-clone>/scripts/setup-graphiti.sh` (FalkorDB 컨테이너 + graphiti clone + uv sync)
