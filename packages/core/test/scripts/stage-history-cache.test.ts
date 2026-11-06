// T-1384 follow-up: stage_history is cached per meta repo head — a second call runs no git,
// a new po-state snapshot (branch moves) invalidates it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

const SCRIPTS = path.resolve(__dirname, '../../scripts')

function git(root: string, args: string[], date: string) {
  execFileSync('git', ['--git-dir', path.join(root, '.prdt/meta.git'), '--work-tree', root, ...args], {
    env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    stdio: 'pipe',
  })
}

describe('stage_history cache', () => {
  it('hits without git, misses after a new snapshot', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-shc-')))
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    execFileSync('git', ['init', '-q', '--separate-git-dir', path.join(root, '.prdt/meta.git'), root], { stdio: 'pipe' })
    fs.rmSync(path.join(root, '.git'), { force: true })
    const snap = (stage: string, date: string) => {
      fs.writeFileSync(path.join(root, '.prdt/po-state.json'), JSON.stringify({ version: 'v9.9', stage }))
      git(root, ['add', '-f', '.prdt/po-state.json'], date)
      git(root, ['commit', '-q', '-m', stage], date)
    }
    snap('define', '2026-10-27T12:00:00')
    const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(SCRIPTS)})
import prdt_lanes as p
root = ${JSON.stringify(root)}
a = p.stage_history(root)
def boom(*x, **k): raise AssertionError("git ran on a cache hit")
p._git = boom
p.subprocess.run = boom
b = p.stage_history(root)
print(json.dumps([a, b]))`
    const out = JSON.parse(execFileSync('python3', ['-I', '-c', py], { encoding: 'utf8' }))
    expect(out[0]).toEqual([['2026-10-27', 'define']])
    expect(out[1]).toEqual(out[0])
    snap('build', '2026-10-28T12:00:00')
    const py2 = py.split('def boom')[0] + 'print(json.dumps(a))'
    expect(JSON.parse(execFileSync('python3', ['-I', '-c', py2], { encoding: 'utf8' })))
      .toEqual([['2026-10-27', 'define'], ['2026-10-28', 'build']])
  })
})
