/**
 * install-machine-wiki.test.ts — T-446: `~/.prdt/wiki/` lives OUTSIDE the mirror.
 *
 * The mirror step is destructive by design (`rm -rf $PRDT_HOME/discipline`) so a
 * removed discipline file actually disappears. The machine wiki holds content
 * nobody else has a copy of — losing it to an update would be unrecoverable — so
 * it gets exactly the treatment `overrides/` gets: created if absent, never
 * touched again.
 *
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR
 * (idiom: install-project-overrides-hook.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function sandbox() {
  const sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t446-')))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  const env = { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir }
  return { env, prdtHome, run: () => execFileSync('bash', [INSTALL_SH, '--no-statusline'], { env, stdio: 'ignore' }) }
}

const PAGE = '---\ntitle: seeded machine fact\ntype: fact\n---\nthis body must survive\n'

describe.skipIf(!hasJq())('install.sh — machine wiki is outside the mirror (T-446)', () => {
  test('a fresh install creates the store empty, alongside overrides/', () => {
    const { prdtHome, run } = sandbox()
    run()
    expect(fs.statSync(path.join(prdtHome, 'wiki')).isDirectory()).toBe(true)
    expect(fs.readdirSync(path.join(prdtHome, 'wiki'))).toEqual([])
  })

  test('an update over seeded content leaves every page byte-identical', () => {
    const { prdtHome, run } = sandbox()
    run() // fresh
    const page = path.join(prdtHome, 'wiki', 'fact--seeded.md')
    fs.writeFileSync(page, PAGE)
    fs.writeFileSync(path.join(prdtHome, 'wiki', 'index.md'), '# Machine wiki index\n')
    run() // update path (`prdt update` = pull + this same script)
    expect(fs.readFileSync(page, 'utf-8')).toBe(PAGE)
    expect(fs.readdirSync(path.join(prdtHome, 'wiki')).sort()).toEqual(['fact--seeded.md', 'index.md'])
  })

  test('the store survives repeated installs, while discipline/ is still replaced', () => {
    const { prdtHome, run } = sandbox()
    run()
    fs.writeFileSync(path.join(prdtHome, 'wiki', 'fact--seeded.md'), PAGE)
    // a stray file inside the mirror proves the rm -rf still does its job
    const stray = path.join(prdtHome, 'discipline', 'stray-from-an-old-version.md')
    fs.writeFileSync(stray, 'should be swept\n')
    run()
    run()
    expect(fs.existsSync(stray)).toBe(false)
    expect(fs.readFileSync(path.join(prdtHome, 'wiki', 'fact--seeded.md'), 'utf-8')).toBe(PAGE)
  })
})
