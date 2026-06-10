---
ticket_id: T-PATCH-081
version: v0.5
slug: chat-stop-button-abort-ipc
title: Chat stop button + PO turn abort IPC
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui-chat-abort
estimated_complexity: L3
risk_flags:
  - process-lifecycle
created_at: 2026-06-10T00:00:00Z
qa_status: pass
---

# T-PATCH-081: Chat stop button + PO turn abort IPC

## Request

During a streaming PO turn, the send button is disabled but there is no way
to abort the in-flight turn. The user is locked out of the chat UI until the
turn completes.

R1 — Stop button: while streaming, replace the send button with a stop button.
Clicking the stop button aborts the running PO turn via a new `po:abort` IPC
channel. The UI returns to idle; any partial transcript already appended to the
message list is preserved.

R2 — Keyboard guard confirmation: verify the Enter / Cmd+Enter keydown path is
also blocked during streaming (button `disabled` alone does not prove the
keyboard path is safe).

## Acceptance

### Stop button appearance

- AC-1: When `streaming === true`, the send button (`<button>` at ChatPanel.tsx
  line ~514) is replaced by a stop button rendering `<Square size={14}
  strokeWidth={2.5} />` (lucide-react). The stop button uses a distinct
  destructive style: background `#EF4444` (red-500), hover `#DC2626`
  (red-600); same width/height as the send button so layout does not shift.
- AC-2: When `streaming === false`, the send button renders as before. The
  stop button is not present in the DOM.
- AC-3: Stop button has `aria-label="Stop generation"` and
  `title={t('workspace.chat.stop')}`. Locale key `workspace.chat.stop`
  added: `en.json` → `"Stop"`, `ko.json` → `"중단"`.
- AC-4: The modal composer path (pendingQuestion modal, line ~424 area) also
  shows the stop button in place of its send button when `streaming === true`.

### Keyboard path guard

- AC-5: `onKeyDown` (ChatPanel.tsx line ~166) — the existing guard
  `if (streaming ... return` already blocks Cmd+Enter. Verify: the handler
  for the **normal composer textarea** does NOT call `handleSubmit()` when
  `streaming === true`. Developer MUST trace the path in code and confirm in
  PR description; no new code needed if the guard is already present.
- AC-6: `onModalKeyDown` (modal composer) — same tracing requirement.
  Confirm in PR that both paths are blocked.

### IPC abort channel — main process

- AC-7: `packages/gui/electron/po-runner.ts` gains a module-level
  `let activeChild: import('child_process').ChildProcess | null = null`.
  In `spawnClaude()`, assign `activeChild = child` immediately after the
  `spawn()` call and clear it (`activeChild = null`) inside the
  `child.on('close', ...)` handler.
- AC-8: `packages/gui/electron/po-runner.ts` exports a named function:
  ```ts
  export function abortActiveTurn(): void {
    if (activeChild && !activeChild.killed) {
      activeChild.kill('SIGTERM')
    }
    activeChild = null
  }
  ```
- AC-9: `packages/gui/electron/ipc/po.ts` adds:
  ```ts
  ipcMain.handle('po:abort', (): { ok: boolean } => {
    abortActiveTurn()
    return { ok: true }
  })
  ```
  Import `abortActiveTurn` from `'../po-runner'`.
- AC-10: `packages/gui/electron/preload.ts` exposes the channel:
  ```ts
  abortPoTurn: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('po:abort'),
  ```
  Placed alongside the existing `po:sendMessage` bridge entry.

### Stop button click handler — renderer

- AC-11: Stop button `onClick` in `ChatPanel.tsx`:
  1. Calls `window.electron.abortPoTurn()` (fire-and-forget, no await needed
     for UI responsiveness — but catch errors silently).
  2. Immediately calls `setStreaming(false)` as belt-and-suspenders so the UI
     never hangs if `child.on('close')` is delayed or silent.
  3. Does NOT clear the `messages` array — partial transcript is preserved.
- AC-12: If `po:onDone` fires after the abort (from `child.on('close')`),
  the renderer handles it normally — `setStreaming(false)` is idempotent and
  the `sessionId` update is applied. No double-fire guard needed.

### Echo-mode (dev) safety

- AC-13: In echo mode (`spawnClaude` is not used), `activeChild` is `null`.
  `abortActiveTurn()` is a safe no-op. The stop button still renders + calls
  `setStreaming(false)` so the UI unlocks.

## Out of scope

- Aborting persona sub-agent turns (dispatched tickets); only the direct PO
  chat turn is targeted.
- A "cancel and clear" action that wipes the partial transcript.
- Configuring SIGKILL escalation if SIGTERM is ignored (Linux-only edge case;
  can be a follow-up).
- Debounce / double-click protection on the stop button.

## Plan

| # | File | Change |
|---|---|---|
| 1 | `po-runner.ts` | Add `let activeChild: ChildProcess \| null = null`. Assign in `spawnClaude()` post-spawn. Clear on `close`. Export `abortActiveTurn()`. |
| 2 | `ipc/po.ts` | Add `ipcMain.handle('po:abort', ...)` handler. Import `abortActiveTurn`. |
| 3 | `preload.ts` | Expose `abortPoTurn` via `contextBridge`. |
| 4 | `ChatPanel.tsx` | Conditional send/stop button swap (`streaming` toggle). Stop button style (red-500/600, Square icon). |
| 5 | `ChatPanel.tsx` | Modal composer path: same stop button swap in pendingQuestion section. |
| 6 | `ChatPanel.tsx` | Trace + confirm (in code comment or PR desc) that `onKeyDown` and `onModalKeyDown` both guard on `streaming`. |
| 7 | `en.json` + `ko.json` | Add `workspace.chat.stop` locale key. |

### Risk note — process lifecycle

`abortActiveTurn()` sends `SIGTERM` to the `claude` CLI child process.
Risks:
- If the child ignores SIGTERM (e.g., during a subprocess it spawned), the
  turn continues until process timeout. Mitigation: renderer-side
  `setStreaming(false)` ensures the UI is unblocked regardless.
- Race: if `po:abort` IPC arrives in main while `child.on('close')` is
  already queued, `activeChild` may already be `null` — the guard
  `if (activeChild && !activeChild.killed)` handles this safely.
- Single-turn model (comment at po-runner.ts line 438) means only one
  `activeChild` at a time — no concurrent-turn hazard.

### QA scope

| Area | Check |
|---|---|
| Stop button visible | Stream a turn → stop button appears, send is gone |
| Stop button works | Click stop → streaming ends, UI idle, transcript intact |
| Belt-and-suspenders | Abort IPC succeeds → streaming=false even if onDone never fires |
| Keyboard block | Cmd+Enter during streaming → no new turn submitted |
| Send restored | After stop → send button returns, new message can be sent |
| Echo mode | Dev (no claude CLI) → stop button shows, click unlocks UI |
| Modal path | pendingQuestion modal → stop button present during streaming |

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._

## Persona Activity
- 2026-06-10 dev impl note: AC-11 window.electron.abortPoTurn() notation in spec was wrong — preload exposes window.api only; implemented as window.api.abortPoTurn().
