---
ticket_id: T-PATCH-100
title: "user-requested promotion gate 백엔드 활성화 — origin stamp + resolvePromotion 실구현 (T-PATCH-097 후속)"
version: v0.5
round: patch
type: feature
status: done
phase: 3
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: promotion-gate-backend-activate
qa_status: pass
qa_loops: 0
area_tags: [gui/promotion, infra/ipc]
created_at: 2026-06-10
---

| T-PATCH-100 | promotion-gate-backend-activate | user-verify |

# T-PATCH-100: user-requested promotion gate 백엔드 활성화 (T-PATCH-097 후속)

> T-PATCH-097이 렌더러에 깔아둔 question-style promotion 카드(`payload.origin === 'user-requested'` 분기)는 현재 **dormant** 상태다. 아무 백엔드도 `promotion-candidate` 메시지를 만들지 않고, `origin`을 stamp 하지 않으며, `chat:resolvePromotion`은 noop stub 이다. 본 티켓은 이 기능을 "켜는" 최소 백엔드를 만든다.

## 1. Request

### 배경 — T-PATCH-097 의존성

T-PATCH-097(status: review)은 렌더러 분기를 완성했다:

- `MessageBubble.tsx`: `kind === 'promotion-candidate'` && `payload.origin === 'user-requested'` → `PromotionQuestionCard`, 아니면 기존 `PromotionCard` 폴백.
- `PromotionPayload.origin?: 'user-requested' | 'auto'` 필드 추가(`packages/gui/src/lib/types.ts:108`).
- approve/reject 는 공유 hook `usePromotionResolve()`(`PromotionCard.tsx:51`)로 동일 동작 — store patch + system line + `chat:resolvePromotion` IPC 호출.

097이 명시한 미해결 선행 의존성(그 티켓 Persona Activity 마지막 줄):
1. **promotion-candidate 메시지 생성부 자체가 없다.** `po-runner.ts`에는 `onAskUserQuestion`(Path A tool_use + Path B `ask_user_question` result-text marker)만 있고, `promotion_candidates[]` 를 파싱해 카드로 emit 하는 경로가 전무하다. → 카드가 채팅에 절대 안 뜬다.
2. **`origin` 을 stamp 하는 로직이 없다.** 필드는 타입에만 존재.
3. **`chat:resolvePromotion` 은 noop**(`electron/ipc/po.ts:146-160`) — approve/reject 가 chat.json 에 아무것도 안 남긴다(렌더러 in-memory store 만 patch).

즉 question UI 는 **이중으로 dormant**: ① 메시지가 안 만들어지고 ② origin 도 안 찍힌다. 본 티켓이 ①②③을 해결해 097의 산출물을 활성화한다.

### 조사 결과 — origin 은 doctrine 이 아니라 UI/transport 관심사

- `common/bookshelf/promotion-candidate-schema.md`: persona 가 emit 하는 `promotion_candidates[]` 는 7필드(`scope`, `pattern`, `target`, `delta`, `rationale`, `area_tag`, `source_ticket`)뿐 — **`origin` / user-requested marker 없음**. 스키마는 "무엇을 어디에 쓸지"만 다루고 "유저가 직접 요청했는지"는 다루지 않는다.
- `po/bookshelf/promotion-process.md` + `po/habit.md`: 후보는 PO 가 envelope 에서 consume → 4-quadrant 분류 → surface(또는 `pending_promotions[]` enqueue) → 유저 `y/n/edit` → PO 가 Tier 1/2 write. **PO 만 long-term write 를 한다**(persona 는 never write). PO mechanical-write whitelist(`po/habit.md:4`)에 doctrine habit/bookshelf write 는 없음 → 그건 promotion gate(PO agent) 경로이지 GUI 가 직접 하는 일이 아니다.

→ 결론: **origin 판정은 doctrine 변경 없이 GUI/electron 측에서 추론**한다. 유저 발화로 트리거된 promotion 인지(=`user-requested`) vs PO 자동 surfacing 인지(=`auto`)는, candidate 가 emit 되는 **turn 이 유저 입력(`po:sendMessage`)으로 시작됐는지** 로 GUI 가 안전하게 판정할 수 있다(아래 §4). **Tier 0 doctrine 은 건드리지 않는다.**

### Task

1. PO envelope 의 `promotion_candidates[]` 를 파싱해 `kind: 'promotion-candidate'` 메시지로 채팅에 surface 하는 백엔드 경로 신설(097의 `onAskUserQuestion` 패턴 mirror).
2. 그 메시지 payload 에 `origin`(`user-requested` | `auto`)을 GUI-side 추론으로 stamp.
3. `chat:resolvePromotion` 를 실구현 — approve/reject 결과를 chat.json 에 영속 + system line. **GUI 가 정당하게 소유하는 범위로 한정**(실제 Tier 1/2 doctrine write 는 PO agent flow 에 위임).

## 2. Acceptance

- [x] **[AC-1]** PO 가 envelope 에서 `promotion_candidates[]`(또는 surface 가능한 단일 candidate)를 반환하면, 백엔드가 이를 `kind: 'promotion-candidate'` Message 로 변환해 채팅에 append 하고 chat.json 에 영속한다. (현재 = 어떤 경로도 이 메시지를 만들지 않음.)
- [x] **[AC-2]** 그 candidate 가 **유저 발화로 시작된 turn**(`po:sendMessage`)에서 emit 됐으면 `payload.origin = 'user-requested'`, PO 자동 surfacing(`pending_promotions` drain 등 유저 직접 요청이 아닌 경로)이면 `'auto'` 로 stamp 된다. 판정은 GUI/electron 측에서 수행하며 **Tier 0/1/2 doctrine 파일을 수정하지 않는다.**
- [x] **[AC-3]** `origin === 'user-requested'` candidate 는 097의 `PromotionQuestionCard`(question-style)로 렌더되고, `'auto'`/부재 candidate 는 기존 `PromotionCard` 로 렌더된다(097 분기가 실제로 발화됨 — 회귀 없음).
- [x] **[AC-4]** `chat:resolvePromotion` 가 더 이상 noop 이 아니다: outcome(`approved`|`rejected`)을 해당 메시지 payload 에 `resolved: { outcome }` 로 patch 하여 chat.json 에 영속한다(remount/reload 후 resolved 카드가 idempotent 하게 재현). 핸들러는 `{ ok: true }` 반환.
- [x] **[AC-5]** payload 에 candidate 핵심 정보(`candidateSummary`, `targetTier`, `rationale`, `sourceTicketId`)가 손실 없이 매핑된다(doctrine 7필드 → payload 매핑 §4 표 참조).
- [x] **[AC-6]** GUI/electron 은 실제 long-term doctrine(Tier 1/2 habit/bookshelf) write 를 수행하지 않는다 — resolve 핸들러는 chat.json payload 영속 + (선택) system line 까지만. 실제 doctrine write 책임은 PO agent(promotion-process) 에 남아 있음을 §3 에 명시.
- [x] **[AC-7]** `pnpm tsc --noEmit` green, locale key parity 유지(신규 i18n 키 추가 시 en/ko 동시).

## 3. Out of scope

- **Tier 0 core doctrine 변경 금지(split-out).** `promotion-candidate-schema.md` 에 `origin` 필드를 추가하는 식의 doctrine 수정은 본 티켓에서 하지 않는다. origin 은 GUI-side 추론으로 해결하므로 doctrine 불변. 만약 향후 "persona 가 origin 을 직접 emit" 으로 바꾸고 싶다면 그건 **Designer doctrine-editing flow(user-approved)** 로 별도 라우팅되는 Tier 0 작업이며 본 티켓 범위 밖.
- **실제 Tier 1/2 doctrine write 구현 금지.** approve 시 `docs/<persona>/habit.md` 등에 delta 를 실제로 쓰는 것은 PO mechanical-write/promotion-process 의 책임(PO agent). GUI resolve 핸들러는 "유저 결정의 영속 + 표시"까지만 소유. (PO 가 결정을 어떻게 집어 long-term 에 반영하는지는 기존 promotion-process 흐름 그대로.)
- promotion 의사결정 규칙(언제 승격 가능한지)·4-quadrant 분류 로직 변경.
- `PromotionQuestionCard` / `PromotionCard` 비주얼 리디자인(097 완료분 유지).
- `PendingPromotionDrain` / Phase 5 drain 흐름 재설계(본 티켓은 단건 surface + resolve 영속만).

## 4. Implementation plan

> 핵심: 097의 `onAskUserQuestion` 경로를 정확히 mirror 한 `onPromotionCandidate` 경로를 신설하고, resolve stub 을 chat.json patch 로 채운다. doctrine 은 불변.

### (A) PO envelope → promotion-candidate 메시지 emit (`packages/gui/electron/po-runner.ts`)

`onAskUserQuestion` 의 Path A/B 구조를 그대로 따른다:

1. `RunCallbacks` 에 `onPromotionCandidate(msgId, payload, meta)` 콜백 추가(기존 `onAskUserQuestion: (msgId, payload) => void` 옆, 선언부 ~line 158).
2. **파서 신설** `parsePromotionCandidates(text): PromotionCandidateRaw[]` — 기존 `parseAskUserQuestion`/`extractJsonCandidates`(line 999~) 패턴 재사용. PO result-text JSON 에서 top-level `promotion_candidates` 배열을 추출(스키마: `scope`, `pattern`, `target`, `delta`, `rationale`, `area_tag`, `source_ticket`). `[]`/부재면 빈 배열.
3. **doctrine 7필드 → `PromotionPayload` 매핑**(렌더러가 읽는 shape):

   | doctrine field | PromotionPayload field | 비고 |
   |:--|:--|:--|
   | `delta` (or 요약) | `candidateSummary` | delta 1~2줄 요약(길면 truncate) |
   | `scope`+`pattern` → `${scope}/${pattern}` | `targetTier` | 예: `global/habit` (types.ts `PromotionTier` 토큰) |
   | `rationale` | `rationale` | 그대로 |
   | `source_ticket` | `sourceTicketId` | 그대로 |
   | (GUI 추론, §B) | `origin` | `'user-requested'` \| `'auto'` |

4. result-text 처리 블록(line 650 부근, `parsePendingGate`/`parseAskUserQuestion` emit 지점) 끝에 `parsePromotionCandidates` 호출 추가 → 각 candidate 마다 `cb.onPromotionCandidate(msgId, payload, { origin })`.
5. 바인딩 helper(line 1088 부근, `onAskUserQuestion: (msgId, payload) => wc.send('po:onAskUserQuestion', …)`) 옆에 `onPromotionCandidate: (msgId, payload) => wc.send('po:onPromotionCandidate', msgId, payload)` 추가.

### (B) origin 판정 — GUI-side 추론(doctrine 불변)

- **신호 원천**: turn 이 어떻게 시작됐는지. `po:sendMessage`(유저가 직접 입력/요청한 turn) 에서 emit 된 candidate = **`user-requested`**; 그 외 경로(예: `chat:answerQuestion` resume, fresh-cycle re-orient, `pending_promotions` drain 등 유저 직접 발화가 아닌 turn)에서 온 것 = **`auto`**.
- **구현**: `ipc/po.ts` 의 `po:sendMessage` 핸들러가 turn 시작 시 module-scope flag(예: `currentTurnOrigin: 'user-requested' | 'auto'`)를 `'user-requested'` 로 세팅하고, `chat:answerQuestion`/fresh-cycle 경로는 `'auto'` 로 세팅. `withSessionCapture` 가 이미 turn 경계를 감싸므로 같은 위치에서 flag 를 set/reset. `onPromotionCandidate` 가 emit 될 때 이 flag 값을 `meta.origin` 으로 전달.
  - 대안(더 단순·동치): `runPoTurn` 호출 옵션에 `turnOrigin` 을 실어 콜백 클로저가 캡처. 구현자는 둘 중 회귀 적은 쪽 선택.
- **안전 폴백**: 판정 불가/누락 시 `origin` 미설정 → 097 분기가 자동으로 기존 `PromotionCard`(=`auto` 취급) 로 폴백(types.ts:101 주석 계약). 즉 보수적 default = `auto`.

### (C) 렌더러 수신 → 메시지 append (`packages/gui/src/store/poEvents.ts`)

097의 `po:onAskUserQuestion` 핸들러(line 196~235)를 mirror:

1. `api.poOnPromotionCandidate?.((msgId, payload) => { … })` 구독 추가.
2. `Message` 구성: `id: \`promo-${msgId}\``(`auq-` 패턴 대응 — onDone prune 의 `turnSegIds` 와 충돌 방지), `kind: 'promotion-candidate'`, `text: ''`, `status: 'done'`, `payload`(origin 포함), `created_at`.
3. store 에 append → `sealActiveSegment()` → `api.chatAppendMessage(proj.projectDir, card)` 로 chat.json 영속(reload 후 카드/ resolved 칩 재현).

### (D) preload 노출 (`packages/gui/electron/preload.ts`)

`poOnAskUserQuestion`(line 274~276) 패턴 mirror: `poOnPromotionCandidate(listener)` — `removeAllListeners('po:onPromotionCandidate')` 후 `on(...)`, unsubscribe 반환(single-subscriber).

### (E) `chat:resolvePromotion` 실구현 (`packages/gui/electron/ipc/po.ts:146-160`)

현재 noop. `chat:dismissQuestion`(line 119~140)과 동일 패턴으로 교체:

1. `getSession(opts.projectDir)` → `messageId` 카드 find → 기존 payload merge-base 확보(question 핸들러와 동일하게 clobber 방지).
2. `patchMessage(opts.projectDir, opts.messageId, { payload: { ...basePayload, resolved: { outcome: opts.outcome } } })`.
3. `{ ok: true }` 반환. 에러 시 `{ ok: false, error }`.
4. **명시적 boundary 주석**: 이 핸들러는 유저 결정의 **영속·표시**만 소유. 실제 Tier 1/2 long-term doctrine write(approve 시 delta 를 habit/bookshelf 에 반영)는 PO agent 의 promotion-process 책임이며 여기서 하지 않음(AC-6). 렌더러 `usePromotionResolve()` 가 이미 store patch + system line 을 처리하므로 핸들러는 chat.json 영속에만 집중.
   - (참고) `usePromotionResolve` 의 `appendSystemLine` 이 이미 trace system line 을 chat.json 에 append 하므로, 핸들러에서 system line 중복 생성 금지.

### (F) 마감

`pnpm tsc --noEmit` green, unused 정리, 신규 i18n 키 추가 시 en/ko parity.

## 5. QA scope (smoke)

- [ ] 유저가 "이거 global habit 으로 승격해줘" 류로 직접 요청 → PO 가 `promotion_candidates[]` emit → 채팅에 **question-style** 카드(`PromotionQuestionCard`)가 렌더됨(`origin === 'user-requested'`).
- [ ] PO 자동 surfacing(유저 직접 요청 아님) candidate → 기존 `PromotionCard` 로 렌더됨(`origin === 'auto'`/부재, 회귀 없음).
- [ ] question 카드에서 Approve → `chat:resolvePromotion(approved)` → reload 후에도 resolved(approved) 카드 유지. Reject(inline confirm 거쳐) → resolved(rejected) 카드 유지.
- [ ] 카드에 `candidateSummary` / `targetTier`(`<scope>/<pattern>`) / `sourceTicketId` / `rationale` 누락 없이 표시.
- [ ] `origin` 판정 실패/누락 시 회귀 없이 기존 `PromotionCard` 로 안전 폴백.
- [ ] doctrine 파일(`packages/core/doctrine/**`) diff 없음 — 본 티켓은 GUI/electron 만 수정.
- [ ] `pnpm tsc --noEmit` green.

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-qa | opus/standard | verify | Code-verify of §2 against implemented code (centralized build GREEN: tsc 0 / locale parity 771 / protected OK / smoke passed). **AC-1 PASS** — `po-runner.ts`: result-text 블록(line 730-733)에서 `parsePromotionCandidates(resultText)` → candidate 마다 `cb.onPromotionCandidate(msgId, payload, {origin})`; `poEvents.ts:259-277` 가 `kind:'promotion-candidate'` 카드 append + `chatAppendMessage` 영속. **AC-2 PASS(code)** — origin 추론 GUI-side: `ipc/po.ts` `po:sendMessage`→`turnOrigin:'user-requested'`(line 226), `chat:answerQuestion`→`'auto'`(line 104); `SendOpts.turnOrigin?` default `'auto'`(po-runner `spawnClaude` line 431) = 보수적 폴백. **AC-3 PASS** — payload.origin 이 097 `MessageBubble` fork 를 실제 구동(user-requested→QuestionCard, auto/부재→PromotionCard). **AC-4 PASS** — `chat:resolvePromotion`(po.ts:157-178) noop 아님: getSession→card find→basePayload merge→`patchMessage(... resolved:{outcome})` 영속, `{ok:true}` 반환(에러 시 `{ok:false,error}`); merge-base 로 candidateSummary 등 clobber 방지 → reload idempotent. **AC-5 PASS** — `mapPromotionCandidate`(po-runner:1041): `scope`+`pattern`→`<scope>/<pattern>` targetTier, `delta`→`candidateSummary`(`summarizeDelta` 160자 truncate), `rationale`→rationale, `source_ticket`→sourceTicketId; `PromotionCandidateRaw` = doctrine 7필드 그대로, origin 무. **AC-6 PASS** — resolve 핸들러 boundary 주석(po.ts:151-156) 명시: chat.json payload 영속만 소유, Tier 1/2 doctrine write 는 PO agent promotion-process 책임; renderer 가 system line 소유하므로 핸들러 중복 생성 안 함. **AC-7 PASS** — 중앙 빌드 tsc 0, locale parity 771. **§3 준수 확인** — `packages/core/doctrine` working tree diff 0(git status --porcelain clean, exit 0); 변경 파일 전부 packages/gui/{electron,src}; `promotion-candidate-schema.md` 등 unchanged. **098 비접촉** — `preload.ts` `cleanupAttachments`(line 83) 인접 미변경, `poOnPromotionCandidate`(line 290) PO events 영역에 추가 단독. **status: user-verify** — AC-1~5 의 실 E2E 는 live PO 가 `promotion_candidates[]` 를 emit 해야 관찰 가능. **user-verify 절차:** ① GUI 에서 PO 에 "이 패턴 global habit 으로 승격해줘" 직접 요청 → PO 가 promotion_candidates 반환 시 question-style 카드(origin user-requested) 채팅 렌더 확인; ② 유저 직접요청 아닌 auto-surfacing candidate 는 기존 PromotionCard; ③ Approve→reload 후 resolved(approved) 카드 유지, Reject(inline confirm 후)→resolved(rejected) 유지; ④ candidateSummary/targetTier(`<scope>/<pattern>`)/sourceTicketId/rationale 누락 없음; ⑤ origin 누락 시 PromotionCard 안전 폴백. qa_status: pass(코드 검증 가능분 — §5 6행 doctrine diff 없음 + 7행 tsc green 본 turn 확인). |
| 2026-06-10 | pdt-developer | opus/standard | impl | 097 dormant promotion gate 백엔드 활성화. (A) `po-runner.ts`: `PromotionCandidateRaw`/`PromotionPayload`/`onPromotionCandidate` 콜백 + `parsePromotionCandidates`(result-text JSON 에서 `promotion_candidates[]`/단건 추출, `extractJsonCandidates` 재사용) + `mapPromotionCandidate`(doctrine 7필드 → payload, `scope`+`pattern`→`<scope>/<pattern>` targetTier, delta 요약 truncate). result 블록에서 candidate 마다 emit. `emitToWebContents` 에 `po:onPromotionCandidate` 바인딩. (B) origin 추론: `SendOpts.turnOrigin` 스레딩 — `po:sendMessage`→`'user-requested'`, `chat:answerQuestion`→`'auto'`, 누락 시 보수적 `'auto'` 폴백(emit 사이트). doctrine 불변. (C) `poEvents.ts`: `poOnPromotionCandidate` 구독 → `promo-<msgId>-<nonce>` id 카드 append + seal + `chatAppendMessage` 영속(다중 candidate 충돌 방지 nonce). (D) `preload.ts`: PO events 영역에 `poOnPromotionCandidate`(single-subscriber) 추가 — 098 의 attachments 블록(`cleanupAttachments`)·composer 미접촉. (E) `chat:resolvePromotion` 실구현: `chat:dismissQuestion` 패턴으로 payload merge-patch `resolved: { outcome }` 영속, `{ ok: true }` 반환. 명시적 boundary 주석 — Tier 1/2 doctrine write 는 PO agent promotion-process 책임(AC-6), 렌더러가 system line 소유하므로 핸들러 중복 생성 안 함. AC-1~7 충족. tsc(`./node_modules/.bin/tsc --noEmit`) green, locale key parity 771 OK, protected-token 위반 0, doctrine diff 0. §5 QA smoke 1~5행(실 PO E2E)은 QA persona 검증 대상으로 미체크 유지; 6행(doctrine diff 없음)·7행(tsc green)은 본 turn 에서 확인됨. |
