---
ticket_id: T-PATCH-039
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
qa: true
slug: fix-segment-dup
---

# T-PATCH-039 — Fix chat segment text duplication (regression from T-036/T-038)

## Request

URGENT regression introduced around the T-036/T-038 chat-segmentation work. On a
plain PO turn (e.g. "지금 phase 뭐야?") the same answer text renders **~4× concatenated
inside one bubble** ("…시점입니다.Phase 3 (빌드…") AND across **several duplicate bubbles**.
Message content (caveman) is correct — the defect is in render/segmentation, not in
the model output.

Goal: text appears **exactly once**. Preserve T-036 chronological message↔tool
interleave and T-038 single-live-cursor (active-segment-only ▋).

## Investigation / Root cause

Verified the runner stream shape with the real CLI (`claude --print --output-format
stream-json --verbose`, incl. `--agent pdt-po`, incl. the exact "지금 phase 뭐야?"
prompt):

- Assistant text is delivered as **one complete text block per text part**, in a
  **single `assistant` event per turn**. It is **NOT** a delta-then-cumulative stream
  and the assistant event is **not** re-fired with the same/growing text.
- The `result` event carries the full text only for side-channel parsing
  (todo / ticket-focus / artifact / QA / AskUserQuestion). It does **not** re-emit
  text via `onToken`/`onAnnounce`.

So `runPoTurn` calls `cb.onToken(msgId, fullText)` **once** per turn. The renderer
append path (`poEvents.ts` `onToken` → append to `segActiveId`) and the render
transform (`groupToolTraces`) are each single-pass and clean.

Therefore the duplication is a **renderer-side over-delivery**: the only way to get
"same text N× in one bubble + N bubbles" is **N live IPC subscribers** on the PO
streaming channels. `preload.ts` subscribed with bare `ipcRenderer.on(...)`, which is
**additive**. `poEvents.register()` is module-load guarded, but the dev HMR
dispose / module re-eval path could leave a stale native listener bound while a new
one is added — each extra `po:onToken` listener re-appends the same full chunk to the
active bubble (self-concatenation) and each extra `po:onMsgId` listener spawns another
placeholder bubble (duplicate bubbles). This matches the screenshot exactly.

## Fix

Two complementary guards — root fix + defense-in-depth:

1. **`preload.ts` — single-subscriber streaming channels.** Before binding,
   `ipcRenderer.removeAllListeners(channel)` for the single-subscriber PO channels
   (`po:onMsgId`, `po:onToken`, `po:onAnnounce`, `po:onDone`, `po:onAskUserQuestion`).
   Structurally guarantees exactly one live listener per channel regardless of HMR /
   StrictMode / double-register → text delivered (and rendered) exactly once.

2. **`poEvents.ts` — idempotent append (defense-in-depth).** Per active-segment
   `lastChunkBySeg` guard: a byte-identical chunk arriving immediately after the same
   chunk for the SAME active segment is a duplicate delivery (never legitimate, since
   the runner emits each text part once) and is dropped. Keyed by segment id so a
   fresh post-seal segment starts clean and a legitimate repeat in a LATER segment is
   unaffected. Reset on turn start (`onMsgId`) and `onDone`.

T-036 interleave (seal-on-tool-trace + new-segment-after) and T-038 cursor
(seal flips prior segment `streaming`→`done`; at most one live ▋) are untouched.

- Simple turn (no tool) = one segment, no seal → single bubble, text once.
- Multi-tool turn = segments chronological, one text instance per segment.

## Files changed

- `packages/gui/electron/preload.ts`
- `packages/gui/src/store/poEvents.ts`

## Acceptance

- AC1 Plain PO turn renders a **single** bubble with the answer text **once** (no
  self-concatenation, no duplicate bubbles).
- AC2 Multi-tool turn keeps chronological message↔tool interleave (T-036) — one text
  instance per segment, in order.
- AC3 At most one live streaming cursor (▋) on the bottom active segment (T-038).
- AC4 `node_modules/.bin/tsc --noEmit` green; `pnpm --filter @productune/gui lint` pass.

## Self-check

- tsc --noEmit: green
- lint (locale catalog gate): pass
- build: n/a (no build run; type + lint gates green)

## Verify hint

Dev run with HMR: send a plain PO turn (no tool) → exactly one bubble, text once.
Then trigger several hot reloads and repeat — still one bubble (single-subscriber
guard holds). Multi-tool turn → text segments interleave chronologically with tool
groups, each text shown once, single bottom cursor while streaming.
