/**
 * prdt-per-product-readers.test.ts — T-1214: in a multi-product project every
 * PRD / lane / gate reader computes for the product it was asked about, never
 * for po-state `current_task.product`.
 *
 * Fixture (product layout, ntf-pm's shape): `docs/_shared/` + first product
 * `home` (`## v0.1`, lane H) + added product `arch` (`## v0.2`, lane R) —
 * each product's PRD carries plain `## v…` headings in its own folder.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'prdt')
const PYTHON3 = (() => { try { return execFileSync('which', ['python3'], { encoding: 'utf8' }).trim() || null } catch { return null } })()

let tmpRoot: string
let root: string
let prdtHome: string

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' }
}

const LOADER = `
import importlib.util, importlib.machinery, sys, json
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = Path(sys.argv[2])
st = json.loads((root / ".prdt" / "po-state.json").read_text())
`

function py(body: string): any {
  const r = spawnSync('python3', ['-c', LOADER + body, PRDT_CLI, root], {
    encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env(),
  })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

function write(rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function prd(product: string, version: string, rows: string[]) {
  write(`docs/${product}/prd/PRD.md`, ['# PRD', '', `## ${version} — round`, '', '### 합격선', '',
    '| 항목 | 문언 |', '|:--|:--|', ...rows, '', '#### alpha — item', '', 'a', ''].join('\n'))
}

function ticket(product: string, version: string, id: string, gate?: string, status = 'open') {
  write(`docs/${product}/tickets/${version}/${id}.md`, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`,
    'type: impl', `status: ${status}`, 'assignee: developer', 'created: 2026-10-15', '---', '', '## problem', '',
    gate ? `Produces \`${gate}\`.` : 'x', ''].join('\n'))
}

function state(current?: string) {
  const st: any = { stage: 'build', version: 'v0.1', products: { arch: { stage: 'build', version: 'v0.2' } } }
  if (current) st.current_task = { product: current }
  write('.prdt/po-state.json', JSON.stringify(st))
}

const GATE_H = 'docs/home/artifacts/v0.1/h.md'
const GATE_R = 'docs/arch/artifacts/v0.2/r.md'
const rowH = `| **합격선** | **레인 H · \`${GATE_H}\` 가 있다** |`
const rowR = `| **합격선** | **레인 R · \`${GATE_R}\` 가 있다** |`

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-perprod-'))
  root = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(prdtHome, { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', '_shared', 'wiki'), { recursive: true })
  write('.prdt/config.json', JSON.stringify({ slug: 'home', products: [{ name: 'arch' }] }))
  prd('home', 'v0.1', [rowH])
  prd('arch', 'v0.2', [rowR])
  ticket('home', 'v0.1', 'T-001', GATE_H)
  ticket('arch', 'v0.2', 'T-010', GATE_R)
  ticket('arch', 'v0.2', 'T-011')
  state()
})

afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

const LANES = `print(json.dumps({k: [l["name"] for l in m.compute_schedule(root, line=k if k != "home" else None)["lanes"]] for k in ("home", "arch")}))`

describe.skipIf(!PYTHON3)('T-1214 per-product readers', () => {
  test('(a) compute_schedule(line=arch) reads the arch PRD — its lane, not []', () => {
    expect(py(LANES)).toEqual({ home: ['H'], arch: ['R', '자투리'] })
  })

  test('(b) current_task.product = arch does not move the home product\'s lanes', () => {
    state('arch')
    expect(py(LANES)).toEqual({ home: ['H'], arch: ['R', '자투리'] })
    state('home')
    expect(py(LANES)).toEqual({ home: ['H'], arch: ['R', '자투리'] })
  })

  test('(c) prd_layout_warnings compares the home PRD with the home version whatever the current product', () => {
    for (const cur of [undefined, 'home', 'arch']) {
      state(cur)
      expect(py('print(json.dumps(m.prd_layout_warnings(root, st)))')).toEqual([])
    }
  })

  test('the open-section readers (P1 form · prd_item keys) read each product\'s own PRD', () => {
    state('arch')
    const keys = py('print(json.dumps({v: sorted(m._prd_item_keys_for_version(root, st, v)) for v in ("v0.1", "arch/v0.2")}))')
    expect(keys).toEqual({ 'v0.1': ['alpha'], 'arch/v0.2': ['alpha'] })
  })

  test('dispatch lane warning is computed over the dispatched ticket\'s own product lanes', () => {
    state('home')
    const rec = (slug: string) => {
      const ctx = { slug, goal: 'g', change_meta: { files: [], user_facing: false, risk_flags: [], stage: 'build' }, acceptance: 'a', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/arch/prd/PRD.md#v0.2', dispatch_id: 'd-9' }
      const ev = { cwd: root, session_id: 's', tool_use_id: 'toolu_1', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer', prompt: `[ctx] ${JSON.stringify(ctx)}\n\nx` } }
      return execFileSync('python3', [PRDT_CLI, 'schedule', 'record'], {
        cwd: root, encoding: 'utf-8', input: JSON.stringify(ev), env: env(), timeout: subprocessTimeout('cli'),
      })
    }
    expect(rec('s-t-010')).toBe('')                       // a lane-R ticket: in its own product's lane
    const out = rec('s-t-011')                            // arch 자투리 while lane R has next T-010
    expect(out).toMatch(/outside the lanes/)
    expect(out).toMatch(/lane R next T-010/)
    expect(out).not.toMatch(/lane H/)
  })

  test('doctor names an unlinked 합격선 lane; the Ship-entry signal stays off', () => {
    prd('home', 'v0.1', [rowH, '| **합격선** | **레인 Q · 경로 없는 줄** |'])
    ticket('home', 'v0.1', 'T-001', GATE_H, 'done')
    const w = py('print(json.dumps(m._stage_signal_one("build", "v0.1", {"T-001": {"id": "T-001", "version": "v0.1", "status": "done", "created": "2026-10-15"}}, root, None)))')
    expect(w.some((x: string) => /gate met/.test(x))).toBe(false)
    expect(w.some((x: string) => /lane Q/.test(x) && /not linked/.test(x))).toBe(true)
    expect(w.some((x: string) => /lane H/.test(x))).toBe(false)
  })
})
