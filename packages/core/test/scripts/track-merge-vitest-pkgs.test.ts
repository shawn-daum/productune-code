/**
 * T-1417 regression: `prdt track merge` died with "no vitest binary ... (node_modules missing)"
 * because _track_vitest_pkgs returned code/ and code/packages/, whose vitest configs are the guard
 * configs that refuse a bare run. Only a directory with a real config is a package.
 */
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PKG = path.resolve(__dirname, '..', '..')
const CODE = path.resolve(PKG, '..', '..')
const CLI = path.join(PKG, 'scripts', 'prdt_cli.py')

const PY = `
import importlib.util, importlib.machinery, sys
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
from pathlib import Path
wt = Path(sys.argv[2])
print("\\n".join(str(p.relative_to(wt)) or "." for p in m._track_vitest_pkgs(wt)))
`

let wt: string
beforeEach(() => { wt = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-track-vpkgs-')) })
afterEach(() => { fs.rmSync(wt, { recursive: true, force: true }) })

const put = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true })
  fs.writeFileSync(path.join(wt, rel), body)
}

describe('_track_vitest_pkgs ignores the T-1417 guard configs', () => {
  it('returns only the real package', () => {
    put('vitest.config.ts', fs.readFileSync(path.join(CODE, 'vitest.config.ts'), 'utf8'))
    put('packages/vitest.config.ts', fs.readFileSync(path.join(CODE, 'packages', 'vitest.config.ts'), 'utf8'))
    put('packages/core/vitest.config.ts', 'export default {}\n')
    put('packages/core/node_modules/.bin/vitest', '#!/bin/sh\n')
    const out = execFileSync('python3', ['-I', '-c', PY, CLI, wt], { encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(out.trim().split('\n')).toEqual(['packages/core'])
  })

  it('the shipped guard configs carry the marker', () => {
    for (const f of ['vitest.config.ts', path.join('packages', 'vitest.config.ts')]) {
      expect(fs.readFileSync(path.join(CODE, f), 'utf8').split('\n')[0]).toContain('prdt-vitest-guard')
    }
  })
})
