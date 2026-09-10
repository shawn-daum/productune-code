/**
 * prdt-root-parity.test.ts — T-377 root-resolution parity, python half.
 *
 * The projectRoot/codeRoot contract lives in three lockstep implementations
 * (PRD history §v1.3 설계 결정 4): core TS (state/project-kind.ts), GUI electron
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

/**
 * T-481 — outermost-wins parity between the CLI and the hooks.
 *
 * T-484 moved the four hook resolvers to "outermost marker on the ancestor chain
 * wins"; `scripts/prdt` stayed nearest-wins, so a planted `code/.prdt/po-state.json`
 * was inert for the hooks while the CLI (`tickets` · `wiki` · `doctor` · po-state
 * read/write) still resolved to it — two answers inside one repo. Both halves are
 * driven here on ONE fixture: the bash hook (via its real "persona unspecified"
 * output, which prints the root it resolved) and the python CLI must return the
 * same directory, and a nearest-wins copy of the walk is the positive control
 * showing the fixture really does discriminate.
 */
function hasBin(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const HAS_JQ = hasBin('jq', ['--version'])
const SESSION_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

/** Minimal ~/.prdt so the hook reaches its "in a prdt project (<root>)" branch. */
function miniPrdtHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-outer-home-'))
  fs.mkdirSync(path.join(home, 'discipline', 'po', 'playbooks'), { recursive: true })
  fs.writeFileSync(path.join(home, 'doctrine.md'), '# d\n')
  fs.writeFileSync(path.join(home, 'discipline', 'contracts.md'), '# c\n')
  fs.writeFileSync(path.join(home, 'discipline', 'po', 'habit.md'), '# h\n')
  return home
}

/** The bash hook's projectRoot for `cwd`, EXACTLY as the hook printed it.
 *  This used to end in `fs.realpathSync(m[1])`, which is how T-493 item 3 hid
 *  here for two tickets: normalizing the hook's answer made a lexical answer and
 *  a physical one compare equal, so the resolver divergence this file exists to
 *  catch was invisible to it. A check must not share the assumption it checks.
 *  The symlink cases live in prdt-resolver-symlink-parity.test.ts. */
function hookRoot(cwd: string, home: string): string | null {
  const out = execFileSync('bash', [SESSION_HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', cwd }),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: home },
  })
  if (!out.trim()) return null
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext as string
  const m = ctx.match(/prdt project \(([^)]*)\)/)
  return m ? m[1] : null
}

/** The pre-T-484 rule, as a control: first marker walking up. */
function nearestRoot(cwd: string): string | null {
  let d = fs.realpathSync(cwd)
  for (;;) {
    if (fs.existsSync(path.join(d, '.prdt', 'po-state.json'))) return d
    const up = path.dirname(d)
    if (up === d) return null
    d = up
  }
}

describe.skipIf(!PYTHON3 || !HAS_JQ)('outermost-wins: hook and CLI resolve the same root (T-481/T-484)', () => {
  /** meta root + code tree, optionally with a planted marker inside the code tree. */
  function layout(plant: boolean): { root: string; cwds: string[] } {
    const root = makeProject({ slug: 'real', code: { dir: 'code' } }, ['code/src/deep'])
    if (plant) {
      fs.mkdirSync(path.join(root, 'code', '.prdt'), { recursive: true })
      fs.writeFileSync(path.join(root, 'code', '.prdt', 'po-state.json'),
        JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v9.9', current_task: null }))
    }
    return { root, cwds: [root, path.join(root, 'code'), path.join(root, 'code', 'src', 'deep')] }
  }

  test('a planted code/.prdt cannot become the CLI project root either', () => {
    const home = miniPrdtHome()
    const { root, cwds } = layout(true)
    const real = fs.realpathSync(root)
    const planted = path.join(real, 'code')
    for (const cwd of cwds) {
      expect(pyResolve(root, cwd).projRootFromCwd).toBe(real)
      expect(hookRoot(cwd, home)).toBe(real)
    }
    // positive control: the rule the CLI used to apply hands over the planted root
    expect(nearestRoot(path.join(root, 'code'))).toBe(planted)
    expect(nearestRoot(path.join(root, 'code', 'src', 'deep'))).toBe(planted)
  })

  test('a normal layout (one marker) is byte-identical under both rules', () => {
    const home = miniPrdtHome()
    const { root, cwds } = layout(false)
    const real = fs.realpathSync(root)
    for (const cwd of cwds) {
      expect(pyResolve(root, cwd).projRootFromCwd).toBe(real)
      expect(hookRoot(cwd, home)).toBe(real)
      expect(nearestRoot(cwd)).toBe(real)
    }
  })
})
