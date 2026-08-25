/**
 * install.sh's registered-hook count is DERIVED from hook-manifest.json — T-490.
 *
 * The defect: `say "4) Registering hook 10종 …"` was hard-coded, and so was the
 * literal in the file's own header comment, while the manifest roster had grown
 * to 11. A wrong count in a user-visible line during a load-bearing operation
 * (this is the step that decides whether the discipline reaches the machine at
 * all) is the whole defect — it invites the reader to trust a number the
 * installer is not actually acting on.
 *
 * hook-manifest.json is already the single roster SoT that install.sh §1/§4 and
 * the GUI's installPrdtHooks both reduce over (T-414). The count the user READS
 * now comes from the same place the registration does, so it cannot go stale on
 * its own — which is what these tests pin: not "the count is 11", but "the count
 * equals the manifest", plus the absence of any literal that could drift again.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function rosterSize(): number {
  return (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).basenames as string[]).length
}

test('install.sh carries no hard-coded hook count anywhere', () => {
  const src = fs.readFileSync(INSTALL_SH, 'utf8')
  const literals = src.split('\n')
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => /\d+\s*종/.test(line))
  expect(literals, `a literal hook count is back: ${JSON.stringify(literals)}`).toEqual([])
})

test('the count comes from the manifest roster', () => {
  const src = fs.readFileSync(INSTALL_SH, 'utf8')
  expect(src).toMatch(/HOOK_COUNT="\$\(jq -r '\.basenames \| length' "\$MANIFEST"\)"/)
  expect(src).toContain('${HOOK_COUNT}종')
})

test('the roster is 11 hooks today — a canary on the number the user reads', () => {
  // Not the assertion that matters (the two above are), but the one that makes a
  // roster change visible in this file's diff as well as in the manifest's.
  expect(rosterSize()).toBe(11)
})

test.skipIf(!hasJq())('a real install prints the manifest count', () => {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-count-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  const out = execFileSync('bash', [INSTALL_SH], {
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
    encoding: 'utf8',
  })
  expect(out).toContain(`4) Registering hook ${rosterSize()}종`)

  // …and the number is honest: that many hook scripts really were mirrored, and
  // every one of them really is registered in settings.json.
  const basenames = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).basenames as string[]
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const commands = Object.values(settings.hooks as Record<string, any[]>)
    .flatMap((entries) => entries.flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string)))
  for (const b of basenames) {
    expect(fs.existsSync(path.join(prdtHome, 'hooks', b)), `${b} not mirrored`).toBe(true)
    expect(commands.some((c) => c.includes(b)), `${b} not registered`).toBe(true)
  }
})
