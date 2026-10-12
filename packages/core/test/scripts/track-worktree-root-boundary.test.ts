/**
 * T-1112 — find_project_root stops at a track worktree (`<project>/tracks/T-NNN`,
 * a linked git worktree), so a prdt run inside it never reaches the enclosing
 * real project's `.prdt/`. Fixtures are temp dirs; nothing touches a real project.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
let tmp: string

function resolve(cwd: string): string | null {
  const script = `
import importlib.util, importlib.machinery, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("prdt_mod", loader))
loader.exec_module(m)
r = m.find_project_root(${JSON.stringify(cwd)})
print(json.dumps(str(r) if r else None))
`
  return JSON.parse(execFileSync('python3', ['-c', script], { encoding: 'utf-8', timeout: subprocessTimeout('cli') }))
}
function marker(dir: string) {
  fs.mkdirSync(path.join(dir, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.prdt', 'po-state.json'), '{}')
}

beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-trackroot-'))) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

test('cwd inside a linked track worktree does not reach the enclosing project', () => {
  const proj = path.join(tmp, 'proj'); marker(proj)
  const wt = path.join(proj, 'tracks', 'T-1')
  fs.mkdirSync(path.join(wt, 'packages', 'core'), { recursive: true })
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /nonexistent\n')
  expect(resolve(path.join(wt, 'packages', 'core'))).toBeNull()
  expect(resolve(wt)).toBeNull()
  expect(resolve(proj)).toBe(proj) // the real project itself is unaffected
})

test('a worktree carrying its own marker resolves to the worktree', () => {
  const proj = path.join(tmp, 'proj'); marker(proj)
  const wt = path.join(proj, 'tracks', 'T-2'); marker(wt)
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /nonexistent\n')
  expect(resolve(path.join(wt, 'sub'))).toBe(wt)
})

test('tracks/T-NNN that is not a linked worktree (.git dir or absent) is not a boundary', () => {
  const proj = path.join(tmp, 'proj'); marker(proj)
  const plain = path.join(proj, 'tracks', 'T-3'); fs.mkdirSync(plain, { recursive: true })
  expect(resolve(plain)).toBe(proj)
  const repo = path.join(proj, 'tracks', 'T-4'); fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
  expect(resolve(repo)).toBe(proj)
})
