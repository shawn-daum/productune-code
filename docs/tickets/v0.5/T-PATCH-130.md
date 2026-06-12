---
ticket_id: T-PATCH-130
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L2
qa_status: self-verify
qa_loops: 0
slug: ticket-board-fold-qa-into-inprogress
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-130 — 티켓 보드 QA 컬럼을 '진행 중'으로 병합

## §1. Request

shawn (대화, 2026-06-12): 현재버전 탭의 티켓 섹션에서 QA 도 '진행 중' 안에 넣자. 그래서 보이는 상태가 `보류 - 할 일 - 진행 중 - 유저 검토 - 완료 - 중단` 6개가 되도록.

근거: 현재 `TicketDashboardView` 의 `STATUS_ORDER` 가 7개 컬럼(보류/할 일/진행 중/QA/유저 검토/완료/중단)을 구동. `'review'`(=QA, ko.json `status.review`="QA") 가 독립 컬럼. 이를 `'in-progress'`(진행 중) 버킷으로 접어 컬럼을 6개로 축소.

## §2. Acceptance

- BDD-1: Given 현재버전 탭 티켓 섹션 / Then 컬럼이 좌→우로 `보류 · 할 일 · 진행 중 · 유저 검토 · 완료 · 중단` 6개만 렌더된다 (별도 QA 컬럼 없음).
- BDD-2: Given `status: 'review'` 인 티켓 / Then 해당 티켓은 '진행 중'(in-progress) 컬럼 안에 표시된다.
- BDD-3: Given `status: 'review'` 인 티켓 / Then schema-mismatch(unknown) 로 집계되지 않는다 — `unknownCount` 증가 없음, `SchemaMismatchBanner` 미표시. (review 는 여전히 known status)
- BDD-4: `Status` 타입(types.ts)은 7-status 그대로 유지 — 티켓 상태값으로서 `'review'` 는 계속 유효하고, 카드의 `qa_status` 칩 등 카드 표시는 불변. 보드 **표시 버킷만** 병합한다.

## §3. Plan

단일 파일(`packages/gui/src/components/workspace/TicketDashboardView.tsx`)만 수정. `types.ts` Status 7-status·ko.json 라벨/색상맵은 불변(BDD-4).

1. `STATUS_ORDER` 에서 `'review'` 제거 → 표시 컬럼 6개(blocked·todo·in-progress·user-verify·done·abandoned) (BDD-1).
2. `KNOWN_STATUS_SET` 을 `new Set([...STATUS_ORDER, 'review'])` 로 변경 → review 는 여전히 known. STATUS_ORDER 에서만 빠지면 review 가 unknown 으로 집계(`unknownCount`++)되어 schema-mismatch 배너 표시 + 'todo' 오분류되므로(BDD-3 위반) 명시적으로 set 에 추가.
3. `DISPLAY_BUCKET: Partial<Record<Status, Status>> = { review: 'in-progress' }` 추가. `groupByStatus` 에서 known status 를 컬럼 버킷으로 변환 시 `DISPLAY_BUCKET[resolved] ?? resolved` 적용 → review 티켓이 in-progress 배열로 들어감(BDD-2).
4. (수반) `kanban` 그리드 `gridTemplateColumns` 의 하드코딩 `repeat(7, …)` → `repeat(${STATUS_ORDER.length}, …)` 로 변경. 안 하면 컬럼 6개인데 7-track 그리드라 우측에 빈 track 갭 발생(BDD-1 시각 위반 방지).

## §4. Outcome

### 변경 코드 발췌 (`TicketDashboardView.tsx`)

```ts
// (1) 컬럼 6개
const STATUS_ORDER: Status[] = ['blocked', 'todo', 'in-progress', 'user-verify', 'done', 'abandoned']
// (2) review 는 여전히 known
const KNOWN_STATUS_SET = new Set<string>([...STATUS_ORDER, 'review'])
// (3) 표시 버킷 remap
const DISPLAY_BUCKET: Partial<Record<Status, Status>> = { review: 'in-progress' }
```

```ts
// groupByStatus 내부
const resolved: Status = known ? (raw as Status) : 'todo'
const k: Status = DISPLAY_BUCKET[resolved] ?? resolved   // review → in-progress
```

```ts
// (4) kanban 그리드 — 컬럼 수 파생
gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(160px, 1fr))`,
```

`types.ts` Status, ko.json `status.review`/색상맵, `columnHeader` 의 `Record<Status,…>` 색상맵(review 키 유지 — 타입 exhaustiveness 필요)은 모두 불변.

### BDD 매핑 / 논증 (Electron 런타임 headless 불가 → 정적·타입·빌드 검증 + 코드 추적)

- **BDD-1 (컬럼 6개)**: 렌더는 `STATUS_ORDER.map(...)` (line 56 부근) 으로 컬럼 생성 → review 제거로 6개. grid track 도 `STATUS_ORDER.length`(=6) 파생 → 잔여 빈 track 없음. PASS.
- **BDD-2 (review → in-progress 표시)**: `groupByStatus` 에서 `DISPLAY_BUCKET['review'] = 'in-progress'` 적용 → review 티켓이 `byStatus['in-progress']` 에 push. Column 렌더는 `byStatus[s] ?? []` 로 in-progress 컬럼이 해당 배열을 받음. PASS.
- **BDD-3 (review 가 unknown 미집계)**: `KNOWN_STATUS_SET.has('review') === true` → `known=true` → `unknownCount` 미증가 → `unknownCount > 0` 거짓 → `SchemaMismatchBanner` 미렌더. PASS.
- **BDD-4 (Status 타입·카드 표시 불변)**: `types.ts` 미수정 → `'review'` 유효 상태값 유지. Card 의 `qa_status`/`qa_loops` 칩 로직 미변경. PASS.

### self-verify 결과

- `pnpm --filter @productune/gui build` → **PASS** (tsc 타입체크 통과 + vite 3개 번들 `✓ built`). `Partial<Record<Status, Status>>` 인덱싱·`STATUS_ORDER` 길이 보간 모두 타입 에러 없음.

### deviation

- 티켓 §1/§2 가 명시하지 않은 `kanban` 그리드 track 수 수정(#4)을 추가함. 이유: 컬럼만 6개로 줄이고 그리드를 7-track 으로 두면 BDD-1 의 "6개만 렌더" 가 시각적으로 빈 7번째 track 으로 위반되기 때문. 동일 파일·동일 SOT(STATUS_ORDER) 파생이라 스코프 내로 판단.
