/**
 * `prdt register` + the doctor `register` check — T-586, black-box over the REAL CLI.
 *
 * Contract under test:
 * - `--list` is the resolver's `--list` (prdt-audience-inject.sh): four keys, the
 *   domain, the default, body presence. The CLI carries no domain of its own.
 * - `set` writes ONLY a legal value (exit 1 otherwise, file untouched); the file
 *   is key=value per line and other lines are kept; `unset` removes one key.
 * - `show` reports the resolved values, the governs union, the binding line and
 *   every ignored line by number.
 * - `prdt doctor` names an illegal register line (unknown key · out-of-domain ·
 *   off-shape address) and a body over the byte budget / without `governs:`;
 *   stays silent on a legal file (positive control first — silence is not proof).
 *
 * `PRDT_HOME` points the machine layer at a sandbox; the real ~/.prdt is never
 * read or written. `PRDT_DISCIPLINE` pins the bodies to this checkout.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')

function has(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0
}
const READY = has('python3') && has('jq')

let sandbox: string
let prdtHome: string
let projectDir: string
let disciplineDir: string

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-register-cli-'))
  prdtHome = path.join(sandbox, 'prdt')
  projectDir = path.join(sandbox, 'proj')
  disciplineDir = path.join(sandbox, 'discipline')
  fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1', current_task: null }))
  // a private copy of the discipline tree so a body can be mutated for the doctor cases
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
})
afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

function prdt(...args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PRDT_HOME: prdtHome, PRDT_DISCIPLINE: disciplineDir },
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const regFile = () => path.join(prdtHome, 'register')

describe.skipIf(!READY)('prdt register --list — the domain comes from the resolver', () => {
  test('four keys, domains, defaults, body presence (json)', () => {
    const r = prdt('register', '--list', '--json')
    expect(r.status, r.err).toBe(0)
    const dom = JSON.parse(r.out)
    expect(dom.file).toBe(regFile())
    expect(dom.keys.map((k: any) => k.key)).toEqual(['audience', 'form', 'structure', 'address'])
    expect(dom.keys[1]).toMatchObject({ domain: ['prose', 'outline'], default: 'prose', bodies: { outline: true, prose: false } })
  })
  test('human table names every key', () => {
    const r = prdt('register', '--list')
    expect(r.status).toBe(0)
    for (const k of ['audience', 'form', 'structure', 'address']) expect(r.out).toMatch(new RegExp(`^${k}\\b`, 'm'))
  })
})

describe.skipIf(!READY)('prdt register set / unset / show', () => {
  test('set writes key=value; a second key is appended; the resolver reads it back', () => {
    expect(prdt('register', 'set', 'form', 'outline').status).toBe(0)
    expect(prdt('register', 'set', 'address', '션님').status).toBe(0)
    expect(fs.readFileSync(regFile(), 'utf8')).toBe('form=outline\naddress=션님\n')
    const show = JSON.parse(prdt('register', 'show', '--json').out)
    expect(show.values).toEqual({ audience: 'planner', form: 'outline', structure: 'default', address: '션님' })
    expect(show.binding).toBe('form=outline · address="션님"')
    expect(show.warnings).toEqual([])
  })
  test('set replaces an existing key in place and keeps comments', () => {
    fs.writeFileSync(regFile(), '# taste\nform=outline\n')
    expect(prdt('register', 'set', 'form', 'prose').status).toBe(0)
    expect(fs.readFileSync(regFile(), 'utf8')).toBe('# taste\nform=prose\n')
  })
  for (const [label, args, msg] of [
    ['out-of-domain enum', ['form', 'fancy'], /outside its domain \(prose \| outline\)/],
    ['unknown key', ['lang', 'ko'], /unknown key `lang`/],
    ['address over 32 bytes', ['address', 'a'.repeat(33)], /address fails its shape/],
    ['address with a control character', ['address', 'ab\tcd'], /address fails its shape/],
  ] as const) {
    test(`set refuses ${label}: exit 1, file untouched`, () => {
      fs.writeFileSync(regFile(), 'form=outline\n')
      const r = prdt('register', 'set', ...args)
      expect(r.status).toBe(1)
      expect(r.err).toMatch(msg)
      expect(fs.readFileSync(regFile(), 'utf8')).toBe('form=outline\n')
    })
  }
  test('unset removes exactly that key', () => {
    fs.writeFileSync(regFile(), 'form=outline\naddress=션님\n')
    expect(prdt('register', 'unset', 'address').status).toBe(0)
    expect(fs.readFileSync(regFile(), 'utf8')).toBe('form=outline\n')
  })
  test('show on a machine with no file: every default, silent binding, no warning', () => {
    const r = prdt('register', 'show')
    expect(r.status).toBe(0)
    expect(r.out).toContain('absent — every default')
    expect(r.out).toContain('(silent — every key at its default)')
    expect(r.out).not.toContain('warning')
  })
  test('show names an ignored line by number', () => {
    fs.writeFileSync(regFile(), 'form=outline\nlang=ko\n')
    expect(prdt('register', 'show').out).toContain('warning    L2: unknown key `lang` — ignored')
  })
})

describe.skipIf(!READY)('prdt doctor — register check', () => {
  const doctor = () => prdt('doctor').out
  const registerLines = (out: string) => out.split('\n').filter((l) => /register:/.test(l))

  test('positive control: an illegal file is named line by line', () => {
    fs.writeFileSync(regFile(), 'form=fancy\nlang=ko\naddress=' + 'a'.repeat(40) + '\nno equals\n')
    const lines = registerLines(doctor())
    expect(lines.some((l) => /L1: form= is outside its domain/.test(l))).toBe(true)
    expect(lines.some((l) => /L2: unknown key `lang`/.test(l))).toBe(true)
    expect(lines.some((l) => /L3: address= fails its shape/.test(l))).toBe(true)
    expect(lines.some((l) => /L4: not a key=value line/.test(l))).toBe(true)
  })
  test('a body over the byte budget, and one without governs:, are named', () => {
    const body = path.join(disciplineDir, 'register', 'form-outline.md')
    fs.writeFileSync(body, '---\nkey: form\nvalue: outline\n---\n' + 'x'.repeat(2100) + '\n')
    const lines = registerLines(doctor())
    expect(lines.some((l) => /body form-outline\.md is 2,\d{3} B \(budget 2,000 B\)/.test(l))).toBe(true)
    expect(lines.some((l) => /body form-outline\.md lacks frontmatter governs/.test(l))).toBe(true)
  })
  test('a body with an off-vocabulary governs: value is named (T-586 item 2, resolver body_warnings)', () => {
    fs.writeFileSync(regFile(), 'form=outline\n')
    const body = path.join(disciplineDir, 'register', 'form-outline.md')
    fs.writeFileSync(body, '---\nkey: form\nvalue: outline\ngoverns: [bogus-surface]\n---\nbody text\n')
    const lines = registerLines(doctor())
    expect(lines.some((l) => /register: body form-outline\.md names governs=`bogus-surface`, outside the closed surface vocabulary/.test(l))).toBe(true)
  })
  test('a legal file + the shipped bodies → no register warning at all', () => {
    fs.writeFileSync(regFile(), '# taste\naudience=planner\nform=outline\nstructure=planner-tables\naddress=션님\n')
    expect(registerLines(doctor())).toEqual([])
  })
  test('no register file at all → no register warning (a default machine is not a finding)', () => {
    expect(registerLines(doctor())).toEqual([])
  })
})
