/**
 * prdt-root-parity.test.ts — T-377 root-resolution parity, python half.
 *
 * The projectRoot/codeRoot contract lives in three lockstep implementations
 * (PRD §v1.3 설계 결정 4): core TS (state/project-kind.ts), GUI electron
 * (project-paths.ts), and this python CLI (scripts/prdt). The TS pair is covered
 * by project-kind.test.ts + project-paths.test.ts with a byte-identical case
 * list; this file drives the SAME cases through the python resolvers so all three
 * resolve projectRoot and codeRoot identically for: new layout, legacy layout (no
 * code.dir), and a cwd inside `code/`.
 *
 * The resolvers have no CLI surface, so we load `scripts/prdt` as a module via
 * SourceFileLoader (its `if __name__ == "__main__"` guard keeps main() from
 * running) and print JSON for each case.
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

let tmpRoot: string

/** Seed a project dir with a `.prdt/` state dir + config.json (+ po-state so
 *  find_project_root's FILE marker matches), and optional extra subdirs. */
function makeProject(cfg: unknown, subdirs: string[] = []): string {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-parity-')), 'proj')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg ?? {}))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1 }))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

/**
 * Call the python resolvers for `root`, resolving find_project_root from `cwd`
 * (defaults to root). Returns the parsed JSON: codeDir / codeRoot / split /
 * projRootFromCwd.
 */
function pyResolve(root: string, cwd = root): {
  codeDir: string | null
  codeRoot: string
  split: boolean
  projRootFromCwd: string | null
} {
  const script = `
import importlib.util, importlib.machinery, json, os
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
root = ${JSON.stringify(root)}
cwd = ${JSON.stringify(cwd)}
pr = m.find_project_root(cwd)
print(json.dumps({
  "codeDir": m.code_dir_name(root),
  "codeRoot": str(m.code_root(root)),
  "split": m.is_physically_split(root),
  "projRootFromCwd": str(pr) if pr else None,
}))
`
  const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8', timeout: 15000 })
  return JSON.parse(out)
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-parity-outer-'))
})
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt root-resolution parity (T-377, python)', () => {
  test('legacy: no code.dir → codeRoot == projectRoot, not split', () => {
    const root = makeProject({ slug: 'proj', meta: { allowlist: ['.prdt'] } })
    const r = pyResolve(root)
    expect(r.codeDir).toBeNull()
    expect(r.codeRoot).toBe(root)
    expect(r.split).toBe(false)
  })

  test('split: code.dir present → codeRoot = <projectRoot>/<code.dir>', () => {
    const root = makeProject({ slug: 'proj', code: { dir: 'code' } })
    const r = pyResolve(root)
    expect(r.codeDir).toBe('code')
    expect(r.codeRoot).toBe(path.join(root, 'code'))
    expect(r.split).toBe(true)
  })

  test('split: a custom code.dir name is honored', () => {
    const root = makeProject({ code: { dir: 'app' } })
    expect(pyResolve(root).codeRoot).toBe(path.join(root, 'app'))
  })

  test('corrupt config → legacy fallback, never throws', () => {
    const root = makeProject({})
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), '{ not json')
    const r = pyResolve(root)
    expect(r.codeDir).toBeNull()
    expect(r.codeRoot).toBe(root)
  })

  test('empty / non-string code.dir is ignored (treated as legacy)', () => {
    expect(pyResolve(makeProject({ code: { dir: '' } })).codeDir).toBeNull()
    expect(pyResolve(makeProject({ code: { dir: 42 } })).codeDir).toBeNull()
  })

  test('cwd inside code/ → find_project_root up-walks to the parent projectRoot', () => {
    // Split layout: `.prdt/` at projectRoot, a physical `code/` sub-tree. A CLI
    // invoked from inside code/ (or deeper) must resolve the parent projectRoot,
    // exactly as the bash hooks + core walk-up do.
    const root = makeProject({ code: { dir: 'code' } }, ['code/src'])
    // find_project_root calls Path.resolve() (realpath); on macOS /var → /private/var.
    // code_root does NOT realpath, so it matches the unresolved input path.
    const realRoot = fs.realpathSync(root)

    const fromCode = pyResolve(root, path.join(root, 'code'))
    expect(fromCode.projRootFromCwd).toBe(realRoot)
    expect(fromCode.codeRoot).toBe(path.join(root, 'code'))

    const fromDeeper = pyResolve(root, path.join(root, 'code', 'src'))
    expect(fromDeeper.projRootFromCwd).toBe(realRoot)

    // legacy fallback: cwd AT the root resolves depth-0
    expect(pyResolve(root, root).projRootFromCwd).toBe(realRoot)
  })
})
