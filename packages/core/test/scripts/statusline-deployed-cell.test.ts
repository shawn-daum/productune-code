/**
 * statusline-deployed-cell.test.ts — T-1252 (T-1186 D3).
 * Drives the real script: a product row gains `배포 vX · 개발 vY` only when its
 * DEPLOY.md frontmatter record differs from the dev version; none / equal /
 * malformed leaves the whole output byte-identical to no record.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const STATUSLINE_SH = path.resolve(__dirname, '..', '..', 'scripts', 'statusline-prdt.sh')
let python = true
try { execFileSync('which', ['python3']) } catch { python = false }

type Opts = { deploy?: string | null; lang?: 'ko' | 'en'; version?: string; second?: string | null }

function run(o: Opts = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1252-')))
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1252-home-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', '_shared'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'alpha', 'tickets'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'alpha', products: o.second !== undefined ? [{ name: 'beta' }] : [] }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
    schema_version: 1, stage: 'build', version: o.version ?? 'v9.8', current_task: null,
    products: { beta: { stage: 'build', version: 'v2.1' } },
  }))
  if (o.deploy != null) fs.writeFileSync(path.join(root, 'docs', 'alpha', 'DEPLOY.md'), o.deploy)
  if (o.second != null) {
    fs.mkdirSync(path.join(root, 'docs', 'beta', 'tickets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs', 'beta', 'DEPLOY.md'), o.second)
  }
  return execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
    env: { ...process.env, PRDT_LANG: o.lang ?? 'ko', PRDT_HOME: home },
  })
}
const fm = (line: string) => `---\nname: x\n${line}\n---\n\n# body\n`

describe.skipIf(!python)('statusline deployed cell (T-1252)', () => {
  const base = run()
  test('differs → cell after the version cell (ko)', () => {
    expect(run({ deploy: fm('deployed: {version: v9.7, at: 2026-10-23, ref: v9.7}') }).split('\n')[0])
      .toMatch(/^alpha v9\.8 \| 배포 v9\.7 · 개발 v9\.8 \| /)
  })
  test('english label', () => {
    expect(run({ lang: 'en', deploy: fm('deployed: {version: v9.7, at: 2026-10-23, ref: v9.7}') }).split('\n')[0])
      .toContain('alpha v9.8 | deployed v9.7 · dev v9.8 | ')
  })
  test('ntf-pm shapes: patch-level and short-hash ref', () => {
    expect(run({ version: 'v1.3', deploy: fm('deployed: {version: v1.2.2, at: 2026-09-07, ref: 921da1d}') }))
      .toContain('배포 v1.2.2 · 개발 v1.3')
    expect(run({ version: 'v1.3', deploy: fm('deployed: {version: v1.2, at: 2026-10-21, ref: 5ec4dcc}') }))
      .toContain('배포 v1.2 · 개발 v1.3')
  })
  test('block form is read', () => {
    expect(run({ deploy: fm('deployed:\n  version: v9.1\n  at: 2026-01-01') })).toContain('배포 v9.1 · 개발 v9.8')
  })
  test.each([
    ['no DEPLOY.md', null],
    ['no deployed key', fm('target: github')],
    ['equal', fm('deployed: {version: v9.8, at: 2026-10-23, ref: x}')],
    ['equal across v9.8 / v9.8.0', fm('deployed: {version: v9.8.0, at: 2026-10-23, ref: x}')],
    ['malformed version', fm('deployed: {version: nonsense, at: x, ref: y}')],
    ['no version key', fm('deployed: {at: 2026-10-23}')],
    ['broken flow', fm('deployed: {{{')],
    ['no frontmatter', 'deployed: {version: v1, at: x, ref: y}\n'],
    ['deployed only in body', '---\nname: x\n---\ndeployed: {version: v1, at: x, ref: y}\n'],
  ])('%s → output byte-identical to no record', (_n, deploy) => {
    expect(run({ deploy: deploy as string | null })).toBe(base)
  })
  test('second product reads its own DEPLOY.md; the first stays unchanged', () => {
    const out = run({ second: fm('deployed: {version: v2.0, at: 2026-10-01, ref: r}') }).split('\n')
    expect(out.find((l) => l.startsWith('beta '))).toMatch(/^beta v2\.1 \| 배포 v2\.0 · 개발 v2\.1 \| /)
    expect(out.find((l) => l.startsWith('alpha '))).not.toContain('배포')
  })
})
