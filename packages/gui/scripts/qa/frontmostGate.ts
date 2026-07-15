/**
 * frontmostGate — local mitigation for synthetic System Events key injection
 * leaking into the user's real session.
 *
 * WHY (T-354 → T-357): a local IME-verification harness drove real macOS
 * key events via AppleScript `key code` (which — unlike `keystroke` — passes
 * through the live input method, which is the point of that harness). When
 * the harness's own window lost frontmost status mid-run, those key events
 * leaked into whatever app the user had focused: real keystrokes (w/n/j)
 * typed into the user's apps, and the input source got flipped to Korean
 * for ~2 minutes. See docs/wiki/inbox.md "(T-354 qa)" entries and
 * docs/wiki/fact--gui-testing-env.md.
 *
 * The durable fix is routing this whole class of verification (focus/IME/
 * synthetic-key) into the isolated CUA VM — see docs/wiki/fact--qa-cua-vm.md.
 * This gate is the cheap *local* backstop for any harness that still runs
 * key injection on the host: call it immediately before every osascript
 * `keystroke`/`key code` send (or burst of sends), and abort the run if the
 * frontmost app isn't the one the harness expects to be driving.
 *
 * Usage:
 *   assertFrontmost('Electron') // throws if Electron isn't frontmost
 *   // ...then send the synthetic key event...
 */

import { execFileSync } from 'node:child_process';

/**
 * Returns the process name System Events reports as currently frontmost.
 * Requires the caller to already hold Accessibility/Automation permission
 * for System Events (the same permission the key-injection call itself
 * needs) — this makes one extra osascript round-trip, not a new grant.
 */
export function getFrontmostProcessName(
  execFn: typeof execFileSync = execFileSync,
): string {
  return execFn('osascript', [
    '-e',
    'tell application "System Events" to get name of first process whose frontmost is true',
  ])
    .toString()
    .trim();
}

export class FrontmostGateError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `frontmostGate: refusing synthetic key injection — frontmost app is "${actual}", ` +
        `expected "${expected}". Aborting to avoid leaking keys into the user's session ` +
        `(see T-354 / docs/wiki/fact--gui-testing-env.md).`,
    );
    this.name = 'FrontmostGateError';
  }
}

/**
 * Throws FrontmostGateError unless `expectedProcessName` is currently
 * frontmost. `getFrontmost` is injectable for testing; defaults to the real
 * System Events query.
 */
export function assertFrontmost(
  expectedProcessName: string,
  getFrontmost: () => string = getFrontmostProcessName,
): void {
  const actual = getFrontmost();
  if (actual !== expectedProcessName) {
    throw new FrontmostGateError(expectedProcessName, actual);
  }
}
