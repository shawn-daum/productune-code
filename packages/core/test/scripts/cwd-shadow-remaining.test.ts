// T-1195: the remaining embedded-python sites (hooks, prdt-url-scheme.sh, viewer collectLanes)
// run isolated (`python3 -I`), so a same-named module in the cwd (json.py, prdt_lanes.py,
// prdt_safe_fs.py) is never imported. Continues T-1166 (sibling-import-cwd-decoy.test.ts).
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const SCRIPTS = path.join(CORE_ROOT, 'scripts')
const HOOKS = path.join(SCRIPTS, 'hooks')
const COLLECT = path.resolve(CORE_ROOT, '..', 'viewer', 'lib', 'collect.mjs')

let tmp: string
let decoy: string
let marker: string
const marked = () => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '')

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1195-')))
  decoy = path.join(tmp, 'decoy-cwd')
  marker = path.join(tmp, 'MARKER')
  fs.mkdirSync(path.join(decoy, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(decoy, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, current_task: null, stage: 'build', version: 'v0.1' }))
  const body = `open(${JSON.stringify(marker)}, "a").write("RAN\\n")\n`
  for (const m of ['json', 'prdt_lanes', 'prdt_safe_fs']) {
    fs.writeFileSync(path.join(decoy, `${m}.py`), body + (m === 'prdt_lanes' ? 'def lanes_for(*a):\n    return []\n' : ''))
  }
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

function home(): string {
  const h = path.join(tmp, 'home')
  fs.mkdirSync(h, { recursive: true })
  fs.cpSync(path.join(CORE_ROOT, 'discipline'), path.join(h, 'discipline'), { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(h, 'doctrine.md'))
  return h
}

describe('decoy modules in cwd are never executed (T-1195)', () => {
  test('session-start (PRDT_PARTS_PY / quote py)', () => {
    const r = spawnSync('bash', [path.join(HOOKS, 'prdt-session-start.sh'), '--part', '1'], {
      cwd: decoy, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'prdt-developer', cwd: decoy }),
      env: { ...process.env, PRDT_HOME: home(), PRDT_VIEWER_ENSURE: '0' },
    })
    expect(marked()).toBe('')
    expect(r.stdout).toContain('additionalContext')
  })

  test('user-prompt', () => {
    const r = spawnSync('bash', [path.join(HOOKS, 'prdt-user-prompt.sh')], {
      cwd: decoy, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: decoy, prompt: 'hello' }),
      env: { ...process.env, PRDT_HOME: home() },
    })
    expect(marked()).toBe('')
    expect(r.stdout).toContain('build')
  })

  test('viewer collectLanes', async () => {
    const { collectLanes } = await import(COLLECT)
    collectLanes(decoy)
    expect(marked()).toBe('')
  })
})

describe('every embedded python in the listed scripts is isolated (-I)', () => {
  const files = [
    'hooks/prdt-session-start.sh', 'hooks/prdt-worktree-guard.sh', 'hooks/prdt-user-prompt.sh',
    'hooks/prdt-message-display-autolink.sh', 'hooks/prdt-question-check.sh',
    'hooks/prdt-project-overrides-inject.sh', 'hooks/prdt-overrides-inject.sh',
    'hooks/prdt-inbox-inject.sh', 'prdt-url-scheme.sh', 'install.sh', 'uninstall.sh', 'prdt-flip.sh',
  ]
  test.each(files)('%s', (f) => {
    const lines = fs.readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n')
      .filter((l) => /(^|[\s$(|`])python3\s+(-\S+\s+)*(-c|-)(\s|$)/.test(l) && !l.trim().startsWith('#')
        && !/command -v/.test(l) && !l.includes('`'))
    expect(lines.length, f).toBeGreaterThan(0)
    for (const l of lines) expect(l, f).toMatch(/python3 -I /)
  })
})
