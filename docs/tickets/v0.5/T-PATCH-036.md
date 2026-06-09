---
ticket_id: T-PATCH-036
version: v0.5
phase: 3
type: feature
status: done
assignee: pdt-developer
estimated_complexity: M
risk_flags: [stream-ordering, renderer-model-boundary, t033-interplay]
qa: true
slug: chat-interleave
---

# T-PATCH-036 — Claude-Code-style chronological message↔tool interleave

## Request

Today the PO chat renders an assistant turn as ONE big text block, then dumps ALL
tool-uses below it in a run ("쭈루룩"). A turn that actually went
`text → Bash → text → Read → text` renders as `[all text combined] [Bash, Read group]`.

The user wants **Claude-Code-style interleave**: chronological order —
message segment → its tools → next message segment → its tools — in execution order.
NOT all-text-then-all-tools.

This is a render/event-model fix, not a styling fix. The fix repositions tool groups
INLINE at their true chronological spot between text segments, instead of collecting at
the tail of the turn.

## Feasibility (investigation result — pin file:line)

**Interleave is feasible. The chronological ordering already exists at the runner; it is
lost at the renderer-model boundary.**

### Why text & tools don't interleave today

1. **Runner emits in correct order.** `packages/gui/electron/po-runner.ts:442-457` —
   on each stream-json `assistant` event it iterates `message.content[]` parts IN ORDER:
   - `part.type === 'text'` → `cb.onToken(msgId, part.text)` (line 444)
   - `part.type === 'tool_use'` → `cb.onAnnounce(msgId, {level:'tool', text:'→ tool: <name>'})` (line 447)
   So the emit sequence preserves chronological order (text, tool, text, tool …).

2. **Text loses per-segment identity at the store.** A single placeholder bubble is
   created ONCE per turn at `po:onMsgId` —
   `packages/gui/src/store/poEvents.ts:37-51` (one `Message` with `id = msgId`,
   `kind = 'po'`, `text = ''`). Every `onToken` chunk appends to THAT one bubble —
   `poEvents.ts:54-63` (finds the bubble by `msgId`, `text = old + chunk`). All text
   from the whole turn — across multiple `text` parts separated by tool_use parts —
   collapses into ONE bubble at its ORIGINAL early array position.

3. **Tools become tail-appended separate messages.** Each `onAnnounce` creates a NEW
   `trace`-kind `Message` pushed to the END of `messages[]` —
   `poEvents.ts:66-78` (`id = trace-<ts>-<rand>`, `traceLevel = 'tool'`). They accumulate
   AFTER the (position-frozen) text bubble.

4. **Renderer groups by adjacency, not by true position.** `groupToolTraces()` —
   `packages/gui/src/components/workspace/ChatPanel.tsx:399-421` — folds adjacent
   `traceLevel:'tool'` traces into one `tool-group`. Because step 2 froze the text in
   one early bubble and step 3 piled all traces after it, the traces are adjacent at the
   tail → one big group renders BELOW the whole text block. The grouping is correct given
   its input; the INPUT ordering is wrong.

**Conclusion:** ordering data is NOT lost in the runner. It is lost because text has no
per-segment message identity — a turn = exactly one text bubble + N tail traces. To
interleave, text must be split into per-segment bubbles so a tool group can sit between
two text segments at its true chronological index.

### Chosen approach — segment the text bubble (renderer-model only; runner unchanged)

Introduce a **per-turn segment boundary**: when a `tool` trace arrives mid-turn, the
CURRENT streaming text bubble is "sealed" and the NEXT `onToken` starts a NEW text bubble
(new id) appended after the trace(s). Net effect: `messages[]` itself becomes
chronological — `[text-seg-A] [trace] [trace] [text-seg-B] [trace] …` — and the EXISTING
`groupToolTraces()` adjacency-fold then naturally yields inline groups between segments.
No change to `po-runner.ts` and no change to the IPC payload shape.

Mechanics (in `poEvents.ts`):
- Track the active text-bubble id per in-flight turn (`inFlightMsgId` already exists in
  the workspace store — reuse, do not add a parallel field unless required).
- `onToken`: if the active text bubble was sealed (a trace arrived since the last token),
  create a NEW assistant text bubble (`kind:'po'`, new id) BEFORE appending the chunk, and
  make it the active bubble; else append as today.
- `onAnnounce` (level `tool`): push the trace as today, AND mark the active text bubble
  sealed so the next token opens a fresh segment.
- `onDone` must finalize/persist EVERY text segment of the turn, not just `msgId`
  (today it persists only the bubble whose id === `msgId` — `poEvents.ts:81-100`). Either
  tag all segments with a shared `turnId` and persist all, or persist each segment at seal
  time. Pick the lower-risk path; flag in self-check.

> ⚠ The single-`msgId` assumption in `onDone` (`poEvents.ts:81-100`) and any other code
> keyed on "one bubble per turn" is the main regression surface. Audit `msgId` usages
> before splitting.

## Acceptance

- [AC1] A turn whose execution order was `text₁ → tool(s) → text₂ → tool(s)` renders in
  the chat in that SAME chronological order: text₁, then its tool group, then text₂, then
  its tool group. No "all text first, all tools last" layout.
- [AC2] Each inline tool run still collapses via the EXISTING `ToolUseGroup` (T-033) —
  collapsed by default, `[Wrench] N tools >`, expandable. The group now sits at its
  chronological position between text segments, NOT pinned at turn tail. (See T-033
  interplay below.)
- [AC3] A turn with text but ZERO tools renders as a single text bubble exactly as today
  (no empty segment, no orphan group).
- [AC4] A turn with tools but NO surrounding text renders the tool group(s) with no empty
  text bubbles before/after.
- [AC5] Streaming is smooth: while a turn streams, new tokens land in the CURRENT (latest)
  text segment; a mid-turn tool arrival seals it and the next tokens open a fresh segment
  below the new tool group — no flicker, no re-order of already-rendered segments,
  autoscroll behavior unchanged.
- [AC6] `onDone` finalizes/persists EVERY text segment of the turn (status `done`) and the
  reloaded chat (`chat.json`) replays in the same interleaved order — no segment dropped,
  no duplicate.
- [AC7] UI/UX binds DS §1.5 + Tier0 `ux-principles` + RUN the DS §1.5.6 self-check; result
  noted in the PR body. lucide-only, no color-emoji (DS §7).
- [AC8] `tsc --noEmit` clean + lint clean.

## Out of scope

- Per-tool input/output detail content (still the deferred `toolDetailUnavailable`
  fallback from T-033 — separate data-plumbing ticket).
- Changing `po-runner.ts` emit logic or the IPC payload shape.
- Restyling `ToolUseGroup` / `MessageBubble` visuals beyond what positioning requires.
- Markdown rendering changes in `MdRenderer`.

## Plan (file:line)

1. **`packages/gui/src/store/poEvents.ts:54-63` (`onToken`)** — implement segment open:
   if active text bubble is sealed, append a NEW assistant text bubble (new id) and route
   the chunk there; else append to active as today.
2. **`packages/gui/src/store/poEvents.ts:66-78` (`onAnnounce`)** — after pushing a
   `level:'tool'` trace, mark the active text bubble sealed (segment boundary).
3. **`packages/gui/src/store/poEvents.ts:37-51` (`onMsgId`)** — the first bubble is the
   first segment; record it as the active/unsealed text bubble for the turn.
4. **`packages/gui/src/store/poEvents.ts:81-100` (`onDone`)** — finalize + persist ALL
   text segments of the turn, not only `msgId`. Audit every `msgId`-keyed assumption.
5. **`packages/gui/src/components/workspace/ChatPanel.tsx:399-421` (`groupToolTraces`)** —
   verify NO change needed: with a now-chronological `messages[]`, the existing
   adjacency-fold yields inline groups automatically. Confirm `tool-group` key stays
   stable (`tg-<firstTraceId>`) so React reconciliation doesn't thrash mid-stream.
6. **`packages/gui/src/store/workspace*` (state shape)** — if a sealed/active flag is
   needed beyond `inFlightMsgId`, add the minimal field; prefer reusing existing state.
7. Re-run DS §1.5.6 self-check (table at `docs/designer/design-system.md:139-146`):
   - **2-2 익숙한 경험** — interleave IS the Claude-Code/IDE-familiar transcript pattern; this
     change moves us TOWARD the principle.
   - **3-1 Predictability** — single render path for both N=0 and N≥1 tool turns; segment
     boundary deterministic (one boundary per tool run). Verify no orphan empty bubble.
   - **3-2 Feedback** — streaming continuity preserved (AC5); active segment shows live
     tokens, sealed segments are stable.
   - **3-3 Escape** — group collapse/expand unchanged (no trap), inherited from T-033.

## T-033 interplay

T-033 landed GROUP-ONLY: adjacent `traceLevel:'tool'` traces fold into one collapsed
`ToolUseGroup` (`ChatPanel.tsx:399-421`, component at
`packages/gui/src/components/workspace/chat/ToolUseGroup.tsx`). T-036 does NOT change the
grouping or the collapse behavior — it changes the INPUT ordering of `messages[]` so the
SAME fold produces groups positioned INLINE at their chronological spot rather than pinned
at turn tail. Collapse-by-default stays. The only behavioral shift: where the group
appears (between text segments vs. below all text). The deferred per-tool I/O detail
(T-033 `toolDetailUnavailable`) is untouched and must not regress.

> Stable-key caution: T-033 keys groups by first-trace id (`tg-<run[0].id>`). With
> mid-turn segmentation, a tool run that previously merged with a later run at the tail may
> now be a separate run — confirm keys remain stable per run so expand/collapse state and
> reconciliation don't thrash while streaming (AC5).

## Open questions

- **OQ-1** — `onDone` persistence model: tag all segments with a shared `turnId` and
  persist all on done, OR persist each segment at seal time? Both satisfy AC6; developer
  picks the lower-regression path against the existing `chat.json` append API
  (`chatAppendMessage`, `poEvents.ts:94`). Flag the choice in the PR.
- **OQ-2** — Does any non-streaming consumer (history reload, retro export, search index)
  assume exactly one assistant bubble per turn keyed by `msgId`? Multi-segment turns break
  that assumption. Audit before merge; if found, normalize on `turnId`.
