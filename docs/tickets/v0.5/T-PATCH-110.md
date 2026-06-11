---
ticket_id: T-PATCH-110
version: v0.5
round: patch
type: chore
status: review
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: smoke
qa_loops: 0
slug: dev-promotion-card-trigger
area_tags: [gui/dev-tools, gui/promotion]
created_at: 2026-06-11
---

# T-PATCH-110 — Dev/Test trigger: promotion card 강제 렌더 (auto / user-requested)

## §1 Request (why)

T-PATCH-097 + T-PATCH-100 으로 promotion gate 카드가 chat 에 인라인으로 뜬다.
`PromotionPayload.origin` 에 따라 `MessageBubble` 이 분기한다:
- `origin: 'user-requested'` → `PromotionQuestionCard` (질문형) — **이미 검증됨**.
- `origin: 'auto'` 또는 absent → classic `PromotionCard` ("PO가 먼저 '이거 promotion 할까요?' 라고 묻는 카드") — **아직 직접 못 봄**.

문제: auto 카드는 PO 판단(PO-judgment-driven)으로 surfacing 되어 결정적으로(deterministic) 띄우기 어렵다.
실제 promotion 후보가 PO 턴에서 나와야만 보이므로, 개발/QA 중 카드 외형·동작을 확인하려면 매번 운에 맡겨야 한다.

목표: backend 없이 **on-demand 로 sample promotion-candidate 메시지를 store 에 직접 append** 하는
명백한 DEV-ONLY 테스트 시임(seam)을 추가한다. 실제 카드(`PromotionCard` / `PromotionQuestionCard`)가
실제 렌더 경로로 그려지는지 눈으로 확인할 수 있게 한다. 제품 기능이 아니라 테스트 보조물이므로 footprint 최소·제거 용이해야 한다.

### 조사 결과 (구현 시임)

- `packages/gui/src/store/poEvents.ts` (L247-283) — `poOnPromotionCandidate` 핸들러가 실제 경로.
  `kind: 'promotion-candidate'`, `id: promo-<msgId>-<nonce>`, `role: 'assistant'`, `status: 'done'`,
  `payload: PromotionPayload` 를 만들어 `useWorkspace.setState` 로 append 후 `sealActiveSegment()` +
  `api.chatAppendMessage` 로 persist. → dev trigger 는 이 메시지 shape 를 그대로 모사한다.
- `packages/gui/src/store/workspace.ts` (L125 / L373) — `appendMessage(message: Message)` 액션 존재.
  `useWorkspace.getState().appendMessage(card)` 로 IPC 없이 store 에 직접 추가 가능.
- `packages/gui/src/lib/types.ts` (L92-111) — `PromotionPayload` = `candidateSummary`, `targetTier`,
  `rationale`, `sourceTicketId`, optional `origin?: 'user-requested' | 'auto'`.
  `origin` absent → classic `PromotionCard` 로 안전 fallback.
- `packages/gui/src/components/workspace/QuickOpenPalette.tsx` — presentational. 항목은 부모가 주입.
  `QuickOpenItem` = `{ id, source, category?, label, sublabel?, meta?, priority, open: () => void }`.
  `category` 별 섹션 렌더(`tickets | tabs | skills | mcp | artifacts | personas`).
- `packages/gui/src/views/workspace/shell/helpers.ts` (`buildQuickOpenItems`, L174+) — 실제 항목 빌더.
  여기에 dev command 항목을 push 하는 것이 가장 저-footprint. `open` 콜백 안에서 store append 수행.

## §2 Acceptance

- [x] A1. QuickOpen(⌘P)에서 **"Dev: sample promotion card (auto)"** 항목 실행 시,
  `origin: 'auto'` 인 sample `promotion-candidate` 메시지가 chat 에 append 되고 **classic `PromotionCard`** 가 렌더된다.
- [x] A2. QuickOpen 에서 **"Dev: sample promotion card (user-requested)"** 항목 실행 시,
  `origin: 'user-requested'` 인 sample 메시지가 append 되고 **`PromotionQuestionCard`** (질문형)가 렌더된다.
- [x] A3. append 된 메시지는 실제 핸들러와 동일 shape(`kind: 'promotion-candidate'`, `role: 'assistant'`,
  `status: 'done'`, 고유 `id`, `payload: PromotionPayload`)여서 `MessageBubble` 분기가 정상 동작한다.
- [x] A4. dev command 는 **명백히 dev-only** 로 표시된다: `label` 에 `"Dev:"` prefix 필수.
  추가로 `import.meta.env.DEV` 가드로 prod 빌드에서는 항목이 노출되지 않게 한다(§4 결정 참조).
- [x] A5. 두 command 는 일반 사용 시 거슬리지 않는다: QuickOpen resting/검색 시 낮은 priority 로 하단에 위치
  (기존 personas priority 30 이하, 예: 10).
- [x] A6. 카드 렌더 후 기존 approve/reject(또는 question) 인터랙션이 **추가 backend 없이도** 시각적으로 동작
  (resolve IPC 가 없는 dev append 라 실제 commit 은 안 될 수 있음 — 외형/분기 확인이 목적임을 코드 주석에 명시).
- [x] A7. 제거 용이: 변경은 한 곳(helpers `buildQuickOpenItems` 내 dev 블록 + sample payload 헬퍼)에 모이고,
  블록 삭제만으로 완전 원복된다. 신규 IPC/preload/main 변경 없음.

## Persona Activity

- pdt-developer (impl) — `helpers.ts` 에 dev-only QuickOpen 두 항목 + `makeSamplePromotionMessage`
  헬퍼 추가. `import.meta.env.DEV` 가드 + "Dev:" label prefix, priority 10, `appendMessage`
  로 휘발성 append(IPC/persist 없음). 변경 파일 1개(helpers.ts) + 타입 import 추가만.
  `tsc --noEmit -p tsconfig.json` (packages/gui) green. status → review.

## §3 Out of scope

- 실제 promotion resolve(approve/reject) 의 backend 반영 — dev append 는 순수 렌더 확인용. resolve IPC 연동 안 함.
- chat.json persist — dev sample 은 휘발성(메모리 only). `api.chatAppendMessage` 호출하지 않음(reload 시 사라짐 OK).
- `MessageBubble` / `PromotionCard` / `PromotionQuestionCard` 자체 로직 변경 — 기존 카드를 그대로 재사용.
- 새 QuickOpen `category` 추가 — 기존 카테고리 중 하나로 분류하거나 무카테고리로 처리(§4에서 결정).
- prod 사용자용 promotion 트리거/디버그 UI — 본 티켓은 dev/QA 보조물 한정.

## §4 Implementation plan

1. **Sample payload 헬퍼** — `helpers.ts`(또는 인접 dev 전용 모듈)에 `makeSamplePromotionMessage(origin)` 추가.
   고유 id (`dev-promo-${Date.now()}-${nonce}`) + 아래 sample `PromotionPayload` 로 `Message` 생성:
   - `candidateSummary`: "QA smoke 실행 전 dev server 준비 상태를 항상 확인한다" (예시 — habit 후보풍 1줄)
   - `targetTier`: `'global'` (요청 명시; classic 카드의 tier 라벨 확인용)
   - `sourceTicketId`: `'T-PATCH-110'`
   - `rationale`: "여러 프로젝트에서 반복된 패턴 — global habit 으로 승격 검토" (1~2줄)
   - `origin`: 파라미터(`'auto'` | `'user-requested'`)
   메시지 필드: `kind: 'promotion-candidate'`, `role: 'assistant'`, `status: 'done'`,
   `created_at: new Date().toISOString()` — `poEvents.ts` 핸들러와 동일 shape.
2. **Store append** — command `open` 콜백에서 `useWorkspace.getState().appendMessage(card)` 호출.
   IPC/persist 없음(§3). 핸들러의 `sealActiveSegment()` 는 turn-local 상태용이라 dev append 에선 불필요 — 호출 안 함.
3. **QuickOpen command 등록** — `buildQuickOpenItems` 에 두 `QuickOpenItem` push:
   - `{ id: 'dev:promo-auto', source: 'artifact', label: 'Dev: sample promotion card (auto)', priority: 10, open }`
   - `{ id: 'dev:promo-user', source: 'artifact', label: 'Dev: sample promotion card (user-requested)', priority: 10, open }`
   `category` 는 검색 시 섹션 노출이 필요하면 `'artifacts'` 로, 아니면 미지정(resting recent 에만 등장).
   `source` 는 기존 enum 재사용(신규 아이콘 불필요).
4. **Dev gating (결정)** — `import.meta.env.DEV` 가 true 일 때만 두 항목을 push.
   prod 번들에서는 dead-code 로 제거되어 노출 0. 추가로 `"Dev:"` label prefix 로 dev 빌드 내에서도 명확히 구분(A4).
   (라벨만으로 끝내지 않고 env 가드까지 두는 이유: prod GUI 에 테스트 카드가 새어나가지 않도록.)
5. **주석** — dev 블록 상단에 `// T-PATCH-110: DEV-ONLY promotion card 렌더 확인용. 제거 시 이 블록만 삭제.`
   및 A6 의 "resolve 는 미연동(외형 확인용)" 한 줄 명시.

## §5 QA smoke

- `pnpm --filter gui dev` (or 프로젝트 dev 명령)로 GUI 기동 → 프로젝트 진입 후 ⌘P.
- 검색창에 "Dev" 입력 → 두 항목 노출 확인.
- "Dev: sample promotion card (auto)" 실행 → chat 에 **classic PromotionCard** 렌더(approve/reject 버튼 + targetTier `global` 라벨) 시각 확인.
- "Dev: sample promotion card (user-requested)" 실행 → **PromotionQuestionCard**(질문형) 렌더 확인.
- prod 빌드(`pnpm --filter gui build`) 또는 `import.meta.env.DEV` false 경로에서 두 항목이 **노출되지 않음** 확인.
- 콘솔 에러 없음 / 기존 QuickOpen 항목·내비게이션 회귀 없음.
