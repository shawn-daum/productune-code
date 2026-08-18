/**
 * prdt-init-releases-stub.test.ts — T-453, the release-notes format travelling with
 * every project instead of living only in productune's own wiki.
 *
 * The convention (T-394 `decision--release-notes-format`) declares itself common to
 * ALL prdt-managed projects, but only prdt-self ever received a `docs/RELEASES.md`.
 * A freshly initialized project had to invent a format at release time. The fix is
 * the scaffold: `prdt init` drops a `RELEASES.md` whose preamble IS the spec, so the
 * format arrives with the project and no one consults another repo's wiki.
 *
 * Two things are asserted, because they fail differently:
 *   1. Scaffold — the stub lands at `<codeRoot>/docs/RELEASES.md` (code side, both
 *      layouts), carries the full format spec, and never clobbers an existing file.
 *   2. Parser contract (unchanged) — the stub is SECTIONLESS, so a fresh project
 *      degrades to (None, None) exactly as a project with no file at all does. The
 *      nudge must stay silent for a project that has shipped nothing; adding a
 *      scaffold file must not turn silence into a bogus version offer.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function runInit(args: string[] = []): any {
  const out = execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  })
  return JSON.parse(out)
}

/** Load scripts/prdt as a module and evaluate `expr`, printing it as JSON. */
function py(expr: string, cwd = projectDir): unknown {
  const script = `
import importlib.util, importlib.machinery, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
print(json.dumps(${expr}))
`
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8', cwd, timeout: 30000 }))
}

const RELEASES_REL = path.join('docs', 'RELEASES.md')

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-init-releases-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt init — RELEASES.md stub (T-453)', () => {
  test('fresh (split) init drops the stub at codeRoot and its preamble IS the format spec', () => {
    expect(runInit().status).toBe('created')

    // Code side, not meta: the physical layout puts it under `<root>/code/docs/`.
    const stub = path.join(projectDir, 'code', RELEASES_REL)
    expect(fs.existsSync(stub)).toBe(true)
    expect(fs.existsSync(path.join(projectDir, RELEASES_REL))).toBe(false)

    const body = fs.readFileSync(stub, 'utf-8')
    // Every clause a releaser would otherwise have to look up in another repo's wiki:
    // section shape + verbatim-tag anchor, ordering, the group headings, and WHEN.
    expect(body).toContain('## <version>')
    expect(body).toContain('first token after `## `')
    expect(body).toMatch(/verbatim/)
    expect(body).toMatch(/newest first/)
    for (const g of ['### Added', '### Changed', '### Fixed', '### Removed']) {
      expect(body, `format spec must name ${g}`).toContain(g)
    }
    expect(body).toMatch(/same change that cuts the `v\*` tag/)
    expect(body).toMatch(/preamble/)
  })

  test('legacy layout (user brought their own repo) still gets the stub, at projectRoot', () => {
    execFileSync('git', ['init', '-q'], { cwd: projectDir })
    expect(runInit().status).toBe('created')

    // codeRoot == projectRoot in legacy — one rule ("<codeRoot>/docs/RELEASES.md"),
    // both layouts, so the releaser never has to ask which tree it belongs to.
    expect(fs.existsSync(path.join(projectDir, RELEASES_REL))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'code', RELEASES_REL))).toBe(false)
  })

  test('an existing RELEASES.md is never overwritten or reformatted by init', () => {
    const own = '# my notes\n\n## 2.0.0-rc1\n\n- shipped before prdt showed up\n'
    fs.mkdirSync(path.join(projectDir, 'code', 'docs'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'code', RELEASES_REL), own)

    expect(runInit().status).toBe('created')
    expect(fs.readFileSync(path.join(projectDir, 'code', RELEASES_REL), 'utf-8')).toBe(own)

    // re-init is a no-op on an initialized project, stub included
    expect(runInit().status).toBe('exists')
    expect(fs.readFileSync(path.join(projectDir, 'code', RELEASES_REL), 'utf-8')).toBe(own)
  })

  test('parsing contract holds: the stub is sectionless, so a fresh project degrades exactly like a missing file', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    const stub = path.join(codeRoot, RELEASES_REL)

    // No line in the shipped preamble may start with `## ` — that token is the
    // updater's section boundary, and a stray one would advertise a phantom version.
    const body = fs.readFileSync(stub, 'utf-8')
    expect(body.split('\n').filter((l) => l.startsWith('## '))).toEqual([])

    // Scaffolded project == project with no file at all: (None, None), no throw.
    expect(py(`m.releases_local(${JSON.stringify(codeRoot)})`)).toEqual([null, null])
    fs.rmSync(stub)
    expect(py(`m.releases_local(${JSON.stringify(codeRoot)})`)).toEqual([null, null])
  })

  test('the first real section written into the stub parses as the verbatim tag', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    const stub = path.join(codeRoot, RELEASES_REL)

    // A releaser following the stub's own instructions must land a parseable section.
    fs.appendFileSync(stub, '\n## v0.1 — first ship (2026-08-14)\n\n### Added\n- the thing\n')
    expect(py(`m.releases_local(${JSON.stringify(codeRoot)})`)).toEqual([
      'v0.1',
      '## v0.1 — first ship (2026-08-14)\n\n### Added\n- the thing',
    ])
  })
})
