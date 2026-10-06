/**
 * T-995 — a ticket link always resolves.
 *  1. the viewer generator writes `at/T-NNN.html` for EVERY ticket it carries
 *     and prunes pages of removed tickets (other jump pages stay);
 *  2. `prdt tickets new` regenerates the viewer and prints the paste-ready
 *     viewer link itself;
 *  3. a docs/**\/*.md written from a Bash call (python/sed) schedules the regen.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const VIEWER_CLI = path.join(CORE_ROOT, '..', 'viewer', 'cli.mjs')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-auto-open.sh')

function has(bin: string): boolean {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); return true } catch { return false }
}
const depsReady = fs.existsSync(path.join(CORE_ROOT, '..', 'viewer', 'node_modules', 'marked'))
const RUN = has('node') && has('python3') && depsReady

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t995-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'backlog'), { recursive: true })
  writeTicket(root, 'v1.0', 'T-001')
  writeTicket(root, 'backlog', 'T-002')
  return root
}
function writeTicket(root: string, bucket: string, id: string) {
  fs.writeFileSync(path.join(root, 'docs', 'tickets', bucket, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nx\n`)
}
const outOf = (root: string) => path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
function genViewer(root: string) {
  execFileSync('node', [VIEWER_CLI, '--repo-root', root, '--out', outOf(root)], { stdio: 'pipe', timeout: subprocessTimeout('cli') })
}

describe.skipIf(!RUN)('T-995 — at/T-NNN.html for every ticket', () => {
  test('generation writes a page per ticket (current + backlog) and prunes stale ticket pages only', () => {
    const root = project()
    const at = path.join(root, '.prdt', 'scratch', 'viewer', 'at')
    fs.mkdirSync(at, { recursive: true })
    fs.writeFileSync(path.join(at, 'T-999.html'), 'stale')
    fs.writeFileSync(path.join(at, 'fact--x.html'), 'other jump page')
    genViewer(root)
    expect(fs.readdirSync(at).sort()).toEqual(['T-001.html', 'T-002.html', 'fact--x.html'])
    expect(fs.readFileSync(path.join(at, 'T-002.html'), 'utf8')).toContain('../viewer.html#T-002')
    // a ticket removed → its page goes on the next generation
    fs.rmSync(path.join(root, 'docs', 'tickets', 'backlog', 'T-002.md'))
    genViewer(root)
    expect(fs.readdirSync(at).sort()).toEqual(['T-001.html', 'fact--x.html'])
  })

  test('a symlinked at/ is never followed: nothing written or removed through it', () => {
    const root = project()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t995-out-'))
    fs.writeFileSync(path.join(outside, 'T-999.html'), 'keep me')
    fs.mkdirSync(path.join(root, '.prdt', 'scratch', 'viewer'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, '.prdt', 'scratch', 'viewer', 'at'))
    genViewer(root)
    expect(fs.readdirSync(outside)).toEqual(['T-999.html'])
  })

  test('`prdt tickets new` prints the viewer link and its at/ page exists', () => {
    const root = project()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t995-home-'))
    genViewer(root) // an existing viewer is what `tickets new` keeps fresh
    const out = execFileSync('python3', [PRDT_CLI, 'tickets', 'new', '--type', 'impl', '--slug', 'fresh-one'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PRDT_HOME: home, PRDT_META_BACKUP: '0' }, timeout: subprocessTimeout('cli'),
    }).trim()
    const m = out.match(/^\[(T-\d+)\]\(file:\/\/(.+)\)$/)
    expect(m).toBeTruthy()
    expect(m![2]).toBe(path.join(root, '.prdt', 'scratch', 'viewer', 'at', `${m![1]}.html`))
    expect(fs.existsSync(m![2])).toBe(true)
    expect(fs.readFileSync(outOf(root), 'utf8')).toContain(m![1])
  })
})

describe.skipIf(!(has('jq') && has('python3')))('T-995 — Bash-written docs trigger the regen', () => {
  function sandbox() {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t995-hook-')))
    const stub = path.join(dir, 'prdt-stub')
    fs.writeFileSync(stub, ['#!/usr/bin/env bash',
      'if [ "${1:-}" = "viewer" ] && [ "${2:-}" = "--no-open" ]; then printf x >> "$PRDT_TEST_COUNT"; touch "$(pwd)/.prdt/scratch/viewer/viewer.html"; exit 0; fi',
      'exit 2'].join('\n') + '\n', { mode: 0o755 })
    const root = path.join(dir, 'proj')
    fs.mkdirSync(path.join(root, '.prdt', 'scratch', 'viewer'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{"schema_version":1,"stage":"build","version":"v1.0","current_task":null}')
    fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
    const viewer = path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')
    fs.writeFileSync(viewer, '<!doctype html>')
    const old = new Date(Date.now() - 60_000)
    fs.utimesSync(viewer, old, old)
    const count = path.join(dir, 'count')
    const prdtHome = path.join(dir, 'home'); fs.mkdirSync(prdtHome)
    const env = { ...process.env, PRDT_HOME: prdtHome, PRDT_BIN: stub, PRDT_TEST_COUNT: count } as NodeJS.ProcessEnv
    delete env.PRDT_GUI_SESSION
    return { root, count, env }
  }
  const bashEvent = (cwd: string, command: string, agent?: string) =>
    JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd, tool_input: { command }, tool_response: { stdout: '' }, ...(agent ? { agent_type: agent } : {}) })
  const waitCount = async (f: string) => {
    for (let i = 0; i < 400; i++) { if (fs.existsSync(f)) return true; await new Promise((r) => setTimeout(r, 50)) }
    return false
  }

  test('a shell-written ticket (newer than viewer.html) regenerates, for the PO and for a worker', async () => {
    for (const agent of [undefined, 'prdt-developer']) {
      const s = sandbox()
      fs.writeFileSync(path.join(s.root, 'docs', 'tickets', 'v1.0', 'T-001.md'), '---\nid: T-001\n---\n')
      execFileSync('bash', [HOOK], { input: bashEvent(s.root, "python3 -c \"open('docs/tickets/v1.0/T-001.md','w')\"", agent), env: s.env })
      expect(await waitCount(s.count), String(agent)).toBe(true)
    }
  })

  test('a read-only docs/ command (nothing newer than viewer.html) schedules nothing', async () => {
    const s = sandbox()
    fs.writeFileSync(path.join(s.root, 'docs', 'tickets', 'v1.0', 'T-001.md'), '---\nid: T-001\n---\n')
    const old = new Date(Date.now() - 120_000)
    fs.utimesSync(path.join(s.root, 'docs', 'tickets', 'v1.0', 'T-001.md'), old, old)
    execFileSync('bash', [HOOK], { input: bashEvent(s.root, 'cat docs/tickets/v1.0/T-001.md'), env: s.env })
    await new Promise((r) => setTimeout(r, 400))
    expect(fs.existsSync(s.count)).toBe(false)
  })
})
