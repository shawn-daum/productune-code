/**
 * prdt-version-path-hardening.test.ts — T-1082: a po-state `version` (top level
 * or `lines.<line>.version`) becomes a ticket-dir path only when it is a version
 * id (`v<N>[.<m>[.<p>]]` or `backlog`); doctor names a malformed one. Plus the
 * three small hardenings riding along: whole-match line names, a `prd_item` on
 * an undeclared line is a form error, `bucket_id` keys off the real
 * docs/artifacts root, and the installed version reads a checkout root only
 * from packages/core/scripts.
 *
 * PRDT_HOME is a scratch dir every run (no meta remote → no backup push).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

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

function env(home: string): NodeJS.ProcessEnv {
  return { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' }
}

function cli(root: string, home: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd: root, env: env(home), encoding: 'utf8', timeout: 60_000 })
  return { out: r.stdout, err: r.stderr, code: r.status }
}

const LOADER = `
import importlib.util, importlib.machinery, sys, json
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
`

function py(body: string, args: string[] = [], script = PRDT_CLI, home?: string) {
  const r = spawnSync('python3', ['-c', LOADER + body, script, ...args], {
    encoding: 'utf8', timeout: 60_000, env: home ? env(home) : process.env,
  })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

function findAll(dir: string, name: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...findAll(p, name))
    else if (e.name === name) out.push(p)
  }
  return out
}

/** scratch/<proj>, so `docs/tickets/arc/../../../../escaped` = scratch/escaped. */
function project(st: Record<string, unknown>, lines: unknown[] | undefined = [{ name: 'arc' }]) {
  const scratch = tmp('prdt-t1082-')
  const root = path.join(scratch, 'proj')
  const cfg: Record<string, unknown> = { slug: 'home', surfaces: {} }
  if (lines) cfg.lines = lines
  put(root, '.prdt/config.json', JSON.stringify(cfg, null, 2) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', current_task: null, ...st }, null, 2) + '\n')
  put(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0 — home\n\n#### web — web\n\n- w\n')
  return { scratch, root, home: tmp('prdt-t1082-home-') }
}

describe('po-state version → ticket path (reviewer repro)', () => {
  test('added line `../../../../escaped`: tickets new errors, nothing written anywhere', () => {
    const { scratch, root, home } = project({ version: 'v1.0', lines: { arc: { stage: 'build', version: '../../../../escaped' } } })
    const r = cli(root, home, ['tickets', 'new', '--line', 'arc', '--type', 'impl', '--slug', 'probe'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('`lines.arc.version` \'../../../../escaped\' is not a version id')
    expect(r.err).toContain('no ticket written')
    expect(fs.existsSync(path.join(scratch, 'escaped'))).toBe(false)
    expect(findAll(scratch, 'T-001.md')).toEqual([])
  }, T)

  test('home line `../../../escaped-home`: tickets new errors, nothing written anywhere', () => {
    const { scratch, root, home } = project({ version: '../../../escaped-home' })
    const r = cli(root, home, ['tickets', 'new', '--type', 'impl', '--slug', 'probe'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('`version` \'../../../escaped-home\' is not a version id')
    // docs/tickets/../../../escaped-home resolves to scratch/escaped-home
    expect(fs.existsSync(path.join(scratch, 'escaped-home'))).toBe(false)
    expect(findAll(scratch, 'T-001.md')).toEqual([])
  }, T)

  test('a well-formed id still lands: v1.0.1 home, arc/v2 line, empty → backlog', () => {
    const { root, home } = project({ version: 'v1.0.1', lines: { arc: { stage: 'build', version: 'v2' } } })
    expect(cli(root, home, ['tickets', 'new', '--type', 'impl', '--slug', 'a']).code).toBe(0)
    expect(cli(root, home, ['tickets', 'new', '--line', 'arc', '--type', 'impl', '--slug', 'b']).code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.0.1/T-001.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/tickets/arc/v2/T-002.md'))).toBe(true)
    const p = py(`root = Path(sys.argv[2]); print(json.dumps([m.current_version_id(root), m.current_version_id(root, "arc")]))`,
      [root])
    expect(p).toEqual(['v1.0.1', 'arc/v2'])
    const e = project({ version: '' })
    expect(py(`print(json.dumps(m.current_version_id(Path(sys.argv[2]))))`, [e.root])).toBe('backlog')
  }, T)

  test('line_state drops a malformed line version; a version with a trailing newline is not an id', () => {
    const p = py(`print(json.dumps([
      m.line_state({"lines": {"arc": {"stage": "build", "version": "../x"}}}, "arc")[1],
      m.line_state({"lines": {"arc": {"stage": "build", "version": "v3.1"}}}, "arc")[1],
      m.is_version_path_id("v1.2\\n"), m.is_version_path_id("backlog"), m.is_version_path_id("v1.2.3.4")]))`)
    expect(p).toEqual([null, 'arc/v3.1', false, true, false])
  }, T)
})

describe('doctor: po_state_warnings names a malformed version', () => {
  test('top-level and products.<name>.version, one line each; well-formed ids are silent', () => {
    const p = py(`print(json.dumps([
      m.po_state_warnings({"schema_version": 1, "stage": "build", "current_task": None,
        "version": "../../../escaped-home",
        "lines": {"arc": {"stage": "build", "version": "../../../../escaped"}}}),
      m.po_state_warnings({"schema_version": 1, "stage": "build", "current_task": None, "version": "backlog",
        "lines": {"arc": {"stage": "build", "version": "v1.2.3"}}}),
      m.po_state_warnings({"schema_version": 1, "stage": "build", "current_task": None, "version": "v1\\nstate: forged"})]))`)
    expect(p[0]).toEqual([
      "state: version '../../../escaped-home' is not a version id (v<N>[.<m>[.<p>]] or backlog)",
      "state: products.arc.version '../../../../escaped' is not a version id (v<N>[.<m>[.<p>]] or backlog)",
    ])
    expect(p[1]).toEqual([])
    expect(p[2]).toHaveLength(1)
    expect(p[2][0]).not.toContain('\n')
  }, T)
})

describe('line names: whole match, printed through safe_label', () => {
  test('`arc\\n` is not a line; its config warning stays on one line', () => {
    const { root } = project({ version: 'v1.0' }, [{ name: 'arc\n' }, { name: 'ok' }])
    const p = py(`root = Path(sys.argv[2])
print(json.dumps([m.project_line_names(root), m.line_config_warnings(root),
  m.split_line_id("arc\\n/v1"), bool(m.LINE_NAME_RE.match("backlog\\n"))]))`, [root])
    expect(p[0]).toEqual(['ok'])
    expect(p[1]).toHaveLength(1)
    expect(p[1][0]).toContain('is not a legal product name')
    expect(p[1][0]).not.toContain('\n')
    expect(p[2]).toEqual([null, 'arc\n/v1'])
    expect(p[3]).toBe(false)
  }, T)
})

describe('prd_item on an undeclared line', () => {
  test('single-line project: `foo/v1.0#web` is a form error, not unresolved', () => {
    const { root } = project({ version: 'v1.0' }, undefined)
    put(root, 'docs/tickets/v1.0/T-001.md', '---\nid: T-001\nslug: a\ntype: impl\nstatus: open\nassignee: developer\nprd_item: foo/v1.0#web\ncreated: 2026-10-11\n---\n')
    put(root, 'docs/tickets/v1.0/T-002.md', '---\nid: T-002\nslug: b\ntype: impl\nstatus: open\nassignee: developer\nprd_item: v1.0#nope\ncreated: 2026-10-11\n---\n')
    const p = py(`root = Path(sys.argv[2])
st = json.loads((root / ".prdt" / "po-state.json").read_text())
print(json.dumps(m.prd_item_edge_warnings(root, st, [
  {"id": "T-001", "path": "docs/tickets/v1.0/T-001.md"}, {"id": "T-002", "path": "docs/tickets/v1.0/T-002.md"}])))`, [root])
    expect(p).toEqual([
      "ticket: T-001 prd_item: 'foo/v1.0#web' is not `<version>#<key>` form",
      'ticket: T-002 prd_item: v1.0#nope does not resolve to an item of v1.0',
    ])
  }, T)
})

describe('bucket_id compares the real artifacts root', () => {
  test('a line named `artifacts` keeps its prefix; home buckets stay bare', () => {
    const p = py(`print(json.dumps([m.bucket_id(Path("/p/docs/artifacts/v1.0")),
      m.bucket_id(Path("/p/docs/artifacts/artifacts/v1.0")), m.bucket_id(Path("/p/docs/artifacts/arc/v2"))]))`)
    expect(p).toEqual(['v1.0', 'artifacts/v1.0', 'arc/v2'])
  }, T)
})

describe('installed_prdt_version reads a checkout root only from packages/core/scripts', () => {
  test('a copy elsewhere ignores parents[3]; a copy at packages/core/scripts reads it', () => {
    const repo = tmp('prdt-t1082-repo-')
    const home = tmp('prdt-t1082-home-')
    put(repo, 'docs/RELEASES.md', '# Releases\n\n## v9.9.9 — probe (2026-10-11)\n\n- x\n')
    const src = fs.readFileSync(PRDT_CLI, 'utf8')
    put(repo, 'a/b/c/prdt', src)
    put(repo, 'packages/core/scripts/prdt', src)
    const body = `print(json.dumps(m.installed_prdt_version()))`
    expect(py(body, [], path.join(repo, 'a/b/c/prdt'), home)).toBe(null)
    expect(py(body, [], path.join(repo, 'packages/core/scripts/prdt'), home)).toBe('v9.9.9')
  }, T)
})

describe('QA round 2: Unicode digits are not version digits', () => {
  test('tickets new refuses v١ / v１ (home) and v٢ (line); nothing written', () => {
    for (const [st, args, field] of [
      [{ version: 'v١' }, [], '`version` \'v١\''],
      [{ version: 'v１' }, [], '`version` \'v１\''],
      [{ version: 'v1.0', lines: { arc: { stage: 'build', version: 'v٢' } } }, ['--line', 'arc'], '`lines.arc.version` \'v٢\''],
    ] as const) {
      const { scratch, root, home } = project(st as Record<string, unknown>)
      const r = cli(root, home, ['tickets', 'new', ...args, '--type', 'impl', '--slug', 'probe'])
      expect(r.code).not.toBe(0)
      expect(r.err).toContain(`${field} is not a version id`)
      expect(findAll(scratch, 'T-001.md')).toEqual([])
    }
  }, T)

  test('canon, bucket names, prd_item and doctor all reject non-ASCII digits', () => {
    const p = py(`print(json.dumps([m._version_id_canon("v١"), m._version_id_canon("v1"), m.is_artifact_bucket_name("v１"),
      bool(m.PRD_ITEM_RE.match("v١#k")), bool(m.PRD_VERSION_FILE_RE.match("v١.md")),
      m.po_state_warnings({"schema_version": 1, "stage": "build", "current_task": None, "version": "v١",
        "lines": {"arc": {"stage": "build", "version": "v٢"}}})]))`)
    expect(p.slice(0, 5)).toEqual([null, [1], false, false, false])
    expect(p[5]).toEqual([
      "state: version 'v١' is not a version id (v<N>[.<m>[.<p>]] or backlog)",
      "state: products.arc.version 'v٢' is not a version id (v<N>[.<m>[.<p>]] or backlog)",
    ])
  }, T)
})

describe('QA round 2: schedule report builds its dir from a version id only', () => {
  test('`v١` and `../x` refused with nothing written; `v1\\n` and `  v1.13` are stripped (PO decision)', () => {
    for (const bad of ['v١', '../x', 'backlog']) {
      const { root, home } = project({ version: bad }, undefined)
      const r = cli(root, home, ['schedule', 'report'])
      expect(r.code).not.toBe(0)
      expect(r.err).toContain('is not a version id')
      expect(fs.existsSync(path.join(root, 'docs/artifacts'))).toBe(false)
    }
    const { root, home } = project({ version: 'v1\n' }, undefined)
    const r = cli(root, home, ['schedule', 'report'])
    expect(r.code).toBe(0)
    expect(r.out.split('\n')[0]).toBe('schedule report: docs/artifacts/v1/schedule-observation.md — 0 dispatch row(s) for v1')
    const w = project({ version: '  v1.13' }, undefined)
    expect(cli(w.root, w.home, ['schedule', 'report']).code).toBe(0)
    expect(fs.readdirSync(path.join(w.root, 'docs/artifacts'))).toEqual(['v1.13'])
    const a = project({ version: 'v1.0' }, undefined)
    const ra = cli(a.root, a.home, ['schedule', 'report', '--version', 'v١'])
    expect(ra.code).not.toBe(0)
    expect(ra.err).toContain("--version 'v١' is not a version id")
  }, T)
})

describe('QA round 2: doctor stage signal never prints a raw version', () => {
  test('a forged version produces no `verdict=` line; the state warning names it safely', () => {
    const forged = '../../escaped\nverdict=clean'
    const p = py(`print(json.dumps(m.stage_signal_warnings({"stage": "build", "version": sys.argv[2]}, {})))`, [forged])
    expect(p).toEqual([])
    const { root, home } = project({ version: forged }, undefined)
    const r = cli(root, home, ['doctor'])
    expect(r.out.split('\n').some((l) => l.startsWith('verdict='))).toBe(false)
    expect(r.out).not.toContain('escaped\n')
    expect(r.out).toContain("state: version '<a name imitating doctor's own output>' is not a version id")
  }, T)
})
