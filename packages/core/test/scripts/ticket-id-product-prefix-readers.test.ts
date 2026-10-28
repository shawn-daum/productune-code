/**
 * ticket-id-product-prefix-readers.test.ts — T-1298: every surface that reads a
 * ticket id knows both `T-NNN` and the per-product `T-<PREFIX>-<n>` (PREFIX =
 * upper-case consonants, T-1314), and the legacy `T-P4-120` / `T-PATCH-281`
 * shapes are never cut into a shorter id. One fixture project per test.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const AUTOLINK = path.join(HOOKS, 'prdt-message-display-autolink.sh')
const USER_PROMPT = path.join(HOOKS, 'prdt-user-prompt.sh')
const STATUSLINE = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const T = 60_000

const roots: string[] = []
afterEach(() => { while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true }) })

function project(tickets: Record<string, string>) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1298r-')))
  roots.push(base)
  const proj = path.join(base, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(proj, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.writeFileSync(path.join(proj, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(proj, 'docs', 'prd', 'PRD.md').replace('/prd/PRD.md', '/.keep'), '')
  for (const [id, fm] of Object.entries(tickets)) {
    fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.0', `${id}.md`), `---\nid: ${id}\nslug: s-${id.toLowerCase()}\n${fm}\ncreated: 2026-10-28\n---\n\n## problem\n`)
  }
  const env = { ...process.env, HOME: path.join(base, 'home'), PRDT_HOME: path.join(base, 'prdt-home'), PRDT_LANG: 'en', PRDT_META_BACKUP: '0' }
  return { proj, env }
}

describe('ticket id readers know T-<PREFIX>-<n> (T-1298)', () => {
  test('message autolink links new and old ids; legacy T-P4-/T-PATCH- ids stay whole', () => {
    const { proj, env } = project({ 'T-RCH-001': 'status: open', 'T-12': 'status: open', 'T-PATCH-281': 'status: done', 'T-P4-120': 'status: done' })
    const delta = 'see T-RCH-001, T-12, T-PATCH-281 and T-P4-120 now'
    const ev = { session_id: 's', hook_event_name: 'MessageDisplay', cwd: proj, turn_id: 't', message_id: 'm', index: 0, final: false, delta }
    const out = execFileSync('bash', [AUTOLINK], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env })
    const text = JSON.parse(out).hookSpecificOutput.displayContent as string
    expect(text).toContain('[T-RCH-001](file://')
    expect(text).toContain('[T-12](file://')
    expect(text).toContain('[T-PATCH-281](file://')
    expect(text).not.toMatch(/\[T-P4|\[T-120|\[T-RCH\]/)
  }, T)

  test('user-prompt waiting list carries an open decision with a product-prefixed id', () => {
    const { proj, env } = project({ 'T-RCH-001': 'type: decision\nstatus: open\nassignee: user', 'T-5': 'type: decision\nstatus: open\nassignee: user' })
    const ev = { hook_event_name: 'UserPromptSubmit', cwd: proj, prompt: 'hi', session_id: 's' }
    const out = execFileSync('bash', [USER_PROMPT], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env })
    expect(out).toContain('T-5')
    expect(out).toContain('T-RCH-001')
  }, T)

  test('statusline lists a product-prefixed open decision and does not crash on its sort key', () => {
    const { proj, env } = project({ 'T-RCH-001': 'type: decision\nstatus: open\nassignee: user', 'T-5': 'type: decision\nstatus: open\nassignee: user' })
    const r = spawnSync('bash', [STATUSLINE], { input: JSON.stringify({ workspace: { current_dir: proj } }), encoding: 'utf8', timeout: 20_000, env })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('T-5')
    expect(r.stdout).toContain('T-RCH-001')
  }, T)

  test('schedule keeps a product-prefixed dependency id (never `?`)', () => {
    const { proj, env } = project({ 'T-RCH-001': 'type: impl\nstatus: open\nassignee: developer', 'T-RCH-002': 'type: impl\nstatus: open\nassignee: developer\ndeps: [T-RCH-001]' })
    const r = spawnSync('python3', [PRDT_CLI, 'schedule', '--json'], { cwd: proj, encoding: 'utf8', timeout: 30_000, env })
    expect(r.status, r.stderr).toBe(0)
    const rows = JSON.parse(r.stdout).rows as Array<Record<string, unknown>>
    const row = rows.find((x) => x.id === 'T-RCH-002')
    expect(row, r.stdout).toBeTruthy()
    expect(JSON.stringify(row)).toContain('T-RCH-001')
    expect(JSON.stringify(row)).not.toContain('"?"')
  }, T)
})
