/**
 * T-1276 — optional ticket `title:` (free text, any user_lang): `tickets new --title`
 * writes it, the listing and `fmt --check` accept it, the viewer shows title before slug.
 * Two non-English titles prove no language is hard-coded.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const VIEWER_CLI = path.join(CORE_ROOT, '..', 'viewer', 'cli.mjs')
const viewerReady = fs.existsSync(path.join(CORE_ROOT, '..', 'viewer', 'node_modules', 'marked'))

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1276-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'home', surfaces: {} }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n\n## v1.0 — home\n')
  return root
}
function prdt(root: string, home: string, args: string[]) {
  return spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
    env: { ...process.env, PRDT_HOME: home, PRDT_META_BACKUP: '0', TZ: 'UTC' },
  })
}

describe('T-1276 ticket title', () => {
  const root = project()
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1276-home-'))
  const titles = ['로그인 화면 개선', 'ログイン画面を改善: 2 件目 #x']

  test('new writes title for two languages; a ticket without one stays valid', () => {
    titles.forEach((t, i) => {
      const r = prdt(root, home, ['tickets', 'new', '--type', 'impl', '--slug', `with-title-${i}`, '--title', t])
      expect(r.status).toBe(0)
      const md = fs.readFileSync(path.join(root, 'docs', 'tickets', 'v1.0', `T-00${i + 1}.md`), 'utf8')
      expect(md).toContain(`\ntitle: ${t}\n`)
      expect(md.indexOf('slug:')).toBeLessThan(md.indexOf('title:'))
    })
    expect(prdt(root, home, ['tickets', 'new', '--type', 'impl', '--slug', 'plain']).status).toBe(0)
    const md3 = fs.readFileSync(path.join(root, 'docs', 'tickets', 'v1.0', 'T-003.md'), 'utf8')
    expect(md3).not.toContain('title:')
    expect(prdt(root, home, ['tickets', 'new', '--type', 'impl', '--slug', 'bad', '--title', 'a\nb']).status).not.toBe(0)
  }, 120_000)

  test('fmt --check accepts title and no-title tickets', () => {
    const r = prdt(root, home, ['tickets', 'fmt', 'T-001', 'T-002', 'T-003', '--check'])
    expect(r.stdout).not.toMatch(/title/)
    expect(r.stdout).not.toMatch(/unknown|invalid key/i)
  }, 120_000)

  test('listing prints title, falls back to slug', () => {
    const out = prdt(root, home, ['tickets']).stdout
    expect(out).toContain(`${titles[0]} →`)
    expect(out).toContain(`${titles[1]} →`)
    expect(out).toMatch(/plain →/)
  }, 120_000)

  test.skipIf(!viewerReady)('viewer shows title before slug, slug when no title', () => {
    const outFile = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    execFileSync('node', [VIEWER_CLI, '--repo-root', root, '--out', outFile], { stdio: 'pipe', timeout: subprocessTimeout('cli') })
    const html = fs.readFileSync(outFile, 'utf8')
    expect(html).toContain(titles[0])
    expect(html).toContain('plain')
    expect(html).not.toContain('with-title-0')
  }, 120_000)
})
