/**
 * Roster parity: the GUI hook roster (PRDT_HOOK_BASENAMES in onboarding.ts) MUST
 * equal the hook roster install.sh §4 registers. (T-413)
 *
 * The GUI banner path and install.sh are two hand-written registrations of the
 * SAME hook set. Before T-413 they were hand-synced and DRIFTED: install.sh
 * registered 6 hooks (session-start, post-compact, post-dispatch, user-prompt,
 * audience-inject, overrides-inject) while the GUI list carried only 4 — so a
 * GUI-only user (the north-star persona) never got audience-inject (T-326) or
 * overrides-inject (T-358). This test makes that class of drift fail LOUDLY:
 * it parses install.sh's jq registration block for the prdt-*.sh basenames it
 * registers as hook commands, and asserts the set equals the GUI's exported
 * PRDT_HOOK_BASENAMES.
 *
 * We chose the "complete-list + parity-test" route (acceptance §4's fallback)
 * over a full single-SoT extraction: install.sh's roster lives inside a proven jq
 * program (bash), and the GUI's inside TypeScript; a shared machine-readable
 * manifest both derive from is a larger, riskier refactor than the drift it
 * prevents warrants right now (YAGNI). This test is the loud-failure guard that
 * makes the two hand-written lists safe until that extraction is scheduled.
 *
 * Reads install.sh from the real repo (packages/core/scripts/install.sh) — no
 * ~/.claude / ~/.prdt is touched; this is a pure source-text parse.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PRDT_HOOK_BASENAMES } from './onboarding'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// packages/gui/electron/ipc → packages/core/scripts/install.sh
const INSTALL_SH = path.resolve(HERE, '..', '..', '..', 'core', 'scripts', 'install.sh')

/**
 * The prdt-*.sh basenames install.sh registers as hook COMMANDS. In install.sh
 * every registered command is built as `("\"" + $h + "prdt-<name>.sh" + "\"")`,
 * where $h is the ~/.prdt/hooks/ mirror prefix — so `$h + "prdt-....sh"` uniquely
 * marks a registered hook (and never the §1 `cp` mirror list or a comment).
 */
function installShRegisteredRoster(src: string): Set<string> {
  const re = /\$h\s*\+\s*"(prdt-[a-z0-9-]+\.sh)"/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) found.add(m[1])
  return found
}

import { test, expect } from 'vitest'

test('T-413: GUI hook roster equals install.sh registered roster (drift fails loudly)', () => {
  const src = fs.readFileSync(INSTALL_SH, 'utf8')
  const cliRoster = installShRegisteredRoster(src)

  // Sanity: the parse must actually find hooks — a zero match would make the
  // equality trivially satisfiable if the GUI list were also empty, and signals
  // the command-shape in install.sh changed out from under this parser.
  expect(cliRoster.size).toBeGreaterThanOrEqual(6)

  const guiRoster = new Set<string>(PRDT_HOOK_BASENAMES)

  const missingFromGui = [...cliRoster].filter(b => !guiRoster.has(b)).sort()
  const extraInGui = [...guiRoster].filter(b => !cliRoster.has(b)).sort()

  expect(
    { missingFromGui, extraInGui },
    `GUI PRDT_HOOK_BASENAMES drifted from install.sh §4.\n` +
      `  install.sh registers: ${[...cliRoster].sort().join(', ')}\n` +
      `  GUI list:             ${[...guiRoster].sort().join(', ')}\n` +
      `  in install.sh, missing from GUI: ${missingFromGui.join(', ') || '(none)'}\n` +
      `  in GUI, not in install.sh:       ${extraInGui.join(', ') || '(none)'}`,
  ).toEqual({ missingFromGui: [], extraInGui: [] })
})
