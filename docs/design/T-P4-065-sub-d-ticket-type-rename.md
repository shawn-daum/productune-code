# T-P4-065 sub-d — ticket `stage` → `type` rename

> **Scope**: axis hygiene. ticket `stage` 어휘를 `type` 으로 rename. enum 값 (`design / impl / refactor / test / qa / deploy`) 유지. doctrine Phase (sub-area a 결과 5단) 와 충돌 어휘 제거.
>
> **Land 순서**: sub-d (본 문서) → sub-f. 이유: sub-d 가 frontmatter 필드명을 한 번에 rename, 그 후 sub-f 가 추가 필드 (`slug`, `qa_status`, `qa_loops`) 를 확장. 두 plan 을 묶으면 ticket md 가 두 번 touch 됨 → 1회로 압축.
>
> **연관**:
> - sub-a (Phase 1~5 doctrine) ✅ plan land
> - sub-f (po-state slim, ticket md = SoT) ✅ plan land — 본 plan 뒤
> - sub-b (StageStrip 5단) — 별 호출
> - sub-c (ChatPanel persona selector 제거) — 별 호출
> - sub-e (PRD / service-flow 정정) — 별 호출

## §1 Decision

| 항목 | Before | After |
|---|---|---|
| ticket frontmatter field | `stage:` | `type:` |
| enum 값 | `design / impl / refactor / test / qa / deploy` | **동일 유지** |
| TypeScript type | `Stage` | `TaskType` |
| TypeScript const | `STAGE_ORDER` | `TYPE_ORDER` |
| doctrine narrative | "stage" (ticket axis) | "type" (ticket axis) |
| doctrine narrative | "stage" (Phase axis) | "phase" (sub-a 가 이미 정정) |
| 사용자 가시 라벨 (ko) | "stage" / "단계" | "type" 영문 그대로 (T-P4-057 보호어 룰) |
| doctrine 파일명 | `sections/stages.md` | `sections/task-types.md` rename |
| `po-state.json` field | `current_task.stage`, `past_tickets[].stage` | `current_task.type`, `past_tickets[].type` (단 sub-f 가 `past_tickets` 제거 예정 — interim only) |

**결정 근거**:
- enum 값 유지 → Linear / Jira / 외부 PM tool 정합성 보존. Migration cost 최소.
- 사용자 가시 라벨 = "type" 영문 → T-P4-057 ko-mode 보호어 (영문 그대로 유지) 룰 따름. "종류" 한글 옵션 폐기 (보호어 정합 + 짧음).
- 파일명 `sections/stages.md` → `sections/task-types.md` rename → 파일명 자체가 axis 명확화에 기여. doctrine 안에서 "stage" 검색 → 0 매치 (Phase rename 후 + 본 rename 후) 가 종료 조건.

## §2 doctrine 영향 list

### Schema (enum 정의 정정)

- `~/.productune/sections/tickets.md` (사용자 home 사본)
- `packages/core/po/sections/tickets.md` (monorepo source)

  - **schema enum 정정**: 현재 `Layer B — stage enum` table 은 6 값 모두 정확 (`design / impl / refactor / test / qa / deploy`). 단, narrative 의 `stage` 어휘 → `type` rename 필요.
  - "Layer A — Version Cycle Phases" 의 narrative `stage:design`, `stage:impl` 등 → `type:design`, `type:impl` rename.
  - "Layer B — `stage` enum" 헤더 → "Layer B — `type` enum"
  - frontmatter 필수 필드 line: `Required: ticket_id, version, stage, status (PO mechanical), assignee, ...` → `... type, status ...`
  - PO mechanical-write whitelist line: `... assignee, stage, estimated_complexity ...` → `... assignee, type, estimated_complexity ...`

### Narrative (어휘 통일)

- `packages/core/po/sections/stages.md` → **`task-types.md` 로 파일명 rename** + 내용 갱신
  - 파일 내 narrative "stage" → context-별 분리:
    - ticket axis 의 "stage" → "type"
    - Phase axis 의 "stage" → "phase" (sub-a 가 이미 정정 — 본 plan 에서 누락분만 catch)
  - **주의**: 파일 자체는 doctrine "Three stages" 라는 워크플로 stages (Instruction / Execution / Feedback) 를 다룸. ticket type 과 무관. 본 파일은 어휘 stage→phase 또는 stage→step 정정. 파일명 rename 은 sub-a 가 이미 처리했을 수 있음 — 확인 후 재정정 또는 skip.
  - **재결정**: `sections/stages.md` 파일명은 `sections/po-loop.md` 로 rename 권장 (Three stages 가 PO 루프의 3 단계 = Instruction/Execution/Feedback). ticket type 파일은 별도 신규 만들지 않고 `sections/tickets.md` 에 통합 (이미 enum table 있음).

- `packages/core/po/po-instructions.md` — narrative 의 ticket `stage` → `type`. Phase axis 의 stage 는 sub-a 결과 따름.
- `packages/core/po/sections/lifecycle.md` — narrative
- `packages/core/po/sections/lifecycle-mechanics.md` — narrative + close rules table
- `packages/core/po/sections/routing.md` — narrative
- `packages/core/po/sections/delegation.md` — narrative
- `packages/core/po/sections/memory.md` — `po-state.json` schema 의 `stage` 필드 docs (sub-f 와 중복 — sub-f 가 past_tickets 통째 제거 예정)
- `packages/core/po/sections/calibration.md` — narrative (있다면)

### Persona spec

- `packages/core/agents/pdt-designer.md` — Output format `tickets[]` 의 ticket frontmatter 예시, "split tickets and choose stage" → "choose type"
- `packages/core/agents/pdt-developer.md` — narrative
- `packages/core/agents/pdt-qa.md` — narrative
- `packages/core/agents/pdt-po.md` — narrative

### Template / memory

- `packages/core/po/po-memory.md.template` — narrative 의 calibration log line schema 에 stage/type 노출 여부 확인

### `~/.productune/sections/` (home 사본)

- 위 monorepo source 갱신 후 home 동기화 (productune CLI 의 `productune install` 또는 `productune sync` 가 처리 — 별 ticket 불필요)

## §3 GUI 영향

### TypeScript types

- `packages/gui/src/lib/types.ts` — `Stage` type → `TaskType`. `STAGE_ORDER` → `TYPE_ORDER`.
- `packages/gui/src/lib/stage-mapping.ts` — 파일명 자체는 `phase-mapping.ts` 로 rename 권장 (sub-area b 와 정합). 본 plan 은 ticket type rename 만 다룸 — 파일명 변경은 sub-area b 에 위임. 본 plan 은 파일 안의 type 시그니처만 갱신.

### Components

- `packages/gui/src/components/workspace/TicketDashboardView.tsx` — stage filter / column → type
- `packages/gui/src/components/workspace/VersionDetailView.tsx` — stage grouping → type
- 기타 ticket 카드 / 리스트 컴포넌트의 `stage` prop / 내부 변수명

### Locale

- `packages/gui/locales/ko.json` (또는 i18n 파일) 의 `workspace.tickets.title`, `tickets.filterAll`, stage 라벨 → "type" 또는 빈 문자열 (T-P4-057 보호어 룰: 영문 그대로 유지 시 keyless)
- `packages/gui/locales/en.json` — 동일 키

## §4 ticket md frontmatter migration

### Mechanical step

```bash
# frontmatter only — `^stage:` 시작 line
find docs/tickets -name '*.md' -exec sed -i '' 's/^stage:/type:/' {} +
```

- `^` anchor 로 frontmatter line 한정. 본문 내 "stage:" prefix 가능성 낮음 (heading / list 사용).
- macOS sed `-i ''` (BSD), Linux 는 `-i` 만.

### 검증

```bash
# 0 매치 기대
grep -rn "^stage:" docs/tickets/
# 본문 내 잔존 "stage" 어휘 — manual review
grep -rn "stage" docs/tickets/ | grep -v "^docs/tickets.*type:"
```

### Body 내 "stage" 어휘

- ticket md 본문 (Request / Inputs / Acceptance / Out of scope / Persona Activity) 내 "stage" 단어:
  - context 가 **ticket axis** → "type" 으로 manual rename (사람 검토)
  - context 가 **Phase axis** → "phase" 으로 manual rename (sub-a 결과 따름)
  - false-positive 방지: stage = "무대" / "단계" 의미가 아닌, ticket 분류 또는 cycle 단계만 검토

## §5 `po-state.json` migration

### Schema 변경

```jsonc
// before
{
  "current_task": { "stage": "impl", ... },
  "past_tickets": [{ "stage": "design", ... }]
}

// after
{
  "current_task": { "type": "impl", ... },
  "past_tickets": [{ "type": "design", ... }]
}
```

### jq idempotent migration

```bash
jq '
  (.current_task // {}) as $ct
  | (.past_tickets // []) as $pt
  | .current_task = (
      if ($ct | has("stage")) and (($ct | has("type")) | not)
      then ($ct | .type = .stage | del(.stage))
      else $ct
      end
    )
  | .past_tickets = (
      $pt | map(
        if has("stage") and (has("type") | not)
        then .type = .stage | del(.stage)
        else .
        end
      )
    )
' "$STATE_PATH" > "$STATE_PATH.tmp" && mv "$STATE_PATH.tmp" "$STATE_PATH"
```

### `schema_version` 처리

- sub-a (Phase 1→5) + sub-d (stage→type) + sub-f (slim) 를 한 migration script 안에 묶음 → `schema_version: 1 → 2` (one-shot bump).
- 분리 시 사용자 환경에서 부분 migration 불일치 위험. 통합 권장.
- migration script 위치: `packages/core/po/migrations/v1-to-v2.sh` (또는 jq 단일 file). sub-f 가 owner — 본 plan 은 jq snippet 만 제공.

## §6 마이그레이션 순서

1. **doctrine 갱신** (monorepo source) — `sections/tickets.md` schema enum + narrative, `sections/stages.md` → `po-loop.md` rename, `po-instructions.md` + lifecycle / mechanics / routing / delegation / memory narrative, persona spec narrative.
2. **ticket md frontmatter rename** (mechanical sed) — `find docs/tickets -name '*.md' -exec sed -i '' 's/^stage:/type:/' {} +`.
3. **ticket md body manual review** — Phase axis vs ticket axis 어휘 분리.
4. **`po-state.json` migration** (jq) — sub-f 의 통합 script 안에 포함.
5. **TypeScript type rename** — IDE refactor (`Stage` → `TaskType`, `STAGE_ORDER` → `TYPE_ORDER`).
6. **GUI component rename** — prop / 내부 변수명, locale 라벨.
7. **검증** — `grep -rn "^stage:" docs/tickets/` empty, `grep -rn "Stage" packages/gui/src/` (false-positive 제외) clean, `po-state.json` schema_version=2.

## §7 sub-f 와의 정합

- **sub-f 가 land 시**: ticket frontmatter 에 `slug`, `qa_status`, `qa_loops` 추가. sub-d 가 먼저 land → frontmatter 의 `stage` → `type` 한 번만 touch 후 sub-f 가 추가 필드. 총 2 pass 이지만 각 pass 의 책임이 분리.
- **`po-state.json`**: sub-d 가 `stage` → `type` rename 만, sub-f 가 `past_tickets` 제거. 두 변경 모두 `schema_version 1 → 2` 안에 통합.
- **migration script ownership**: sub-f 가 owner. sub-d 는 jq snippet (§5) 을 sub-f 에 전달.

## §8 Out of scope

- StageStrip 5 단 정합 (sub-area b 별 호출)
- `stage-mapping.ts` 파일명 변경 (`phase-mapping.ts`) — sub-area b
- ChatPanel persona selector 제거 (sub-area c)
- PRD / service-flow 정정 (sub-area e)
- 코드 fix 자체 (impl ticket — assignee: pdt-developer)
- `past_tickets` 제거 (sub-f)

## §9 Open questions

해결됨 / 결정:
- ~~한글 모드 사용자 가시 라벨~~ → "type" 영문 그대로 (T-P4-057 보호어 룰).
- ~~doctrine `stages.md` 파일명~~ → `po-loop.md` rename (Three stages = PO 루프의 3 step). ticket type 파일은 별도 만들지 않고 `tickets.md` 에 통합 유지.
- ~~migration script 분리 vs 통합~~ → 통합 (`schema_version 1 → 2` one-shot, sub-f owner).

남은 questions:
- monorepo `packages/core/po/sections/stages.md` 가 home 의 `~/.productune/sections/stages.md` 와 동일 내용인지 (sync 시점 차이) 확인 필요.
- `po-state.json` `phase_history[]` 안의 entry 가 ticket type / Phase 를 어떤 어휘로 저장하는지 grep 후 확정.
- doctrine 안 "stage:design" 같은 quoted-literal 이 실제 enum 값을 가리키는지 vs narrative 어휘인지 (전자는 유지, 후자는 rename).

## §10 검증 체크리스트

```bash
# 1. doctrine 어휘
grep -rn "stage" packages/core/po/ packages/core/agents/ | grep -v "package.json\|node_modules" | grep -v "^.*:#" | wc -l
# expectation: 0 (또는 enum value `stage:impl` 같은 quoted literal 만 — 본 plan 에서는 quoted literal 도 `type:impl` 로 변경 → 진정 0)

# 2. ticket frontmatter
grep -rn "^stage:" docs/tickets/ | wc -l   # 0
grep -rn "^type:" docs/tickets/ | wc -l    # ≈50

# 3. po-state.json
jq '.schema_version' .productune/po-state.json   # 2
jq '.current_task | has("stage")' .productune/po-state.json   # false
jq '.current_task | has("type")' .productune/po-state.json    # true

# 4. TypeScript
grep -rn "Stage" packages/gui/src/ | grep -v "node_modules\|\.test\." | wc -l   # 0 (false-positive 검토)
grep -rn "TaskType\|TYPE_ORDER" packages/gui/src/ | wc -l   # ≥1

# 5. promotion lifecycle / chunking 충돌
grep -rn "promotion.*stage\|chunking.*stage" packages/core/   # 0
```

## §11 risk / 충돌 분석

- **promotion lifecycle 충돌 X** — promotion lifecycle 은 `pending_promotions[]` 큐를 사용, ticket type 과 무관.
- **chunking ceiling 충돌 X** — chunking 은 token-budget 기반, axis hygiene 와 무관.
- **Phase 1~5 충돌 X** — sub-a 가 Phase axis 어휘를 `phase` 로 명확화, 본 plan 이 ticket axis 를 `type` 으로 분리. 두 axis 가 어휘 차원에서 분리.
- **Linear / Jira 정합** — enum 값 유지 → 외부 sync 영향 0.
- **사용자 멘탈 모델** — ko-mode 라벨이 영문 "type" 으로 노출 → 보호어 룰 정합. "type" 단어가 짧고 영어 화자에게 친숙.

## §12 Implementation notes (코드 변경 X — Developer 참고용)

- IDE refactor (`Stage` → `TaskType`) 시 false-positive 발생 가능 영역:
  - `Stagewise` (Vercel 의 stagewise plugin — 외부 lib, 무관)
  - test fixture 의 `stage` key (test 가 ticket md 모킹 시 함께 변경 필요)
- sed 로 frontmatter 변환 시 `stage:` 가 한 line 만 매치 (`^stage:`). 만약 frontmatter 에 nested object (드물지만) 있으면 manual review.
- migration 후 GUI 가 구 `po-state.json` (schema_version=1) 을 읽으면 fallback 처리 필요 — sub-f migration script 가 처리.
