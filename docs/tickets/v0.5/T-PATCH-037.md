---
ticket_id: T-PATCH-037
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L4
risk_flags:
  - print-askq-tooluse-emission-uncertain
  - resume-input-injection-shape
  - single-inflight-turn-assumption
qa: true
slug: askuserquestion-wiring
---

# T-PATCH-037 — Wire PO AskUserQuestion end-to-end (detect → card → answer → resume)

## Request

PO's `AskUserQuestion` never reaches the user. The `AskUserQuestionCard` component
(`packages/gui/src/components/workspace/chat/AskUserQuestionCard.tsx`) and its DS
recipe shipped in T-013, but the card never renders because nothing on the
main-process side emits an `ask-user-question` message, and the answer IPC is a
NOOP stub. Net effect: PO falls back to prose questions every turn.

Confirmed root causes:

1. **Headless run cancels the tool.** `po-runner.ts` spawns
   `claude … --print --output-format stream-json --verbose` with
   `stdio: ['ignore', 'pipe', 'pipe']` (po-runner.ts:329, :335). With stdin
   ignored and `--print`, an interactive `AskUserQuestion` has no channel to
   receive an answer, so the CLI auto-cancels it — PO reads the cancel as "user
   dismissed" and re-asks in prose.
2. **No detect/emit.** `handleStreamJsonLine` (po-runner.ts:409–562) detects
   `system.init`, `assistant` text/tool_use, and `result` envelopes, plus
   result-text parsers (todo / ticket-focus / artifact / qa / pending-gate). It
   has **zero** `AskUserQuestion` handling — `tool_use` parts are only forwarded
   as a generic `→ tool: <name>` announce (po-runner.ts:446–448) and fed to the
   health state machine. No `ask-user-question` event is ever emitted.
3. **Answer IPC is a stub.** `chat:answerQuestion` (po.ts:44–62) is documented
   as "PO trigger not yet implemented … follow-up scope" and does nothing but
   `void opts; return { ok: true }`.

This ticket wires the full loop: detect the question on the main side → emit an
`ask-user-question` message that renders the existing card → user picks an option
→ a real `chat:answerQuestion` handler patches `payload.resolved` and **resumes**
the claude session feeding the chosen answer as the next input.

> Doctrine context (do not change): `AskUserQuestion` is PO-only
> (`packages/core/doctrine/persona/po/bookshelf/delegation.md:39`). Subagents must
> return `state:"needs-info"` instead. This ticket only surfaces the **PO**'s
> question; subagent AskUserQuestion remains a doctrine violation and is out of
> scope.

## Acceptance

- [ ] **[AC1] Card renders on PO AskUserQuestion.** When PO emits an
  AskUserQuestion in a `po:sendMessage` turn, an `ask-user-question` message is
  appended to the transcript and the existing `AskUserQuestionCard` renders
  inline (no modal). `payload` matches `AskUserQuestionPayload`
  (`packages/gui/src/lib/types.ts:85`): `{ question, options: [{key,title,description?}] }`.
- [ ] **[AC2] Answer resumes the run with the choice.** Clicking an option calls
  the **real** `chat:answerQuestion` handler (no longer a stub), which (a) patches
  the stored message's `payload.resolved = { chosenKey }` in `chat.json`, and (b)
  starts a new PO turn via the same `runPoTurn` path used by `po:sendMessage`,
  with `resume = <captured claude session id>` and the chosen option's text as the
  turn input. The resumed PO continues from the answer (not a fresh session).
- [ ] **[AC3] Single emit, idempotent.** A given AskUserQuestion produces exactly
  one `ask-user-question` message (no duplicate from both the assistant-stream and
  result-text paths). On transcript re-render / reload the card shows the resolved
  chip when `payload.resolved` is present (existing behavior — AskUserQuestionCard.tsx:30).
- [ ] **[AC4] Non-trapping.** Composer stays active; the user may ignore the card
  and type free text — that free-text turn resumes normally and the card collapses
  to a neutral resolved/ignored state on the next render (no orphaned live card,
  no blocked input). (T-013 AC: "사용자가 카드 무시하고 자유 텍스트로 답해도 동작".)
- [ ] **[AC5] No fallback regression.** If the question cannot be structured
  (neither detect path fires), behavior degrades to today's prose-in-transcript —
  no crash, no empty card, no silent drop.
- [ ] **[AC6] DS bind.** Card binds `docs/designer/design-system.md` §1.5
  (project deltas) + §7 (iconography — lucide `Check`/`Loader2`, no color-emoji)
  + Tier0 `designer/bookshelf/ux-principles.md`; reuses the T-013 `.action-card` /
  option / resolved-chip recipe with no new visual design. §1.5.6 self-check passed
  and noted in the PR (Feedback: select → ≤100ms visual + spinner until ack;
  Predictability: token-only; non-trapping per AC4).
- [ ] **[AC7] tsc + lint clean.** `pnpm -C packages/gui tsc --noEmit` and lint pass.

## Plan

> PLAN MODE — DO NOT WRITE CODE during planning. Implementation by pdt-developer.

### Mechanism (primary + fallback — resolves the open question by design)

The one unknown is whether `claude --print` flushes the **assistant message
carrying the `AskUserQuestion` tool_use** into the stream-json before it
auto-cancels. Two emit paths are wired so the loop works regardless:

- **Path A — assistant-stream detect (primary).** In the `assistant` branch of
  `handleStreamJsonLine` (po-runner.ts:439–459), when a `part.type === 'tool_use'`
  has `part.name === 'AskUserQuestion'`, read `part.input` (Claude's
  AskUserQuestion input shape: `questions[]`, each with `question`/`header` +
  `options[]` of `{ label, description? }`), normalize to `AskUserQuestionPayload`
  (map `label → title`, synthesize stable `key` = `A/B/C…` or slugified label),
  and emit a new `onAskUserQuestion(msgId, payload)` callback. Do **not** also
  forward it through the generic `→ tool:` announce (skip the announce for this
  tool name to avoid a duplicate trace).
- **Path B — result-text marker (fallback).** Add `parseAskUserQuestion(text)`
  alongside the existing `parseTodoItems` / `parseTicketFocusItems` /
  `parsePendingGate` parsers (po-runner.ts:564–816), reusing
  `extractJsonCandidates` (po-runner.ts:670). It looks for an
  `ask_user_question` (or `askUserQuestion`) key in the PO result JSON envelope
  carrying `{ question, options[] }`. This is the doctrine-clean channel: since
  AskUserQuestion is PO-only and PO already returns a structured result JSON, PO
  can surface the question as a marker even when the raw tool is cancelled. Emit
  via the same `onAskUserQuestion` callback from the `result` branch
  (po-runner.ts:486–557).
- **De-dupe (AC3).** Track a per-turn `askEmitted` flag in the turn scratchpad
  (module-scope like `capturedSessionId`, po-runner.ts:407, reset on turn
  start/close). Path A sets it; Path B only emits if not already set. One question
  per turn (matches the single-in-flight-turn model — poEvents.ts:47–49).

### File-by-file

1. **`packages/gui/electron/po-runner.ts`**
   - Add `onAskUserQuestion: (msgId: string, payload: AskUserQuestionPayload) => void`
     to `RunCallbacks` (po-runner.ts:102–136). Define a local
     `AskUserQuestionPayload`-shaped interface here (main-process has no import of
     `src/lib/types`); keep field names byte-identical to types.ts:85.
   - **Path A:** in the `assistant` tool_use loop (po-runner.ts:446), branch on
     `part.name === 'AskUserQuestion'` → normalize `part.input` → set
     `askEmitted = true` → `cb.onAskUserQuestion(msgId, payload)`; `continue`
     past the generic announce + `handleToolUseHealth` for this part.
   - **Path B:** add `parseAskUserQuestion(text)` (mirror `parsePendingGate`
     structure, po-runner.ts:798–816) and call it in the `result` branch where the
     other result-text parsers run (po-runner.ts:557, inside the
     `typeof obj?.result === 'string'` block); emit only if `!askEmitted`.
   - **Scratchpad:** add `let askEmitted = false` near `capturedSessionId`
     (po-runner.ts:407); reset to `false` at turn start in `spawnClaude`
     (po-runner.ts:316–320) and after `cb.onDone` (po-runner.ts:399–401).
   - **Bind to renderer:** in `emitToWebContents` (po-runner.ts:824–878) add
     `onAskUserQuestion: (msgId, payload) => wc.send('po:onAskUserQuestion', msgId, payload)`.

2. **`packages/gui/electron/preload.ts`**
   - Add a `poOnAskUserQuestion(cb)` subscriber mirroring `poOnAnnounce`
     (preload.ts:220–229): `ipcRenderer.on('po:onAskUserQuestion', listener)` +
     return an off-fn.

3. **`packages/gui/src/store/poEvents.ts`**
   - Register `api.poOnAskUserQuestion?.((msgId, payload) => …)` in `register()`
     (alongside the other `offFns.push(...)`, e.g. after `po:onAnnounce`,
     poEvents.ts:125–146). Handler appends a `Message`:
     `{ id: msgId-or-new, role:'assistant', kind:'ask-user-question', text:'',
        status:'done', payload, created_at }`. **Segmentation interplay:** treat
     the question like a tool trace boundary — seal the active text segment
     (`segSealed = true`, poEvents.ts:145) so the card lands chronologically after
     any preceding prose and a fresh text segment opens for trailing tokens.
   - Use a distinct message id (e.g. `auq-<msgId>`) so it doesn't collide with the
     turn's text-segment ids in `turnSegIds` (poEvents.ts:49) — the onDone prune
     (poEvents.ts:161–179) must not treat the card as an empty text segment.

4. **`packages/gui/electron/ipc/po.ts` — replace the NOOP stub (po.ts:44–62)**
   - Real `chat:answerQuestion` handler:
     1. Read the session (`getSession(projectDir)`, imported po.ts:3), find the
        message by `messageId`, patch `payload.resolved = { chosenKey }`, persist
        (reuse the chat-store patch path; if no patch helper exists, add a minimal
        `patchMessage(projectDir, id, partial)` to `chat-store` — keep it append/replace,
        not a full rewrite).
     2. Resolve the chosen option's input text (the handler receives `chosenKey`;
        either the renderer also passes the chosen `title`/`label`, or the handler
        re-derives it from the stored `payload.options`). Prefer passing the
        resolved text from the renderer to avoid a second lookup — extend the IPC
        opts to `{ projectDir, messageId, chosenKey, answerText }`
        (update preload.ts:170–175 + the `chatAnswerQuestion` call in
        AskUserQuestionCard.tsx:65 accordingly).
     3. **Resume:** call `runPoTurn({ projectDir, text: answerText, resume:
        capturedPoSessionId }, emitToWebContents(event.sender))` — the **same**
        path `po:sendMessage` uses (po.ts:93–100). This reuses the proven resume
        plumbing: `capturedPoSessionId` (po.ts:11) ← captured in po-runner
        `system.init`/`result` (po-runner.ts:429, :462) → surfaced on
        `po:onDone info.sessionId` → stored as `claudeSessionId`
        (poEvents.ts:190–193) → fed back as `--resume <SID>` (po-runner.ts:324–325).
        NOTE: `capturedPoSessionId` (po.ts:11) is currently **declared but never
        assigned** — wire its assignment from the onDone path (or read the
        renderer-held `claudeSessionId` via the IPC opts) so resume has a real SID.
        Pin this in the impl; without it resume falls back to a fresh `--agent`
        turn (AC2 fail).
   - Wrap the same `markPoTurnStart()/markPoTurnEnd()` discipline as
     `po:sendMessage` (po.ts:91, :105).

5. **`packages/gui/src/components/workspace/chat/AskUserQuestionCard.tsx`**
   - Mostly wired already (handleSelect, AskUserQuestionCard.tsx:51–109). Two edits:
     pass `answerText` (the chosen `title`) in the `chatAnswerQuestion` call
     (AskUserQuestionCard.tsx:65–69), and **remove the local-echo + local-resume
     assumption** — the resume now originates in main (step 4.3), so the card must
     NOT also fire a duplicate user turn. Keep the local optimistic
     `payload.resolved` patch (AskUserQuestionCard.tsx:86–99) for ≤100ms feedback
     (AC6 Feedback), but the transcript user-echo of the answer should come from
     the resumed turn's own user message, not a second client-side append — confirm
     no double user bubble (verify against ChatPanel append, ChatPanel.tsx:108–121).

### Out of scope

- Subagent (designer/dev/qa) AskUserQuestion — doctrine violation; subagents use
  `state:"needs-info"` (delegation.md:39). Not surfaced here.
- Multi-question (`questions[]` with length > 1) in a single AskUserQuestion call —
  v1 surfaces the first question only; multi-question stacking is a follow-up.
- Promotion-card trigger (`chat:resolvePromotion`, po.ts:68–82) — sibling stub,
  separate ticket.
- Concurrent / queued questions across overlapping turns — single-in-flight-turn
  model assumed (poEvents.ts:47–49).
- New visual design — reuse T-013 `.action-card` recipe verbatim.

### risk_flags

- **print-askq-tooluse-emission-uncertain** — whether `--print` emits the
  AskUserQuestion `tool_use` in stream-json before auto-cancel is unverified in
  this env. Mitigation: Path B result-text marker is the doctrine-clean fallback
  (PO is the only AskUserQuestion caller and already returns structured JSON), so
  the loop works even if Path A never fires. QA must confirm which path fires
  against a live Claude.
- **resume-input-injection-shape** — the resumed turn feeds the chosen option's
  text as plain input. If PO expects a specific answer format (e.g. echoing the
  option `key`), the resume text may need shaping; QA to verify PO continues
  correctly from the injected answer.
- **single-inflight-turn-assumption** — segmentation + `capturedPoSessionId` assume
  one in-flight turn. If a question arrives while another turn streams, behavior is
  undefined (out of scope, but flag for QA edge probing).
