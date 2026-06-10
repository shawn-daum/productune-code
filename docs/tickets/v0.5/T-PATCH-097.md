---
ticket_id: T-PATCH-097
title: "유저 요청형 promotion gate는 question 스타일 별도 UI로 (#7)"
version: v0.5
round: patch
type: feature
status: user-verify
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: promotion-gate-question-ui
qa_status: pass
qa_loops: 0
area_tags: [gui/chat, gui/promotion, gui/gate]
created_at: 2026-06-10
---

| T-PATCH-097 | promotion-gate-question-ui | user-verify |

# T-PATCH-097: 유저 요청형 promotion gate는 question 스타일 별도 UI로 (#7)

> 유저가 직접 요청한 promotion은 자동 후보 카드(PromotionCard)와 구분해, AskUserQuestion 같은 question 스타일 UI로 표시한다.

## 1. Request

### 유저 지시 (verbatim)

> "Promotion gate 유저 요청시 question처럼 별도의 ui필요."

### Current state

- promotion gate는 현재 채팅 안에 인라인 `PromotionCard`(`packages/gui/src/components/workspace/chat/PromotionCard.tsx`, `message.kind === 'promotion-candidate'`)로 노출된다 — title summary + `targetTier`/`sourceTicketId` pill + rationale + Approve/Reject CTA 구성.
- `AskUserQuestionCard`(`packages/gui/src/components/workspace/chat/AskUserQuestionCard.tsx`, `kind === 'ask-user-question'`)는 수직 옵션 스택(key/title/desc row + checkmark)을 렌더한다 — 유저가 promotion gate에 적용하길 원하는 "question" UX가 바로 이것이다.
- 관련 컴포넌트: `PhaseTransitionGate.tsx`, `PendingPromotionDrain.tsx`, `PendingGateChip.tsx`(실제 경로 `packages/gui/src/components/workspace/chat/PendingGateChip.tsx`).

### Task

promotion이 **유저 요청(user-requested)**으로 발생한 경우(자동으로 surfacing된 candidate와 대비), 현재 `PromotionCard` 레이아웃 대신 **question 스타일 UI**(AskUserQuestionCard와 동일 계열)로 표시한다.

- 디자이너 책임: (a) "유저 요청 vs 자동 surfacing" trigger 구분 정의, (b) question 스타일 카드 spec 정의.
- 만약 "user-requested promotion"에 해당하는 하부 데이터/이벤트가 아직 없으면 §3/§4에 dev 선행 의존성으로 명시한다.

## 2. Acceptance

- [x] **[AC-1]** promotion gate의 발생 출처가 "user-requested"인지 "auto-surfaced candidate"인지 구분하는 명시적 플래그/필드가 메시지(또는 gate event)에 존재한다(없으면 dev가 추가 — §4 의존성 참조). — GUI 측: `PromotionPayload.origin?: 'user-requested' | 'auto'` 필드 추가(`packages/gui/src/lib/types.ts`). 단, 이 필드를 user 발화/액션 경로에서 실제로 stamp 하는 **백엔드 gate-emit 로직은 미구현**(아래 의존성 참조). 필드 부재 시 안전 폴백.
- [x] **[AC-2]** user-requested promotion은 question 스타일 UI(수직 옵션 스택, AskUserQuestionCard 계열의 row + checkmark 인터랙션)로 렌더된다. — `PromotionQuestionCard.tsx`(신규), `MessageBubble.tsx` 분기. (`origin` stamp 의존성 해소 시 실유저 경로에서 활성)
- [x] **[AC-3]** auto-surfaced candidate는 기존 `PromotionCard` 레이아웃을 그대로 유지한다(회귀 없음). — `origin` 부재/`'auto'` 시 기존 `PromotionCard` 폴백.
- [x] **[AC-4]** question 스타일 카드는 promotion에 필요한 핵심 정보(targetTier, sourceTicketId, rationale)를 옵션/본문에 손실 없이 전달하고, 선택지는 최소 Approve / Reject 두 경로를 명확히 제공한다. — pill(targetTier/sourceTicketId) + candidateSummary + rationale 본문 + Approve/Reject 옵션.
- [x] **[AC-5]** 두 경로(approve/reject) 모두 기존 PromotionCard와 동일한 다운스트림 액션(이벤트/핸들러)을 트리거한다 — 시각만 다르고 동작 결과는 동일. — 공유 hook `usePromotionResolve()` 로 동일 IPC(`chat:resolvePromotion`)+store patch+system line 트리거. reject 도 §1.5.5 inline confirm 동일 유지.
- [x] **[AC-6]** `pnpm tsc --noEmit` 통과, 새 에러 없음. — `tsc --noEmit -p tsconfig.json` green (packages/gui), locale key parity OK (768 keys).

## 3. Out of scope

- promotion gate의 의사결정 로직/티어 승격 규칙 자체 변경(언제 승격 가능한지)은 다루지 않는다 — 표시/입력 UI 한정.
- auto-surfaced `PromotionCard` 비주얼 리디자인.
- `PhaseTransitionGate` / `PendingPromotionDrain` 의 드레인 흐름 변경(표시 분기만 추가, 흐름은 유지).
- (의존성 한계) "user-requested promotion" 이벤트/데이터가 아직 없을 경우, 해당 이벤트의 백엔드/엔진 산출 로직 설계는 본 티켓 범위 밖 — §4의 dev 선행 작업으로만 표기.

## 4. Implementation plan

> 디자이너 메모: 핵심은 "trigger 구분 → 분기 렌더"이며, 구분 신호가 데이터에 없으면 그 신호부터 만들어야 한다.

1. **데이터/trigger 구분 (선행 의존성 확인)**
   - `promotion-candidate` 메시지(또는 gate event) 페이로드에 `origin`/`requestedBy` 류 구분 필드가 있는지 확인.
   - **없으면 (dev 선행 의존성):** promotion이 유저 발화/액션으로 생성된 경로에 `origin: 'user-requested'`(대비: `'auto'`)를 부여하도록 gate 생성 지점(엔진/이벤트 emit)에 필드 추가. 이 필드가 GUI 메시지까지 전달되어야 분기 가능 — 이 항목이 미해결이면 AC-2~AC-5 진행 불가하므로 dev가 먼저 처리.
2. **question 스타일 카드 컴포넌트**
   - `packages/gui/src/components/workspace/chat/AskUserQuestionCard.tsx`의 레이아웃(수직 옵션 스택, row + checkmark) 패턴을 재사용/공유하여 `PromotionQuestionCard`(신규) 또는 `PromotionCard`의 variant로 구현.
   - 옵션 구성: Approve(→ targetTier 승격), Reject. rationale/targetTier/sourceTicketId는 카드 본문 또는 옵션 desc에 배치.
3. **렌더 분기**
   - `message.kind === 'promotion-candidate'` 렌더 지점에서 `origin === 'user-requested'`이면 question 스타일, 아니면 기존 `PromotionCard`.
   - 분기 위치는 PromotionCard 호출부(메시지 렌더러)에서 처리하여 두 컴포넌트를 깔끔히 분리.
4. **액션 배선 동일성**
   - approve/reject 핸들러는 기존 PromotionCard와 동일 콜백/이벤트로 연결(중복 로직 없이 공유).
5. `pnpm tsc --noEmit` 및 unused 정리.

## 5. QA scope (smoke)

- [ ] 유저가 직접 promotion을 요청하는 경로를 트리거 → 채팅에 question 스타일 카드(수직 옵션 스택)가 렌더됨.
- [ ] 자동 surfacing되는 promotion candidate는 기존 PromotionCard 그대로 렌더됨(회귀 없음).
- [ ] question 스타일 카드에서 Approve 선택 → 기존 승격 동작과 동일 결과. Reject 선택 → 기존 거부 동작과 동일 결과.
- [ ] question 카드에 targetTier / sourceTicketId / rationale 정보가 누락 없이 표시됨.
- [ ] `origin` 구분 필드 부재 시(의존성 미해결) 회귀로 빠지지 않고 안전하게 기존 PromotionCard로 폴백됨.
- [ ] `pnpm tsc --noEmit` green.

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-qa | opus/standard | verify | Code-verify of §2 against implemented code (centralized build GREEN: tsc 0 / locale parity 771 / protected OK / smoke passed). **AC-1 PASS** — `PromotionPayload.origin?: 'user-requested' \| 'auto'` at `types.ts:108`, JSDoc 계약상 absent→`auto` safe fallback. **AC-2 PASS(code)** — `PromotionQuestionCard.tsx`(신규) 수직 옵션 스택(`opt-stack`, row + `opt-check` checkmark/spinner), `MessageBubble.tsx:50-58` fork on `origin === 'user-requested'`. **AC-3 PASS** — `MessageBubble.tsx:57` origin 부재/`auto`→기존 `PromotionCard` 폴백(회귀 없음). **AC-4 PASS** — question 카드가 prompt + candidateSummary + targetTier/sourceTicketId pill + rationale + Approve/Reject 2-옵션 손실 없이 전달. **AC-5 PASS** — approve/reject 둘 다 공유 hook `usePromotionResolve()`(`PromotionCard.tsx:51`) 경유 → 동일 IPC(`chat:resolvePromotion`)+store patch+system line; reject 도 §1.5.5 inline confirm(confirm/cancel) parity 유지. **AC-6 PASS** — 중앙 빌드 tsc 0, locale parity 771; `workspace.promotion.question.{prompt,approveDesc,rejectDesc}` en/ko 양쪽 존재. **status: user-verify** — AC-2 의 실유저 question-card 렌더는 live promotion emit 가 있어야 눈으로 확인 가능(100 활성화분 의존). **user-verify 절차:** GUI 에서 "이 패턴 global habit 으로 승격해줘" 류로 PO 에 직접 요청 → 채팅에 question-style 카드(수직 옵션 스택, prompt 문구 "You asked to promote this. Apply it?")가 뜨는지; auto-surfaced candidate 는 기존 PromotionCard 로 뜨는지; Y(Approve)/N(Reject→confirm) 선택 결과가 동일한지 확인. qa_status: pass(코드 검증 가능분). doctrine diff 0(`packages/core/doctrine` working tree clean). |
| 2026-06-10 | pdt-developer | opus/standard | impl | Question-style promotion gate 구현. `PromotionPayload.origin?: 'user-requested' \| 'auto'` 필드 추가(types.ts). `PromotionCard.tsx`의 resolve 로직을 공유 hook `usePromotionResolve()`로 추출 → 신규 `PromotionQuestionCard.tsx`가 동일 hook 재사용(AC-5 동작 동일성). `MessageBubble.tsx`에서 `origin === 'user-requested'` 분기, 그 외는 기존 `PromotionCard` 폴백(회귀 없음·필드 부재 시 안전). i18n `workspace.promotion.question.*` en/ko 추가. tsc green, locale parity OK. **선행 의존성(미해결):** user 발화/액션 경로에서 promotion 생성 시 `origin: 'user-requested'`를 stamp 하는 백엔드 gate-emit 로직이 아직 없음 — 현재 GUI에는 promotion-candidate 페이로드 생성부 자체가 stub(`electron/ipc/po.ts` chat:resolvePromotion = noop, PO tool-use 트리거 미구현). 따라서 question UI 경로는 배선 완료·dormant 상태이며, 해당 emit 이 origin 을 stamp 하기 시작하면 자동 활성. AC-2 의 실유저 E2E 트리거 + QA smoke(§5 1~4행)는 이 의존성 해소 후 검증 가능 → §5 박스 미체크 유지. |
