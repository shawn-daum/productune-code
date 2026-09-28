/**
 * install.sh registers prdt-auto-open.sh — T-409.
 *
 * Unlike prdt-audience-inject.sh/prdt-plan-tier-inject.sh/prdt-overrides-
 * inject.sh (which ride SessionStart/SubagentStart alongside prdt-session-
 * start.sh), prdt-auto-open.sh rides its OWN PostToolUse registration with
 * matcher "Write" — a distinct event/matcher pair from the existing
 * PostToolUse:Agent entry (prdt-post-dispatch.sh), so both must coexist as
 * separate {matcher, hooks[]} entries under the same "PostToolUse" key. It
 * must be mirrored executable. Re-running install.sh must stay idempotent.
 *
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR
 * via the shared fixture (T-536: installed-state assertions share ONE install
 * for this file; only the idempotency test runs its own installs, because its
 * subject is the re-RUN) — required isolation: a subprocess install.sh run
 * against the real $HOME has broken the developer's own CLI before
 * (install-audience-hook.test.ts precedent).
 */

import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'
import { installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

test.skipIf(!hasJq())('mirrors prdt-auto-open.sh executable', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', 'prdt-auto-open.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('PostToolUse carries the pre-existing Agent entry and BOTH new auto-open entries (Write, Bash — T-794)', () => {
  const { settings } = installedMachine()
  const entries = settings.hooks.PostToolUse as any[]
  const agentEntry = entries.find((e) => e.matcher === 'Agent')
  const writeEntry = entries.find((e) => e.matcher === 'Write')
  const bashEntry = entries.find((e) => e.matcher === 'Bash')
  expect(agentEntry?.hooks?.[0]?.command).toContain('prdt-post-dispatch.sh')
  expect(writeEntry?.hooks?.[0]?.command).toContain('prdt-auto-open.sh')
  expect(bashEntry?.hooks?.[0]?.command).toContain('prdt-auto-open.sh')
  expect(entries.length).toBe(3)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (single auto-open entry per matcher, single command each)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  for (const matcher of ['Write', 'Bash']) {
    const entries = (settings.hooks.PostToolUse as any[]).filter((e) => e.matcher === matcher)
    expect(entries.length, matcher).toBe(1)
    expect(entries[0].hooks.length, matcher).toBe(1)
  }
})

// T-750: the message catalog is mirrored beside bin/prdt, so the INSTALLED
// `prdt settings` prints catalog lines — never the bare message keys.
test.skipIf(!hasJq())('installed prdt settings reads the mirrored message catalog', () => {
  const { prdtHome } = installedMachine()
  expect(fs.existsSync(path.join(prdtHome, 'bin', 'prdt-messages.json'))).toBe(true)
  const out = execFileSync('python3', [path.join(prdtHome, 'bin', 'prdt'), 'settings'], {
    cwd: prdtHome, encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: prdtHome, PRDT_DISCIPLINE: path.join(prdtHome, 'discipline'), PRDT_LANG: 'ko' },
  })
  expect(out).toContain('PO가 건네는 파일 자동 열기')
  expect(out).not.toContain('settings.list.')
})
