/**
 * statusline-priority-cell.test.ts — T-1249.
 * Drives the real script: the first line gains `우선 n/m` after the version
 * cell only with 2+ listed projects and this project listed; else byte-identical.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const STATUSLINE_SH = path.resolve(__dirname, '..', '..', 'scripts', 'statusline-prdt.sh')
let python = true
try { execFileSync('which', ['python3']) } catch { python = false }

function run(list: string | null, lang: 'ko' | 'en' = 'ko', slug = 'alpha'): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1249-')))
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1249-home-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v9.8', current_task: null }))
  if (list !== null) fs.writeFileSync(path.join(home, 'priority-projects'), list + '\n')
  return execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
    env: { ...process.env, PRDT_LANG: lang, PRDT_HOME: home },
  })
}

describe.skipIf(!python)('statusline priority cell (T-1249)', () => {
  const base = run(null)
  test('listed among 3 → cell right after the version cell', () => {
    expect(run('beta,alpha,gamma').split('\n')[0]).toMatch(/^alpha v9\.8 \| 우선 2\/3 \| /)
  })
  test('english label', () => {
    expect(run('alpha,beta', 'en').split('\n')[0]).toContain('alpha v9.8 | priority 1/2 | ')
  })
  test.each([
    ['no list file', null],
    ['one listed', 'alpha'],
    ['this project not listed', 'beta,gamma'],
    ['empty list', ''],
  ])('%s → output byte-identical to no list', (_n, list) => {
    expect(run(list as string | null)).toBe(base)
  })
})
