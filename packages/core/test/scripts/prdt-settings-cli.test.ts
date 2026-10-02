/**
 * `prdt settings` — T-750, black-box over the REAL CLI.
 *
 * Contract under test:
 * - no action lists every machine setting (register.* from the resolver,
 *   viewer.auto-open, plan.tier) with its current value and a description.
 * - `set <key> <value>` changes exactly that setting's file; a bad key or an
 *   out-of-domain value is refused (exit 1, file untouched) and the refusal
 *   names the allowed set; `unset` returns a setting to its default.
 * - `prdt register set` and `prdt settings set register.*` write the same file
 *   through the same validation (the alias acceptance line).
 * - every printed line comes from scripts/prdt-messages.json (ko + en, same
 *   key set; no Hangul literal in the command's code).
 *
 * `PRDT_HOME` points at a sandbox; the real ~/.prdt is never read or written.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const CATALOG = path.join(CORE_ROOT, 'scripts', 'prdt-messages.json')
const DISCIPLINE = path.join(CORE_ROOT, 'discipline')

function has(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
}
const READY = has('python3') && has('jq')
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))

let prdtHome: string
beforeEach(() => { prdtHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-settings-cli-')) })
afterEach(() => { fs.rmSync(prdtHome, { recursive: true, force: true }) })

function prdt(lang: 'ko' | 'en', ...args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: prdtHome, encoding: 'utf8', timeout: subprocessTimeout('cli'),
    env: { ...process.env, PRDT_HOME: prdtHome, PRDT_DISCIPLINE: DISCIPLINE, PRDT_LANG: lang },
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const file = (name: string) => path.join(prdtHome, name)
const read = (name: string) => (fs.existsSync(file(name)) ? fs.readFileSync(file(name), 'utf8') : null)
const CAP_KEYS = ['load_ratio', 'mem_free_pct_min', 'inflight_max', 'suites_max', 'vms_max', 'inflight_sonnet_max', 'inflight_opus_max', 'inflight_haiku_max', 'inflight_fable_max', 'inflight_default_max'].map((k) => `dispatch.${k}`)
const KEYS = ['register.audience', 'register.form', 'register.structure', 'register.address', 'viewer.auto-open', 'plan.tier', 'cli.lang', ...CAP_KEYS]

describe('message catalog', () => {
  test('ko and en carry the same keys, none empty', () => {
    expect(Object.keys(catalog.ko).sort()).toEqual(Object.keys(catalog.en).sort())
    for (const lang of ['ko', 'en']) for (const v of Object.values(catalog[lang])) expect(String(v).length).toBeGreaterThan(0)
  })
  test('every setting has a description line', () => {
    for (const k of KEYS) expect(catalog.ko[`settings.list.desc.${k}`]).toBeTruthy()
  })
  test('the auto-open on line is the polished form (T-757)', () => {
    expect(catalog.ko['settings.viewer.auto-open.on']).toBe('이제부터 PO가 건네는 파일이 자동으로 열려요.')
    expect(catalog.en['settings.viewer.auto-open.on']).toBe('From now on, files handed over by PO open automatically.')
  })
  test('the settings code carries no Hangul literal — every line is a catalog lookup', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf8')
    const start = src.indexOf('# ── settings (T-750)')
    const end = src.indexOf('# ── tickets / history')
    expect(start).toBeGreaterThan(0)
    expect(src.slice(start, end)).not.toMatch(/[가-힣]/)
  })
})

describe.skipIf(!READY)('prdt settings — list', () => {
  test('defaults: every key, auto-open on, plan.tier none', () => {
    const r = prdt('en', 'settings', '--json')
    expect(r.status, r.err).toBe(0)
    const rows = JSON.parse(r.out)
    expect(rows.map((e: any) => e.key)).toEqual(KEYS)
    const val = Object.fromEntries(rows.map((e: any) => [e.key, e.value]))
    expect(val['viewer.auto-open']).toBe('on')
    expect(val['plan.tier']).toBeNull()
    expect(val['register.form']).toBe('prose')
    expect(val['cli.lang']).toBe('ko')
  })
  test('cli.lang set/unset and PRDT_LANG override (T-767)', () => {
    expect(prdt('en', 'settings', 'set', 'cli.lang', 'en').status).toBe(0)
    expect(read('cli-lang')).toBe('en\n')
    // no PRDT_LANG in this spawn: cli_lang() falls back to the persisted token
    const r = spawnSync('python3', [PRDT_CLI, 'settings', 'set', 'viewer.auto-open', 'on'], {
      cwd: prdtHome, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      env: { ...process.env, PRDT_HOME: prdtHome, PRDT_DISCIPLINE: DISCIPLINE, PRDT_LANG: '' },
    })
    expect(r.stdout.trim()).toBe('From now on, files handed over by PO open automatically.')
    // PRDT_LANG=ko still wins over the persisted en
    expect(prdt('ko', 'settings', 'set', 'viewer.auto-open', 'off').out.trim())
      .toBe('이제부터 PO가 건네는 파일이 자동으로 열리지 않아요.')
    expect(prdt('en', 'settings', 'unset', 'cli.lang').status).toBe(0)
    expect(read('cli-lang')).toBeNull()
  })
  test('ko table matches the approved screen', () => {
    fs.writeFileSync(file('register'), 'audience=developer\nform=outline\nstructure=planner-tables\n')
    fs.writeFileSync(file('auto-open'), 'off\n')
    fs.writeFileSync(file('plan-tier'), 'team-premium\n')
    const r = prdt('ko', 'settings')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toMatch(/^키\s+값\s+설명$/m)
    expect(r.out).toMatch(/^register\.structure\s+planner-tables\s+PO 말투 구조$/m)
    expect(r.out).toMatch(/^viewer\.auto-open\s+off\s+PO가 건네는 파일 자동 열기$/m)
    expect(r.out).toMatch(/^plan\.tier\s+team-premium\s+요금제$/m)
    expect(r.out.trimEnd().split('\n').pop()).toBe('바꾸려면: prdt settings set <키> <값>')
  })
  test('en table uses the en catalog', () => {
    const r = prdt('en', 'settings')
    expect(r.out).toMatch(/^Key\s+Value\s+Description$/m)
    expect(r.out).toContain('To change: prdt settings set <key> <value>')
  })
})

describe.skipIf(!READY)('prdt settings — set / unset', () => {
  test('viewer.auto-open on prints the polished line and writes the file', () => {
    fs.writeFileSync(file('auto-open'), 'off\n')
    const r = prdt('ko', 'settings', 'set', 'viewer.auto-open', 'on')
    expect(r.status, r.err).toBe(0)
    expect(r.out.trim()).toBe('이제부터 PO가 건네는 파일이 자동으로 열려요.')
    expect(read('auto-open')).toBe('on\n')
    expect(prdt('en', 'settings', 'set', 'viewer.auto-open', 'on').out.trim())
      .toBe('From now on, files handed over by PO open automatically.')
  })
  test('plan.tier set and unset', () => {
    expect(prdt('en', 'settings', 'set', 'plan.tier', 'max-x20').status).toBe(0)
    expect(read('plan-tier')).toBe('max-x20\n')
    expect(prdt('en', 'settings', 'unset', 'plan.tier').status).toBe(0)
    expect(read('plan-tier')).toBeNull()
  })
  test('register.* goes to the register file, other lines kept', () => {
    fs.writeFileSync(file('register'), '# mine\naudience=developer\n')
    const r = prdt('en', 'settings', 'set', 'register.form', 'outline')
    expect(r.status, r.err).toBe(0)
    expect(r.out.trim()).toBe('register.form is now outline.')
    expect(read('register')).toBe('# mine\naudience=developer\nform=outline\n')
    expect(prdt('en', 'settings', 'unset', 'register.audience').status).toBe(0)
    expect(read('register')).toBe('# mine\nform=outline\n')
  })
  test('bad value: refused with the allowed set, file untouched (ko screen line)', () => {
    fs.writeFileSync(file('auto-open'), 'off\n')
    const r = prdt('ko', 'settings', 'set', 'viewer.auto-open', 'maybe')
    expect(r.status).toBe(1)
    expect(r.err.trim()).toBe("prdt settings: 'viewer.auto-open' 는 on 또는 off 만 돼요 — 'maybe' 는 거부했어요. (현재 값 그대로: off)")
    expect(read('auto-open')).toBe('off\n')
    const p = prdt('en', 'settings', 'set', 'plan.tier', 'pro')
    expect(p.status).toBe(1)
    expect(p.err).toContain('max-x20, team-premium or other')
    expect(read('plan-tier')).toBeNull()
    const reg = prdt('en', 'settings', 'set', 'register.audience', 'boss')
    expect(reg.status).toBe(1)
    expect(reg.err).toContain('planner or developer')
    expect(read('register')).toBeNull()
  })
  test('bad address shape and empty value are refused', () => {
    expect(prdt('en', 'settings', 'set', 'register.address', 'a"b').status).toBe(1)
    expect(prdt('en', 'settings', 'set', 'register.address', '  ').status).toBe(1)
    expect(read('register')).toBeNull()
  })
  test('bad key: refused naming every key (en + ko screen lines)', () => {
    const r = prdt('en', 'settings', 'set', 'viewer.auto-pen', 'on')
    expect(r.status).toBe(1)
    expect(r.err.trim()).toBe(`prdt settings: 'viewer.auto-pen' isn't a setting — it must be one of ${KEYS.join(', ')}.`)
    expect(prdt('ko', 'settings', 'set', 'viewer.auto-pen', 'on').err.trim())
      .toBe(`prdt settings: 'viewer.auto-pen' 은 없는 설정이에요 — ${KEYS.join(', ')} 중 하나여야 해요.`)
    expect(fs.readdirSync(prdtHome)).toEqual([])
  })
  test('usage error on missing arguments', () => {
    expect(prdt('en', 'settings', 'set', 'plan.tier').status).toBe(1)
  })
})

describe.skipIf(!READY)('prdt register stays working (alias acceptance)', () => {
  test('register set and settings set write the same file, read back by both', () => {
    expect(prdt('en', 'register', 'set', 'audience', 'developer').status).toBe(0)
    const rows = JSON.parse(prdt('en', 'settings', '--json').out)
    expect(rows.find((e: any) => e.key === 'register.audience').value).toBe('developer')
    expect(prdt('en', 'settings', 'set', 'register.structure', 'planner-tables').status).toBe(0)
    expect(prdt('en', 'register', 'show', '--json').out).toContain('"structure": "planner-tables"')
    // register keeps its own refusal text
    expect(prdt('en', 'register', 'set', 'audience', 'boss').err).toContain('is outside its domain')
  })
})

// T-896: the dispatch gate's cap keys — `dispatch.<key>`, numbers only, written to
// `$PRDT_HOME/dispatch-caps.json` (sandbox PRDT_HOME; the real ~/.prdt is never touched).
describe.skipIf(!READY)('prdt settings — dispatch cap keys (T-896)', () => {
  const caps = () => { const t = read('dispatch-caps.json'); return t === null ? null : JSON.parse(t) }

  test('set writes the number into dispatch-caps.json; unset removes it, the last one removes the file', () => {
    expect(prdt('en', 'settings', 'set', 'dispatch.inflight_max', '7').status).toBe(0)
    expect(caps()).toEqual({ inflight_max: 7 })
    expect(prdt('en', 'settings', 'set', 'dispatch.load_ratio', '2.5').status).toBe(0)
    expect(caps()).toEqual({ inflight_max: 7, load_ratio: 2.5 })
    const list = JSON.parse(prdt('en', 'settings', '--json').out)
    expect(list.find((e: any) => e.key === 'dispatch.inflight_max').value).toBe('7')
    expect(prdt('en', 'settings', 'unset', 'dispatch.inflight_max').status).toBe(0)
    expect(caps()).toEqual({ load_ratio: 2.5 })
    expect(prdt('en', 'settings', 'unset', 'dispatch.load_ratio').status).toBe(0)
    expect(caps()).toBeNull()
  })

  test('every cap key is accepted', () => {
    for (const k of CAP_KEYS) expect(prdt('en', 'settings', 'set', k, '3').status, k).toBe(0)
    expect(Object.keys(caps()).sort()).toEqual(CAP_KEYS.map((k) => k.slice('dispatch.'.length)).sort())
  })

  test('a non-number, a negative, NaN or a memory floor over 100 is refused, file untouched', () => {
    prdt('en', 'settings', 'set', 'dispatch.vms_max', '2')
    for (const [k, v] of [['dispatch.vms_max', 'nine'], ['dispatch.vms_max', '-1'], ['dispatch.vms_max', 'nan'], ['dispatch.vms_max', 'inf'], ['dispatch.mem_free_pct_min', '101']]) {
      const r = prdt('en', 'settings', 'set', k, v)
      expect(r.status, `${k} ${v}`).not.toBe(0)
    }
    expect(caps()).toEqual({ vms_max: 2 })
  })

  test('other keys in the file are kept; an unreadable file is never overwritten', () => {
    fs.writeFileSync(file('dispatch-caps.json'), JSON.stringify({ suites_max: 2, note: 'x' }))
    prdt('en', 'settings', 'set', 'dispatch.vms_max', '4')
    expect(caps()).toEqual({ suites_max: 2, note: 'x', vms_max: 4 })
    fs.writeFileSync(file('dispatch-caps.json'), '{not json')
    const r = prdt('en', 'settings', 'set', 'dispatch.vms_max', '4')
    expect(r.status).not.toBe(0)
    expect(read('dispatch-caps.json')).toBe('{not json')
  })

  test('the gate reads what settings wrote (caps report names the override as source)', () => {
    prdt('en', 'settings', 'set', 'dispatch.inflight_max', '7')
    const r = prdt('en', 'dispatch', 'caps')
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('cap key: inflight_max (dispatch-caps.json)')
    expect(r.out).toContain('/ cap 7')
  })

  test('prdt dispatch caps prints every axis, the cap keys and the remedies', () => {
    const r = prdt('en', 'dispatch', 'caps')
    expect(r.status, r.err).toBe(0)
    for (const w of ['CPU load ratio', 'free memory', 'in-flight dispatches:', 'running full test suites', 'resident VMs', 'tier "sonnet"', 'to free:', 'cap key: suites_max (default)', 'prdt settings set dispatch.<key> <number>'])
      expect(r.out).toContain(w)
  })
})
