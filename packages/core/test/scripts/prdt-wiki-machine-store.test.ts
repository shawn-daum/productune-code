/**
 * prdt-wiki-machine-store.test.ts — T-446 machine wiki (`~/.prdt/wiki/`),
 * black-box over the REAL `prdt` CLI (idiom: prdt-doctor-build-entry.test.ts).
 *
 * Why the store exists (design §8b): a fact about THIS MACHINE — the lume VM's
 * spec, a patched `computer_server`, a log that grows without rotation — had no
 * home, so it was filed in one project's `docs/wiki/` where every other prdt
 * project on the same machine was blind to it. The store is pull-only: nothing
 * injects it, `prdt wiki search` reaches it.
 *
 * The machine scope is driven by `PRDT_HOME`, so no test ever reads or writes
 * the developer's real `~/.prdt`.
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

let sandbox: string
let machineHome: string

function projectAt(name: string): string {
  const dir = path.join(sandbox, name)
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', name, '--yes'], {
    cwd: dir, env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
  return dir
}

function runPrdt(cwd: string, args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd, env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
}

function writePage(dir: string, name: string, fm: Record<string, string>, body: string) {
  fs.mkdirSync(dir, { recursive: true })
  const head = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n')
  fs.writeFileSync(path.join(dir, `${name}.md`), head + body + '\n')
}

function writeMachinePage(name: string, fm: Record<string, string>, body: string) {
  writePage(path.join(machineHome, 'wiki'), name, fm, body)
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-machine-wiki-'))
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt wiki — machine store (T-446)', () => {
  test('a machine page is findable from a project that does not contain it, tagged as machine scope', () => {
    writeMachinePage('fact--qa-cua-vm', { title: 'QA CUA VM (lume)', type: 'fact' },
      'The lume VM on this machine needs computer_server patched before a GUI run.')
    const proj = projectAt('other-project')
    // no page of this name anywhere under the project
    expect(fs.existsSync(path.join(proj, 'docs', 'wiki', 'fact--qa-cua-vm.md'))).toBe(false)

    const out = runPrdt(proj, ['wiki', 'search', 'computer_server'])
    expect(out).toMatch(/machine:fact--qa-cua-vm/)
    // scope has to be unmistakable to the reader, not inferable from the name alone
    expect(out).toMatch(/\[machine wiki — this machine, any project on it\]/)
  })

  test('search reaches a machine page written after this project last reindexed', () => {
    const proj = projectAt('proj')
    runPrdt(proj, ['wiki', 'reindex'])
    writeMachinePage('fact--late', { title: 'added later', type: 'fact' },
      'A page written from some other project after this index was built.')
    expect(runPrdt(proj, ['wiki', 'search', 'written from some other'])).toMatch(/machine:fact--late/)
  })

  test('one search covers both stores at once, and only machine hits are prefixed', () => {
    writeMachinePage('fact--machine-side', { title: 'machine side', type: 'fact' },
      'Sandbox rule that belongs to this machine.')
    const proj = projectAt('proj')
    writePage(path.join(proj, 'docs', 'wiki'), 'fact--project-side',
      { title: 'project side', type: 'fact' }, 'Sandbox rule that belongs to this project.')
    runPrdt(proj, ['wiki', 'reindex'])

    const out = runPrdt(proj, ['wiki', 'search', 'Sandbox rule that belongs'])
    expect(out).toMatch(/machine:fact--machine-side/)
    expect(out).toMatch(/^fact--project-side/m)
    expect(out).not.toMatch(/machine:fact--project-side/)
  })

  test('reindex writes the machine index at 1 line per page, same rule as the project index', () => {
    writeMachinePage('fact--one', { title: 'first', type: 'fact', version: 'v1.6' }, 'one')
    writeMachinePage('learning--two', { title: 'second', type: 'learning' }, 'two')
    writeMachinePage('fact--old', { title: 'retired', type: 'fact', status: 'superseded' }, 'three')
    const proj = projectAt('proj')
    runPrdt(proj, ['wiki', 'reindex'])

    const idx = fs.readFileSync(path.join(machineHome, 'wiki', 'index.md'), 'utf-8')
    const rows = idx.split('\n').filter((l) => l.startsWith('- '))
    expect(rows.length).toBe(3)
    expect(rows).toContain('- [[machine:fact--one]] fact · v1.6 — first')
    expect(rows).toContain('- [[machine:learning--two]] learning — second')
    expect(rows).toContain('- [[machine:fact--old]] fact ⚠superseded — retired')
    expect(idx).toMatch(/do not hand-edit/)
    // index.md is a derived file, never itself a page
    expect(rows.some((l) => l.includes('machine:index'))).toBe(false)
  })

  test('an absent machine store is not an error — search and reindex still work', () => {
    fs.rmSync(path.join(machineHome, 'wiki'), { recursive: true, force: true })
    const proj = projectAt('proj')
    writePage(path.join(proj, 'docs', 'wiki'), 'fact--only', { title: 'only', type: 'fact' },
      'Project page standing alone.')
    expect(runPrdt(proj, ['wiki', 'reindex'])).toMatch(/1 wiki pages \+ 0 machine/)
    expect(runPrdt(proj, ['wiki', 'search', 'standing alone'])).toMatch(/fact--only/)
  })

  test('the machine store is pull-only: no hook or discipline file injects its content', () => {
    // the zero-token property this store is designed around — nothing in the
    // injected surface reads ~/.prdt/wiki, so a turn that does not query it pays
    // nothing for it.
    const injectors = fs.readdirSync(path.join(CORE_ROOT, 'scripts', 'hooks'))
      .filter((f) => f.endsWith('.sh'))
      .map((f) => fs.readFileSync(path.join(CORE_ROOT, 'scripts', 'hooks', f), 'utf-8'))
    for (const src of injectors) expect(src).not.toMatch(/\.prdt\/wiki|PRDT_HOME[^\n]*wiki/)
  })
})
