// T-1170: `prdt` is a thin launcher that runs the CLI body (prdt_cli.py, beside it) from the
// bytecode cache, in its own namespace. Pins: the cache is written (and only it), a second run
// reuses it, a missing body fails loudly, the launcher's own directory wins over the caller's
// cwd for sibling imports (T-1166 class), and an importlib-loaded `prdt` still exposes the
// body's globals for monkeypatching.
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { copyPrdtCli } from '../helpers/copy-prdt'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')

let tmp: string
let bin: string
let cwd: string
let env: NodeJS.ProcessEnv
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1170-')))
  bin = path.join(tmp, 'bin')
  cwd = path.join(tmp, 'cwd')
  fs.mkdirSync(bin)
  fs.mkdirSync(cwd)
  copyPrdtCli(PRDT_CLI, path.join(bin, 'prdt'))
  env = { ...process.env, HOME: path.join(tmp, 'home'), PRDT_HOME: path.join(tmp, 'prdt-home') }
  delete env.PYTHONDONTWRITEBYTECODE
  delete env.PYTHONPYCACHEPREFIX
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

function run(args: string[]) {
  return spawnSync('python3', [path.join(bin, 'prdt'), ...args], {
    cwd, env, encoding: 'utf8', timeout: subprocessTimeout('cli'),
  })
}

function pycs(): string[] {
  const d = path.join(bin, '__pycache__')
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.startsWith('prdt_cli.')) : []
}

describe('prdt launcher (T-1170)', () => {
  test('same output as the repo copy; writes the body bytecode cache and nothing else; reuses it', () => {
    const want = spawnSync('python3', [PRDT_CLI, '--help'], { cwd, env, encoding: 'utf8' })
    const before = fs.readdirSync(bin).sort()
    const r = run(['--help'])
    expect(r.status).toBe(0)
    expect(r.status).toBe(want.status)
    expect(r.stdout).toBe(want.stdout)
    expect(r.stderr).toBe(want.stderr)
    expect(fs.readdirSync(bin).sort()).toEqual([...before, '__pycache__'].sort())
    expect(fs.readdirSync(cwd)).toEqual([])
    expect(pycs()).toHaveLength(1)
    const pyc = path.join(bin, '__pycache__', pycs()[0])
    const m1 = fs.statSync(pyc).mtimeMs
    expect(run(['--help']).stdout).toBe(want.stdout)
    expect(fs.statSync(pyc).mtimeMs).toBe(m1)
  })

  test('a missing body fails loudly, naming the file and the repair', () => {
    fs.rmSync(path.join(bin, 'prdt_cli.py'))
    const r = run(['--version'])
    expect(r.status).not.toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain(path.join(bin, 'prdt_cli.py'))
    expect(r.stderr).toContain('install.sh')
  })

  test("a sibling module planted in the caller's cwd never wins over the launcher's own (T-1166 class)", () => {
    fs.writeFileSync(path.join(cwd, 'prdt_lanes.py'), 'raise SystemExit("HIJACKED")\n')
    // importlib from `python3 -c` puts '' (the cwd) first on sys.path — the hijack shape
    const out = execFileSync('python3', ['-c', `
import importlib.machinery, importlib.util, sys
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
print(sys.modules["prdt_lanes"].__file__)
print(m.__file__)
`, path.join(bin, 'prdt')], { cwd, env, encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(out.split('\n').slice(0, 2)).toEqual([path.join(bin, 'prdt_lanes.py'), path.join(bin, 'prdt')])
  })

  test('an importlib-loaded prdt exposes the body globals, and patching one reaches the body functions', () => {
    const out = execFileSync('python3', ['-c', `
import importlib.machinery, importlib.util, sys
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
m.prdt_home = lambda: "PATCHED"
print(callable(m.main), m.bin_helper_warnings.__globals__ is m.__dict__)
`, path.join(bin, 'prdt')], { cwd, env, encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(out.trim()).toBe('True True')
  })
})
