---
ticket_id: T-PATCH-088
version: v0.5
slug: restart-session-dead-path-fix
title: "po:restartSession dead kill path — wire to activeChild"
type: refactor
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
requires_user_gate: false
area_tag: gui-po-lifecycle
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-10T00:00:00Z
---

# T-PATCH-088: po:restartSession dead kill path — wire to activeChild

## Request

`packages/gui/electron/ipc/po.ts` has a module-level variable `activePoChild: ChildProcess | null = null` (line 12) that was introduced by T-P4-059 to allow the `po:restartSession` IPC handler to kill an in-flight process. The variable is **never assigned** anywhere — the kill branch at lines 227-229 always evaluates `if (activePoChild)` as false, making the kill silently a no-op.

Meanwhile, T-PATCH-081 / T-PATCH-086 introduced `activeChild` + `abortActiveTurn()` in `po-runner.ts`, which IS properly assigned and already imported in `po.ts` (line 6). The fix is to replace the dead `activePoChild.kill()` block with a call to `abortActiveTurn()`, and remove the dead variable.

No behavior regression to the restart flow: `capturedPoSessionId` reset + `resetSessionWindow()` + `po:sessionRestarted` notification are all unaffected.

## Acceptance

- AC-1: Remove the dead `activePoChild` variable declaration from `po.ts`:
  ```ts
  // DELETE these two lines:
  let activePoChild: ChildProcess | null = null
  // (and the comment above it on line 11)
  ```

- AC-2: In the `po:restartSession` handler (around line 225), replace the dead kill block:
  ```ts
  // BEFORE (dead — activePoChild never assigned):
  if (activePoChild) {
    try { activePoChild.kill('SIGTERM') } catch { /* ignore */ }
    activePoChild = null
  }

  // AFTER:
  abortActiveTurn()
  ```
  `abortActiveTurn()` is already imported from `'../po-runner'` (po.ts line 6). It is a no-op when no child is running, so the restart-with-no-active-turn path is safe.

- AC-3: Remove the `import type { ChildProcess } from 'child_process'` import at line 3 **if and only if** `ChildProcess` is not referenced anywhere else in `po.ts`. Verify with a full-file search before removing. If still used, leave the import.

- AC-4: The comment block at lines 10-16 (explaining `activePoChild`) must be removed or replaced with a comment explaining that restart now delegates to `abortActiveTurn()`:
  ```ts
  // po:restartSession kills any in-flight child via abortActiveTurn() (po-runner.ts).
  ```

- AC-5: No changes to any other part of the `po:restartSession` handler (`capturedPoSessionId = null`, `resetSessionWindow`, `event.sender.send('po:sessionRestarted')`, return value) — behavior preserved exactly.

- AC-6: No changes to `po-runner.ts` — `abortActiveTurn` and `activeChild` are already correct.

## Out of scope

- Changes to the restart flow UX (toast, session divider, etc.).
- Adding a timeout / SIGKILL escalation if `abortActiveTurn()` SIGTERM is ignored (risk noted, separate ticket if needed).
- Refactoring other IPC handlers in `po.ts`.

## Plan

| # | File | Change |
|---|---|---|
| 1 | `electron/ipc/po.ts` | Remove `activePoChild` declaration + stale comment (AC-1, AC-4). Replace kill block with `abortActiveTurn()` in `po:restartSession` handler (AC-2). Conditionally remove `ChildProcess` import (AC-3). |

### Risk notes

- `abortActiveTurn()` sends SIGTERM; if the child ignores SIGTERM and hangs, the session reset will still clear `capturedPoSessionId` and send `po:sessionRestarted` to the renderer, but the old process stays running. This is the same risk that existed before (dead kill path also didn't kill). Low priority — no regression introduced.
- If `ChildProcess` type is used elsewhere in the file (e.g. a future reference or inline annotation), removing the import causes a TS error. AC-3 guards against this.

## Outcome

_To be filled at Phase 5._

## Persona Activity

_PO-managed._
