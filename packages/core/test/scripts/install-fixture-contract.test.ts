/**
 * The shared installed-machine fixture's own contract — T-536.
 *
 * The suite's install weight was cut by sharing ONE install per test file
 * (test/helpers/install-fixture.ts). That trade is only safe under two
 * invariants, asserted here so their removal is a red run instead of a code
 * review hope:
 *
 *   1. memoization — repeated installedMachine() calls in one file return the
 *      SAME machine (one install.sh run), or the fixture silently degrades
 *      back to one full install per test case;
 *   2. read-only — the shared machine rejects writes, so a test that mutates
 *      it fails at the write site (EACCES/EPERM) instead of leaking the
 *      mutation into the next test in the file. Remove the `chmod -R a-w` in
 *      installedMachine() and THIS test fails.
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { installedMachine, hasJq } from '../helpers/install-fixture'

test.skipIf(!hasJq())('one install per file: repeated calls reuse the same machine', () => {
  const a = installedMachine()
  const b = installedMachine()
  expect(b.root).toBe(a.root)
  // and it IS an installed machine, not just an empty sandbox
  expect(fs.existsSync(path.join(a.prdtHome, 'hooks', 'prdt-session-start.sh'))).toBe(true)
  expect(Object.keys(a.settings.hooks ?? {}).length).toBeGreaterThan(0)
})

test.skipIf(!hasJq())('the shared machine is read-only: a mutation fails at its own write site, not in the next test', () => {
  const m = installedMachine()
  // overwriting an existing surface is refused
  expect(() => fs.writeFileSync(m.settingsPath, '{"clobbered":true}')).toThrow(/EACCES|EPERM/)
  // planting a new file into the mirror is refused too
  expect(() => fs.writeFileSync(path.join(m.prdtHome, 'hooks', 'planted.sh'), '#!/bin/sh\n'))
    .toThrow(/EACCES|EPERM/)
  // ...and the machine is intact afterwards
  expect(Object.keys(installedMachine().settings.hooks ?? {}).length).toBeGreaterThan(0)
})
