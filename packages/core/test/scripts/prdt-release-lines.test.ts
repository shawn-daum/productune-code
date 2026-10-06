/**
 * prdt-release-lines.test.ts — T-960 (T-946 = B · T-951 = A): one project,
 * several release lines. The home line keeps today's ids and paths; an added
 * line (`.prdt/config.json` `lines`) prefixes `<line>/` to its version id.
 *
 * Two fixtures: a multi-line project (home `shop` + added `android`, plus the
 * illegal names `v2` / `backlog`) and a single-line one, which must show none
 * of the line additions (release-lines.md §9: byte-identical to before).
 *
 * Function-level checks import the real CLI as a module; schedule / tickets
 * new / resource run the real CLI. PRDT_HOME is a scratch dir every run.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const T = 120_000

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

function put(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

function ticket(root: string, dir: string, id: string, extra: string[] = [], status = 'open') {
  put(root, `docs/tickets/${dir}/${id}.md`, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, 'type: impl',
    `status: ${status}`, 'assignee: developer', ...extra, 'created: 2026-10-06', '---', '',
    '## problem', '', '- x', '', '## acceptance', '', '- x', ''].join('\n'))
}

function makeProject(multi: boolean): string {
  const root = tmp(multi ? 'prdt-lines-multi-' : 'prdt-lines-single-')
  const cfg: Record<string, unknown> = { slug: 'shop', surfaces: {} }
  const st: Record<string, unknown> = {
    schema_version: 1, stage: 'build', version: 'v1.0',
    current_task: { ticket_id: multi ? 'T-002' : 'T-001', slug: 's', assignee: 'developer' },
  }
  if (multi) {
    cfg.lines = [{ name: 'android', code: { dir: '../android' } }, { name: 'v2' }, { name: 'backlog' }]
    st.lines = { android: { stage: 'build', version: 'v2.1' } }
  }
  put(root, '.prdt/config.json', JSON.stringify(cfg, null, 2) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify(st, null, 2) + '\n')
  ticket(root, 'v1.0', 'T-001', ['prd_item: v1.0#web'])
  let prd = '# PRD\n\n## v1.0 — home\n\n### What\n\n#### web — web\n\n- w\n'
  put(root, 'docs/artifacts/v1.0/a.md', '# a\n')
  if (multi) {
    ticket(root, 'android/v2.1', 'T-002', ['prd_item: android/v2.1#login'])
    ticket(root, 'android/v1.9', 'T-004', [], 'done')
    prd += '\n## android v2.1 — app\n\n### What\n\n#### login — login\n\n- l\n\n## android v2.0 — old\n\n- o\n'
    put(root, 'docs/artifacts/android/v2.1/b.md', '# b\n')
  }
  put(root, 'docs/prd/PRD.md', prd)
  return root
}

const PY = `
import importlib.util, importlib.machinery, sys, json
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = Path(sys.argv[2])
st = json.loads((root / ".prdt" / "po-state.json").read_text())
print(json.dumps({
  "versions": {r["id"]: r["version"] for r, _p, _x in m.scan_tickets(root)},
  "cfg": m.line_config_warnings(root),
  "layout": m.prd_line_layout_warnings(root, st),
  "state": m.po_state_warnings(st),
  "buckets": [m.bucket_id(b) for b in m.artifact_buckets(root)],
  "declares": m.project_declares_lines(root),
}))
`

function env(home: string): NodeJS.ProcessEnv {
  return { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' }
}

function probe(root: string) {
  const r = spawnSync('python3', ['-c', PY, PRDT_CLI, String(root)], { encoding: 'utf8', timeout: 60_000 })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

function cli(root: string, home: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd: root, env: env(home), encoding: 'utf8', timeout: 60_000 })
  return { out: r.stdout, err: r.stderr, code: r.status }
}

describe('multi-line project', () => {
  let root: string
  let home: string
  let p: any
  beforeAll(() => {
    root = makeProject(true)
    home = tmp('prdt-lines-home-')
    p = probe(root)
  }, T)

  test('scan_tickets: added-line tickets carry `<line>/<version>`, home tickets unprefixed', () => {
    expect(p.versions).toEqual({ 'T-001': 'v1.0', 'T-002': 'android/v2.1', 'T-004': 'android/v1.9' })
  })

  test('line_config_warnings names the illegal line names v2 and backlog', () => {
    expect(p.cfg).toHaveLength(2)
    expect(p.cfg[0]).toContain('`v2` is not a legal line name')
    expect(p.cfg[1]).toContain('`backlog` is not a legal line name')
  })

  test('prd_line_layout_warnings: a closed added-line section in PRD.md and a ticket dir with no closed file', () => {
    expect(p.layout.some((w: string) => w.includes('closed section `## android v2.0`')
      && w.includes('docs/prd/versions/android/v2.0.md'))).toBe(true)
    expect(p.layout.some((w: string) => w.includes('docs/tickets/android/v1.9/ has no docs/prd/versions/android/v1.9.md'))).toBe(true)
    expect(p.layout.some((w: string) => w.includes('`## android v2.1`'))).toBe(false)
    expect(p.layout).toHaveLength(2)
  })

  test('po-state `lines` is an accepted additive key; a bad line stage is named', () => {
    expect(p.state).toEqual([])
    const r = spawnSync('python3', ['-c', `
import importlib.util, importlib.machinery, sys, json
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
print(json.dumps(m.po_state_warnings({"schema_version":1,"stage":"build","version":"v1.0","current_task":None,
  "lines":{"android":{"stage":"nope","version":"v2.1","x":1}}})))
`, PRDT_CLI], { encoding: 'utf8', timeout: 60_000 })
    const w = JSON.parse(r.stdout)
    expect(w.some((x: string) => x.includes("lines.android.stage 'nope'"))).toBe(true)
    expect(w.some((x: string) => x.includes('lines.android has unexpected keys'))).toBe(true)
  })

  test('artifact buckets: home `<version>`, added line `<line>/<version>`', () => {
    expect(p.buckets).toEqual(['v1.0', 'android/v2.1'])
  })

  test('schedule: every line, home first; --line and --json carry the line', () => {
    const text = cli(root, home, ['schedule'])
    expect(text.code).toBe(0)
    const heads = text.out.split('\n').filter((l) => l.startsWith('schedule '))
    expect(heads).toEqual([
      'schedule v1.0 — 1 open ticket(s) in the graph',
      'schedule android/v2.1 — 1 open ticket(s) in the graph',
    ])
    const home_ = JSON.parse(cli(root, home, ['schedule', '--json']).out)
    expect(home_.version).toBe('v1.0')
    expect(home_.line).toBe('shop')
    const and = JSON.parse(cli(root, home, ['schedule', '--line', 'android', '--json']).out)
    expect(and.version).toBe('android/v2.1')
    expect(and.line).toBe('android')
    expect(and.rows.map((r: any) => [r.id, r.prd_order])).toEqual([['T-002', 0]])
    expect(cli(root, home, ['schedule', '--line', 'ios']).code).not.toBe(0)
  }, T)

  test('tickets new --line lands in that line\'s open version dir', () => {
    const r = cli(root, home, ['tickets', 'new', '--type', 'impl', '--slug', 'zz', '--line', 'android'])
    expect(r.code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/android/v2.1/T-005.md'))).toBe(true)
  }, T)

  test('resource up: the marker carries the current ticket\'s line; ls shows it', () => {
    const r = cli(root, home, ['resource', 'up', 'emu', '--dispatch', 'd-1'])
    expect(r.code).toBe(0)
    const marker = JSON.parse(fs.readFileSync(path.join(home, 'run/resources/emu/d-1.json'), 'utf8'))
    expect(marker.line).toBe('android')
    expect(marker.project).toBe('shop')
    expect(cli(root, home, ['resource', 'ls']).out).toContain('project=android')
  }, T)
})

describe('single-line project — none of the line additions appear', () => {
  let root: string
  let home: string
  let p: any
  beforeAll(() => {
    root = makeProject(false)
    home = tmp('prdt-lines-home1-')
    p = probe(root)
  }, T)

  test('module view: plain ids, no line warnings, no line buckets', () => {
    expect(p.versions).toEqual({ 'T-001': 'v1.0' })
    expect(p.cfg).toEqual([])
    expect(p.layout).toEqual([])
    expect(p.state).toEqual([])
    expect(p.buckets).toEqual(['v1.0'])
    expect(p.declares).toBe(false)
  })

  test('schedule: one block, --json has no `line` key', () => {
    const text = cli(root, home, ['schedule'])
    expect(text.out.split('\n').filter((l) => l.startsWith('schedule '))).toEqual(['schedule v1.0 — 1 open ticket(s) in the graph'])
    const s = JSON.parse(cli(root, home, ['schedule', '--json']).out)
    expect('line' in s).toBe(false)
    expect(s.version).toBe('v1.0')
  }, T)

  test('resource marker keeps today\'s four keys', () => {
    expect(cli(root, home, ['resource', 'up', 'emu', '--dispatch', 'd-1']).code).toBe(0)
    const marker = JSON.parse(fs.readFileSync(path.join(home, 'run/resources/emu/d-1.json'), 'utf8'))
    expect(Object.keys(marker).sort()).toEqual(['dispatch', 'project', 'resource', 'since'])
  }, T)
})
