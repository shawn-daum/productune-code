/**
 * T-868 (diagnosis half) — when the static viewer cannot be generated,
 * `prdt viewer`, `prdt tickets --link` and `prdt doctor` name the exact missing
 * piece and the command that fixes it.
 *
 * Before: one generic 「뷰어를 만들지 못했어요 — node 와 … 의존성이 필요해요」 for
 * every state, and `_viewer_generator()` passed on `packages/gui/node_modules`
 * merely being a directory — a `pnpm install` older than the viewer's
 * dependencies (`marked`, `subset-font`) left the directory in place, node died
 * with ERR_MODULE_NOT_FOUND and `viewer_regenerate` discarded that stderr.
 *
 * Every case runs a COPY of `scripts/prdt` placed in a fake checkout
 * (`<sb>/code/packages/core/scripts/prdt`), so self-reference resolves to a
 * checkout whose contents this file controls; the generator is a stub cli.mjs.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REAL_PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
const REAL_DISCIPLINE = path.join(CORE_ROOT, 'discipline')
const HAS_GENERATOR = fs.existsSync(path.join(CORE_ROOT, '..', 'gui', 'node_modules', 'marked'))

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const PY = PYTHON3 ?? 'python3' // absolute: a case that empties PATH must still find python

let sb: string
let home: string
let root: string

const OK_CLI = `import fs from 'node:fs'
import path from 'node:path'
const a = process.argv
const out = a[a.indexOf('--out') + 1]
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, '<!doctype html>')
`

interface Fake { prdt: string; code: string; gui: string }

/** A fake checkout; `omit` names pieces to leave out. */
function fakeCheckout(opts: { omit?: string[]; cli?: string } = {}): Fake {
  const omit = new Set(opts.omit ?? [])
  const code = path.join(sb, 'code')
  const scripts = path.join(code, 'packages', 'core', 'scripts')
  const gui = path.join(code, 'packages', 'gui')
  fs.mkdirSync(scripts, { recursive: true })
  const prdt = path.join(scripts, 'prdt')
  fs.copyFileSync(REAL_PRDT, prdt)
  fs.chmodSync(prdt, 0o755)
  if (!omit.has('cli.mjs')) {
    fs.mkdirSync(path.join(gui, 'viewer'), { recursive: true })
    fs.writeFileSync(path.join(gui, 'viewer', 'cli.mjs'), opts.cli ?? OK_CLI)
  }
  if (!omit.has('node_modules')) {
    for (const pkg of ['marked', 'subset-font']) {
      if (omit.has(pkg)) continue
      fs.mkdirSync(path.join(gui, 'node_modules', pkg), { recursive: true })
      fs.writeFileSync(path.join(gui, 'node_modules', pkg, 'package.json'), `{"name":"${pkg}"}`)
    }
    if (!omit.has('pretendard')) {
      fs.mkdirSync(path.join(gui, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2'), { recursive: true })
    } else {
      fs.mkdirSync(path.join(gui, 'node_modules'), { recursive: true })
    }
  }
  if (!omit.has('tokens.css')) {
    fs.mkdirSync(path.join(gui, 'src', 'styles'), { recursive: true })
    fs.writeFileSync(path.join(gui, 'src', 'styles', 'tokens.css'), ':root{}')
  }
  return { prdt, code, gui }
}

function project(): string {
  const r = path.join(sb, 'proj')
  fs.mkdirSync(path.join(r, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(r, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(r, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.writeFileSync(path.join(r, 'docs', 'tickets', 'v1.0', 'T-001.md'),
    '---\nid: T-001\nslug: first\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nhello\n')
  return r
}

function run(prdt: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const r = spawnSync(PY, [prdt, ...args], {
    cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
    env: { ...process.env, PRDT_HOME: home, ...env },
  })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

beforeEach(() => {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t868-')))
  home = path.join(sb, 'home')
  fs.mkdirSync(home, { recursive: true })
  root = project()
})
afterEach(() => { fs.rmSync(sb, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt viewer — the cause is named, with the one fix command', () => {
  test('positive control: a complete checkout generates and prints the link, no stderr', () => {
    const f = fakeCheckout()
    const r = run(f.prdt, ['viewer'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('[viewer](file://')
    expect(r.err).toBe('')
  })

  test('node not on PATH', () => {
    const f = fakeCheckout()
    const empty = path.join(sb, 'nobin')
    fs.mkdirSync(empty)
    const r = run(f.prdt, ['viewer'], { PATH: empty })
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('node 가 PATH 에 없어요')
    expect(r.err).toContain('brew install node')
  })

  test('no prdt checkout found: PRDT_REPO missing names the prdt.env path', () => {
    // an installed copy: two levels up is $PRDT_HOME itself, which has no scripts/prdt
    const bin = path.join(home, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.copyFileSync(REAL_PRDT, path.join(bin, 'prdt'))
    const r = run(path.join(bin, 'prdt'), ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('prdt 체크아웃을 찾지 못했어요')
    expect(r.err).toContain('PRDT_REPO')
    expect(r.err).toContain(path.join(home, 'prdt.env'))
  })

  test('no prdt checkout found: PRDT_REPO pointing nowhere names that path', () => {
    const bin = path.join(home, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.copyFileSync(REAL_PRDT, path.join(bin, 'prdt'))
    fs.writeFileSync(path.join(home, 'prdt.env'), `PRDT_REPO=${path.join(sb, 'gone')}\n`)
    const r = run(path.join(bin, 'prdt'), ['viewer'])
    expect(r.err).toContain(path.join(sb, 'gone'))
    expect(r.err).toContain(path.join(home, 'prdt.env'))
  })

  test('cli.mjs missing names the path it looked at', () => {
    const f = fakeCheckout({ omit: ['cli.mjs'] })
    const r = run(f.prdt, ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain(path.join(f.gui, 'viewer', 'cli.mjs'))
    expect(r.err).toContain('없어요')
  })

  test('node_modules directory absent: fix is pnpm install at the code root', () => {
    const f = fakeCheckout({ omit: ['node_modules'] })
    const r = run(f.prdt, ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('node_modules')
    expect(r.err).toContain(`cd ${f.code} && pnpm install`)
  })

  test('node_modules present but marked + subset-font missing (the old-install state): both named', () => {
    const f = fakeCheckout({ omit: ['marked', 'subset-font'] })
    const r = run(f.prdt, ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('marked')
    expect(r.err).toContain('subset-font')
    expect(r.err).not.toContain('pretendard')
    expect(r.err).toContain(`cd ${f.code} && pnpm install`)
  })

  test('pretendard woff2 files missing is named', () => {
    const f = fakeCheckout({ omit: ['pretendard'] })
    const r = run(f.prdt, ['viewer'])
    expect(r.err).toContain('pretendard')
    expect(r.err).toContain(`cd ${f.code} && pnpm install`)
  })

  test('tokens.css missing is named as an incomplete checkout', () => {
    const f = fakeCheckout({ omit: ['tokens.css'] })
    const r = run(f.prdt, ['viewer'])
    expect(r.err).toContain('src/styles/tokens.css')
  })

  test('generation ran and failed: the first stderr line is quoted', () => {
    const f = fakeCheckout({ cli: "console.error('Error: boom from generator'); console.error('  at second line'); process.exit(1)\n" })
    const r = run(f.prdt, ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('Error: boom from generator')
    expect(r.err).not.toContain('second line')
  })

  test('scratch safety still comes first, and the dependency check never reads .prdt/scratch', () => {
    const f = fakeCheckout({ omit: ['marked'] })
    const elsewhere = path.join(sb, 'elsewhere')
    fs.mkdirSync(elsewhere)
    fs.mkdirSync(path.join(root, '.prdt', 'scratch'), { recursive: true })
    fs.symlinkSync(elsewhere, path.join(root, '.prdt', 'scratch', 'viewer'))
    const r = run(f.prdt, ['viewer'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('심볼릭 링크')
    expect(r.err).not.toContain('marked')
    expect(fs.readdirSync(elsewhere)).toEqual([])
    // a node_modules planted under the scratch never satisfies the check
    fs.rmSync(path.join(root, '.prdt', 'scratch', 'viewer'))
    fs.mkdirSync(path.join(root, '.prdt', 'scratch', 'viewer', 'node_modules', 'marked'), { recursive: true })
    const r2 = run(f.prdt, ['viewer'])
    expect(r2.err).toContain('marked')
  })
})

describe.skipIf(!PYTHON3)('prdt tickets --link — markdown fallback plus one stderr line with the same cause', () => {
  test('a missing package: the fallback file link stays on stdout, one cause line on stderr', () => {
    const f = fakeCheckout({ omit: ['marked'] })
    const r = run(f.prdt, ['tickets', '--link', 'T-001'])
    expect(r.code).toBe(0)
    expect(r.out.trim()).toMatch(/^\[T-001\]\(file:\/\/.*T-001\.md\)$/)
    const lines = r.err.split('\n').filter((l) => l.trim())
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('marked')
    expect(lines[0]).toContain(`cd ${f.code} && pnpm install`)
  })

  test('two ids still print one stderr line', () => {
    const f = fakeCheckout({ omit: ['marked'] })
    fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1.0', 'T-002.md'),
      '---\nid: T-002\nslug: second\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nhi\n')
    const r = run(f.prdt, ['tickets', '--link', 'T-001', 'T-002'])
    expect(r.err.split('\n').filter((l) => l.trim()).length).toBe(1)
  })

  test('generation failure: same cause as `prdt viewer` names', () => {
    const f = fakeCheckout({ cli: "console.error('Error: boom from generator'); process.exit(1)\n" })
    const r = run(f.prdt, ['tickets', '--link', 'T-001'])
    expect(r.out).toContain('T-001.md')
    expect(r.err).toContain('Error: boom from generator')
  })

  test('positive control: a working generator prints the viewer link and nothing on stderr', () => {
    const f = fakeCheckout()
    const r = run(f.prdt, ['tickets', '--link', 'T-001'])
    expect(r.out).toContain('/.prdt/scratch/viewer/at/')
    expect(r.err).toBe('')
  })
})

/** A machine + project `prdt doctor` can run in; the checkout is the COPY. */
function doctorLines(prdt: string): string[] {
  const disc = path.join(sb, 'discipline')
  if (!fs.existsSync(disc)) fs.cpSync(REAL_DISCIPLINE, disc, { recursive: true })
  fs.mkdirSync(path.join(home, 'wiki'), { recursive: true })
  const proj = path.join(sb, 'dproj')
  if (!fs.existsSync(proj)) {
    fs.mkdirSync(proj, { recursive: true })
    execFileSync('python3', [REAL_PRDT, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: proj, env: { ...process.env, PRDT_HOME: home }, stdio: 'ignore', timeout: subprocessTimeout('cli'),
    })
  }
  const out = execFileSync('python3', [prdt, 'doctor'], {
    cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('doctor'),
    env: { ...process.env, PRDT_HOME: home, PRDT_DISCIPLINE: disc, CLAUDE_DIR: path.join(sb, 'claude') },
  })
  return out.split('\n').filter((l) => /viewer/i.test(l) && l.startsWith('⚠'))
}

describe.skipIf(!PYTHON3)('prdt doctor — viewer generator', () => {
  test('reports the missing package with the fix command', () => {
    const f = fakeCheckout({ omit: ['marked', 'subset-font'] })
    const lines = doctorLines(f.prdt)
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('marked')
    expect(lines[0]).toContain('subset-font')
    expect(lines[0]).toContain(`cd ${f.code} && pnpm install`)
  })

  test('reports a missing cli.mjs', () => {
    const f = fakeCheckout({ omit: ['cli.mjs'] })
    const lines = doctorLines(f.prdt)
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('cli.mjs')
  })

  test('silent when the generator works', () => {
    const f = fakeCheckout()
    expect(doctorLines(f.prdt)).toEqual([])
  })

  test.skipIf(!HAS_GENERATOR)('silent on this very checkout', () => {
    expect(doctorLines(REAL_PRDT)).toEqual([])
  })
})
