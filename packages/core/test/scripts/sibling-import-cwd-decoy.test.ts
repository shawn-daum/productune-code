// T-1166: python started from stdin / -c puts the caller's cwd first on sys.path, so a
// same-named module in the cwd (prdt_safe_fs.py, prdt_lanes.py, even json.py) would be
// imported and run by the statusline / hooks, which run in every project's cwd. Every
// embedded python that imports a sibling module runs isolated (`python3 -I`): sibling
// modules come only from the script's own directory. (The `prdt` launcher: T-1170,
// prdt-launcher.test.ts.)
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const SCRIPTS = path.resolve(__dirname, '..', '..', 'scripts')
const STATUSLINE = path.join(SCRIPTS, 'statusline-prdt.sh')

let tmp: string
let root: string
let decoy: string
let marker: string
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1166-')))
  root = path.join(tmp, 'proj')
  decoy = path.join(tmp, 'decoy-cwd')
  marker = path.join(tmp, 'MARKER')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(decoy)
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, current_task: null, stage: 'build', version: 'v0.1' }))
  const body = `open(${JSON.stringify(marker)}, "a").write("RAN\\n")\n`
  for (const m of ['prdt_safe_fs', 'prdt_lanes', 'json', 'sqlite3']) {
    fs.writeFileSync(path.join(decoy, `${m}.py`), body + (m === 'prdt_lanes' ? 'def lanes_for(*a):\n    return []\n' : ''))
  }
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('sibling imports ignore the cwd (T-1166)', () => {
  test('statusline: decoy modules in cwd are never executed', () => {
    const r = spawnSync('bash', [STATUSLINE], {
      cwd: decoy, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ workspace: { current_dir: root } }),
      env: { ...process.env, PRDT_HOME: path.join(tmp, 'home'), PRDT_LANG: 'en' },
    })
    expect(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '').toBe('')
    expect(r.stdout).toContain('build')
  })

  test('hooks that import prdt_safe_fs start python isolated (-I)', () => {
    for (const f of ['hooks/prdt-post-dispatch.sh', 'hooks/prdt-return-check.sh', 'hooks/prdt-auto-open.sh']) {
      const lines = fs.readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n')
        .filter((l) => /^\s*(\w+=\S+\s+)*python3\s+(-\S+\s+)*(-c|-)(\s|$)/.test(l) && !l.trim().startsWith('#'))
      expect(lines.length, f).toBeGreaterThan(0)
      for (const l of lines) expect(l, f).toMatch(/python3 -I /)
    }
    expect(fs.readFileSync(path.join(SCRIPTS, 'hooks/prdt-auto-open.sh'), 'utf8')).toContain('[sys.executable, "-I", "-c", WORKER')
    {
    }
  })
})
