/**
 * install.sh mirrors and registers prdt-worktree-guard.sh (T-779) from the
 * manifest roster — asserted against the REAL install.sh under a sandboxed
 * HOME/PRDT_HOME/CLAUDE_DIR (shared fixture, one install for this file).
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { CORE_ROOT, installedMachine, hasJq } from '../helpers/install-fixture'

const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GUARD = 'prdt-worktree-guard.sh'
const MATCHER = 'Edit|Write|MultiEdit|NotebookEdit|Bash'

test('the manifest carries the guard on PreToolUse with the write-tool matcher, as its own entry', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(GUARD)
  const regs = manifest.registrations.filter((r: any) => (r.hooks ?? []).includes(GUARD))
  expect(regs).toHaveLength(1)
  expect(regs[0]).toEqual({ event: 'PreToolUse', matcher: MATCHER, hooks: [GUARD] })
})

test.skipIf(!hasJq())('install.sh mirrors it executable and registers it at the mirrored path', () => {
  const { settings, prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', GUARD)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
  const entry = (settings.hooks?.PreToolUse ?? []).find((e: any) =>
    (e.hooks ?? []).some((h: any) => (h.command as string).includes(GUARD)))
  expect(entry?.matcher).toBe(MATCHER)
  expect((entry.hooks[0].command as string).replace(/"/g, '')).toBe(script)
})
