---
ticket_id: T-PATCH-068
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L3
risk_flags: chat-panel-layout, flex-flow, pending-derivation
slug: ask-user-question-docked-inflow-panel
qa_status: pending
requires_qa: true
area_tag: gui-chat
parent_ticket: T-PATCH-065
---

# T-PATCH-068: AskUserQuestion 재설계 — docked in-flow panel (no scrim, no cover) + most-recent-only pending + X = no-LLM 보류

## Context

> **RE-SPEC R3 (supersedes the responsive bottom-sheet plan).** 이 티켓은 여러 라운드 패치됨(overlay→responsive sheet→always-sheet). shawn 가 계속 인터랙션 문제에 부딪힘 → 또 다른 패치가 아니라 **일관된 프레젠테이션 재설계**가 필요. 아래 4개 결정으로 sheet/scrim/overlay 접근을 전면 폐기.
>
> 핵심 결함(현행 working tree 확인):
> 1. **scrim 이 chat 을 dim** — `sheetScrim`(L884, rgba(0,0,0,0.40))이 뒤 chat 을 어둡게 함. shawn 은 답을 정하려면 **뒤 chat 을 그대로 읽어야** 함. scrim WRONG → 제거.
> 2. **모달이 chat 을 가림** — `questionSheet`(L893)는 `position:absolute; bottom:0` 으로 `wrap`(relative) 안에 떠서 하단 chat 메시지를 **덮음**. shawn: "모달에 가려서 안보이는 내용이 있으면 안돼". 질문 UI 가 **실제 레이아웃 공간**을 차지해 message list 가 그 위로 줄어들되 **전부 스크롤 가능**해야 함 (Claude Code inline question 처럼: composer 자리에 in-flow 로 앉아 메시지를 위로 밀어냄, 떠 있지 않음).
> 3. **오래된 질문이 재등장** — `pendingQuestion`(L64-71) = `[...messages].reverse().find(unresolved && !dismissed)`. `dismissedQuestionId` 는 id **한 개**만 보유 → 세션에 ask-user-question 이 여러 개면 최신을 dismiss/answer 해도 **더 오래된 미해결 질문으로 fall-through** → 모달 재등장. 가장 마지막 질문 **단 하나**만 pending 후보; 그것이 resolved/dismissed 면 pending **없음**(오래된 질문은 stale, 절대 부활 안 함).
> 4. **KEEP** — X → 합성 `kind:'po'` 버블 "질문 답변 보류, 어떻게 진행하시겠어요?"(LLM 왕복 없음) + persist (이미 구현됨, 회귀 금지). option-select → chip 으로 resolve (`AskUserQuestionCard` `handleSelect` 가 `payload.resolved` set, 이미 동작). narrow/wide 모두 동작.

현행 구현(uncommitted working tree, `ChatPanel.tsx`):
- `pendingQuestion` useMemo L64-71 — fall-through 버그(위 3번).
- `questionOverlayNode` IIFE L309-353 — `sheetScrim` + `questionSheet`(둘 다 `position:absolute`) 합성. L431 에서 `wrap` 안에 absolute 렌더 → chat 위에 떠서 가림 + dim.
- `handleDismissQuestion` L221-238 — no-LLM PO 버블 + persist (KEEP).
- `handleModalSend`/`onModalKeyDown` L179-218 — 질문에 실제 답하는 embedded 입력 경로 (KEEP).
- 별도 정상 composer = `inputArea` L434-516.
- 이전 라운드의 responsive ResizeObserver/`isNarrow`/breakpoint 코드 = **working tree 에 없음**(이미 제거됨). 추가하지 말 것.

## Acceptance Criteria

> render-verifiable = QA/playwright 검증 가능. eyeball = shawn 육안(외관/체감).

### A. Docked in-flow panel — no overlay, no scrim, no cover
- [ ] AC-1 (render): pending 질문 UI 가 chat 컬럼(`wrap` flex)의 **일반 flex child** 로 렌더 — `position:absolute` 아님, scrim element 없음. `sheetScrim` 스타일+element **제거됨**. 패널이 실제 레이아웃 공간을 차지.
- [ ] AC-2 (render): pending 동안 docked 패널이 정상 composer(`inputArea`)를 **대체(replace)** — 정상 textarea/send 버튼이 DOM 에 렌더 안 됨. pending 해소(resolved/dismissed)되면 정상 composer 복귀. (동시에 입력창 2개 없음.)
- [ ] AC-3 (eyeball): 패널 위 chat 메시지가 **dim 없이 완전 가독** + message list(`rp-msgs`)가 패널 위로 **줄어들어** 들어맞고 **스크롤 유지** — chat 콘텐츠가 영구적으로 가려지거나 잘리지 않음.
- [ ] AC-4 (render): 패널 구성 = header(X 우측 정렬) · scrollable body(`AskUserQuestionCard`) · embedded 입력(textarea + send). 긴 질문은 body 안에서 스크롤(`overflowY:auto`), 패널 높이 cap(~55%) → message list 가 항상 위에 남음.
- [ ] AC-5 (eyeball): narrow + wide 모두 정상 — void 없음, scrim 없음, cover 없음. (very-wide 시 body 콘텐츠 max-width 중앙 정렬은 optional.)

### B. pending 도출 — most-recent-only, 재등장 없음
- [ ] AC-6 (render): `pendingQuestion` = ask-user-question 메시지 중 **가장 마지막 1개**만 후보. 그 메시지가 `payload.resolved===true` **또는** `id===dismissedQuestionId` 면 → pending **없음**(`undefined`). 더 오래된 ask-user-question 은 **절대** pending 이 되지 않음(fall-through 없음).
- [ ] AC-7 (render): 최신 질문 X-dismiss 후 → pending 없음(오래된 질문 부활 안 함). option-select(`payload.resolved=true`) 후 → pending 없음.
- [ ] AC-8 (render): dismiss 이후 **새로** 도착한 ask-user-question 은 정상 표시(`id !== dismissedQuestionId`).

### C. X = no-LLM 보류 (KEEP) + option-select chip (KEEP)
- [ ] AC-9 (render): X 클릭 → USER 메시지 append 안 함, `api.poSendMessage` 호출 안 함, `setStreaming`/`setInFlightKind` set 안 함. `kind:'po'` 버블 1개 append (text `"질문 답변 보류, 어떻게 진행하시겠어요?"`) + `api.chatAppendMessage` persist → reload 후 잔존.
- [ ] AC-10 (render): option-select → `AskUserQuestionCard` 기존 `handleSelect` 경로로 chip resolve — 변경 없이 동작.

> **폐기된 AC**(이전 라운드): responsive bottom-sheet vs full-overlay, breakpoint 420, ResizeObserver/`isNarrow`, slide-up `translateY(100%)`, scrim. 전부 제거 — docked in-flow 단일 모드로 대체.

## Out of scope

- `AskUserQuestionCard` 내부 렌더(카드 콘텐츠) 변경 — 그대로 embed.
- embedded 입력(`handleModalSend`/`onModalKeyDown`) 동작 변경 — 현행 유지(질문에 실제 답하는 경로).
- `handleDismissQuestion` 로직 변경 — 현행 유지(no-LLM PO 버블 + persist). 회귀 금지.
- 정상 composer(`inputArea`) 내부 동작 변경 — 조건부로 보이고/숨길 뿐.
- breakpoint/responsive-mode 를 design-system token 으로 승격 — 본 설계는 단일 모드라 불필요.

## Plan

**File: `packages/gui/src/components/workspace/ChatPanel.tsx`** (코드 변경 전부 이 파일. 전역 css keyframe 불필요 — 폐기.)

설계 결정(핵심): 질문 UI = chat 컬럼 하단의 **in-flow docked 패널**로, pending 동안 **정상 composer 를 대체**한다. Claude Code inline-question 모델. 떠 있지 않으므로 scrim/overlay/breakpoint 전부 제거. `rp-msgs`(`flex:1`)가 패널 위로 줄어들어 chat 전체가 가독+스크롤 유지. 입력은 항상 1개(질문 있으면 패널의 embedded 입력, 없으면 정상 composer) → 어느 입력이 답인지 혼동 없음. defer 가 필요하면 X → PO 버블 → 정상 composer 복귀가 탈출구.

### 1. `pendingQuestion` 도출 — most-recent-only (재등장 버그 픽스)

L64-71 을 아래로 **교체**. 가장 마지막 ask-user-question 을 **먼저** 찾고, **그 다음** resolved/dismissed 게이트. 마지막 1개만 본다 → 오래된 질문 fall-through 불가.

```ts
// T-PATCH-068: 가장 마지막 ask-user-question 단 하나만 pending 후보.
// resolved 또는 dismissed 면 nothing pending — 오래된 질문은 절대 부활 안 함.
const pendingQuestion = useMemo(() => {
  const last = [...messages].reverse().find((m) => m.kind === 'ask-user-question')
  if (!last) return undefined
  if ((last.payload as any)?.resolved) return undefined   // 답변됨 → pending 없음 (AC-7)
  if (last.id === dismissedQuestionId) return undefined    // X-dismiss → pending 없음 (AC-7)
  return last
}, [messages, dismissedQuestionId])
```

- AC-6/7: 게이트가 `last` 에만 적용 → resolved/dismissed 면 `undefined`, 더 과거로 안 넘어감.
- AC-8: dismiss 후 새 질문 도착 → `last` = 새 질문, `dismissedQuestionId` 는 옛 id → 새 질문은 `id` 불일치라 pending. single-id dismissed state 로 충분(이제 항상 마지막 메시지 id 와만 비교).
- `dismissedQuestionId` state(L61) 와 `handleDismissQuestion`(L221-238) **그대로** — 변경 없음.

### 2. JSX — docked 패널이 composer 자리에서 조건부 렌더

**(2a) `questionOverlayNode` IIFE(L309-353) 제거.** absolute 합성 노드 불필요 — 아래 인라인 조건부로 대체.

**(2b) L430-431 의 `{questionOverlayNode}` 렌더 제거.** (scrim+sheet absolute 노드)

**(2c) composer slot 을 조건부로.** 현행 `inputArea` 블록(L434-516)을 아래 조건부로 감싼다. `RateLimitBanner`(L420-428)는 이 조건부 **위**에 그대로 둔다.

```tsx
{/* T-PATCH-068: pending 동안 docked 질문 패널이 정상 composer 를 대체 (in-flow, no overlay) */}
{pendingQuestion ? (
  <div style={questionDock}>
    <div style={dockHeader}>
      <span style={dockLabel}>{t('workspace.chat.questionLabel') /* 키 없으면 리터럴 "질문" */}</span>
      <button style={modalCloseBtn} onClick={handleDismissQuestion} aria-label="질문 보류">
        <X size={16} strokeWidth={2} />
      </button>
    </div>
    <div style={dockBody}>
      <AskUserQuestionCard message={pendingQuestion} />
    </div>
    <div style={modalInputArea}>
      {/* 기존 modalTextarea + modalSendBtn 그대로 (handleModalSend/onModalKeyDown 유지) */}
    </div>
  </div>
) : (
  <div style={inputArea}>
    {/* 기존 composer (UsageBar + textarea + inputRow) 전부 그대로 */}
  </div>
)}
```

- AC-2: `pendingQuestion` 있으면 정상 composer DOM 미렌더 → 입력 1개.
- AC-9/10: X 는 기존 `handleDismissQuestion`, embedded send 는 기존 `handleModalSend`, option-select 는 `AskUserQuestionCard` 내부 — 전부 변경 없음.
- 리스트 suppression L408-411(`pendingQuestion?.id` 로 unresolved pending 을 list 에서 숨김) — **그대로**. 새 도출과 호환.

### 3. styles — sheet/scrim 제거, docked 패널 추가

**(3a) DROP `sheetScrim`(L883-890) — 스타일+element 완전 삭제.** (no dim)

**(3b) `questionSheet`(L892-908) → `questionDock` 로 교체.** `position/left/right/bottom/zIndex/boxShadow(위로 뜨는 그림자)/animation` 제거. in-flow flex child:

```ts
// T-PATCH-068: in-flow docked 질문 패널 — composer 자리. 떠 있지 않음, scrim 없음.
const questionDock: React.CSSProperties = {
  flexShrink: 0,
  maxHeight: '55%',                 // cap → rp-msgs 가 위 공간 차지+스크롤 유지 (AC-3/4)
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderTop: '1px solid #2A2A2A',   // composer 처럼 위 경계
  background: '#121212',
}
```

**(3c) `modalBody`(L935-941) → `dockBody` 로 교체** (calc maxHeight 제거; flex 안에서 스크롤):

```ts
const dockBody: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,                     // flex child 가 줄어들어 내부 스크롤되게
  overflowY: 'auto',
  padding: '12px 16px',
}
```

**(3d) `modalHeader`(L911-918) → `dockHeader`** (label 좌 + X 우 정렬):

```ts
const dockHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',  // label 좌 / X 우
  alignItems: 'center',
  padding: '8px 12px',
  flexShrink: 0,
  borderBottom: '1px solid #1E1E1E',
}
const dockLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#A0A0A0',
}
```

**(3e) KEEP unchanged:** `modalCloseBtn`, `modalInputArea`, `modalTextarea`, `modalSendBtn`. (이름 그대로 재사용)

**(3f) optional (eyeball, very-wide):** `dockBody` 안 카드를 `maxWidth: 640, margin: '0 auto'` 컨테이너로 감싸 넓은 패널에서 중앙 정렬. 본 티켓 필수 아님 — dev 재량.

### 4. 제거 확인 (dead code)

- 전역 css 의 `@keyframes questionSheetSlideUp` (이전 라운드에서 추가됐다면) — 사용처 사라짐 → 제거.
- ResizeObserver/`isNarrow`/`QUESTION_MODAL_SHEET_BREAKPOINT` — working tree 에 없음(확인됨). 추가 금지.
- `questionOverlayNode` const, `sheetScrim`/`questionSheet`/`modalBody`/`modalHeader` 구 스타일 — 위에서 제거/개명.

### 검증 분리

- **render-verifiable (QA/playwright):**
  - AC-1: scrim element 없음, 패널에 `position:absolute` 없음.
  - AC-2: pending 시 정상 composer 미렌더 / 해소 시 복귀.
  - AC-4: 패널 header(X)+body+input 구조, body `overflowY:auto`.
  - AC-6/7/8: `pendingQuestion` 도출 — 마지막 1개만, resolved/dismissed → undefined, fall-through 없음, 새 질문 표시.
  - AC-9: X → USER 미append / `poSendMessage` 미호출 / `streaming` 불변 / `kind:'po'` 버블 exact text / `chatAppendMessage` persist.
  - AC-10: option-select → chip resolve.
- **eyeball (shawn):**
  - AC-3: 위 chat dim 없이 가독 + list 줄어듦+스크롤, cover 없음.
  - AC-5: narrow/wide 둘 다 — void/scrim/cover 없음. (+ optional very-wide 중앙 정렬 체감.)
