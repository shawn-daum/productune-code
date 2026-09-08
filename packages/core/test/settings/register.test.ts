/**
 * register.ts — T-586 the register object (audience · form · structure · address).
 *
 * Contract under test:
 * - Storage is USER-level `<home>/.prdt/register`, key=value per line — the
 *   file prdt-audience-inject.sh resolves. The legacy `audience-mode` file is
 *   never read or written.
 * - Read never throws and never surfaces an illegal value: missing file, empty
 *   file, unknown key, out-of-domain value, off-shape address → defaults.
 * - Write is per key and preserves the rest of the file (comments included),
 *   refuses an illegal value, removes on null, is atomic (tmp + rename).
 * - The domain copy here is PINNED to the hook's `--list` — the hook is the SoT.
 * - audience-mode.ts is a compatibility wrapper over the same file.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import {
  readRegister, writeRegisterKey, parseRegister, isLegalAddress,
  REGISTER_DOMAIN, REGISTER_DEFAULTS, REGISTER_KEYS, ADDRESS_MAX_BYTES,
} from '../../src/settings/register'
import { getAudienceMode, setAudienceMode, DEFAULT_AUDIENCE_MODE } from '../../src/settings/audience-mode'
import { casesFor } from '../fixtures/address-legality-cases'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-audience-inject.sh')
function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

let home: string
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'register-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })
const file = () => path.join(home, '.prdt', 'register')
const write = (s: string) => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), s) }

describe('read — defaults, never an illegal value', () => {
  test('missing file → every default', () => {
    expect(readRegister(home)).toEqual(REGISTER_DEFAULTS)
    expect(REGISTER_DEFAULTS).toEqual({ audience: 'planner', form: 'prose', structure: 'default', address: null })
  })
  test('empty file → every default', () => { write(''); expect(readRegister(home)).toEqual(REGISTER_DEFAULTS) })
  test('out-of-domain, unknown key, malformed line, off-shape address → defaults + one warning each', () => {
    const { values, warnings } = parseRegister('form=fancy\nlang=ko\nnope\naddress=' + 'a'.repeat(33) + '\nstructure=planner-tables\n')
    expect(values).toEqual({ ...REGISTER_DEFAULTS, structure: 'planner-tables' })
    expect(warnings.map((w) => w.split(':')[0])).toEqual(['L1', 'L2', 'L3', 'L4'])
  })
  test('comments, whitespace, CRLF and last-wins duplicates', () => {
    const { values, warnings } = parseRegister('# taste\r\n audience = developer \r\naudience=planner\r\nform=outline\r\naddress=션님\r\n')
    expect(values).toEqual({ audience: 'planner', form: 'outline', structure: 'default', address: '션님' })
    expect(warnings).toEqual([])
  })
  test('the legacy ~/.prdt/audience-mode is ignored', () => {
    fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(home, '.prdt', 'audience-mode'), 'developer\n')
    expect(readRegister(home).audience).toBe('planner')
    expect(getAudienceMode(home)).toBe('planner')
  })
})

describe('address shape (mirrors address_ok in the hook)', () => {
  test.each([
    ['션님', true], ['Shawn', true], ['a'.repeat(32), true],
    ['', false], ['a'.repeat(33), false], ['ab\tcd', false], ['ab\ncd', false], ['ab\rcd', false],
    ['ab\u0085cd', false], ['ab\u2028cd', false], ['ab\u2029cd', false], ['ab\u000bcd', false],
    ['가'.repeat(11), false], // 33 bytes: the cap is BYTES, not characters
    // T-586 QA defect 1 — forges the binding/session line's own grammar (d46076f, 07ec491)
    ['ab"cd', false], ['ab·cd', false], ['ab[prdt cd', false], ['[prdt', false],
  ])('%j → %s', (v, ok) => { expect(isLegalAddress(v as string)).toBe(ok) })
  test('ADDRESS_MAX_BYTES is 32', () => expect(ADDRESS_MAX_BYTES).toBe(32))
})

describe('parseRegister address parity — shared fixture (T-586 register-ts gate, trim included)', () => {
  // isLegalAddress itself does not trim (see above) — parity with the resolver's
  // ASCII-only trim belongs at THIS layer, parseRegister, which trims before
  // judging. One shared case list drives all three gates (fixtures/address-legality-cases.ts);
  // a probe restricted to this gate (or excluded from it) is marked in the fixture.
  for (const c of casesFor('register-ts')) {
    test(`address=${c.label} → ${c.legal ? 'legal' : 'illegal'}`, () => {
      const { values, warnings } = parseRegister(`address=${c.value}\n`)
      if (c.legal) {
        expect(values.address).toBe(c.finalValue ?? c.value)
        expect(warnings.some((w) => w.includes('address='))).toBe(false)
      } else {
        expect(values.address).toBeNull()
        expect(warnings.some((w) => w.includes('address= fails its shape'))).toBe(true)
      }
    })
  }
})

describe('write — one key at a time, the rest of the file kept', () => {
  test('creates ~/.prdt and the file; key=value + newline; no tmp left', () => {
    writeRegisterKey('form', 'outline', home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('form=outline\n')
    expect(fs.existsSync(file() + '.tmp')).toBe(false)
    expect((fs.statSync(file()).mode & 0o777)).toBe(0o600)
  })
  test('replaces the key in place, drops later duplicates, keeps comments and other keys', () => {
    write('# taste\naudience=developer\nform=prose\naudience=planner\n')
    writeRegisterKey('audience', 'developer', home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('# taste\naudience=developer\nform=prose\n')
    writeRegisterKey('address', '션님', home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('# taste\naudience=developer\nform=prose\naddress=션님\n')
  })
  test('null / empty removes the key', () => {
    write('form=outline\naddress=션님\n')
    writeRegisterKey('address', null, home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('form=outline\n')
    writeRegisterKey('form', '', home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('')
  })
  test('refuses an illegal value — the file is untouched', () => {
    write('form=outline\n')
    expect(() => writeRegisterKey('form', 'fancy', home)).toThrow(/outside its domain/)
    expect(() => writeRegisterKey('address', 'a'.repeat(33), home)).toThrow(/fails its shape/)
    expect(() => writeRegisterKey('lang' as any, 'ko', home)).toThrow(/unknown key/)
    expect(fs.readFileSync(file(), 'utf8')).toBe('form=outline\n')
  })
  test('round-trips every legal enum value through read', () => {
    for (const key of ['audience', 'form', 'structure'] as const) {
      for (const v of REGISTER_DOMAIN[key]) {
        writeRegisterKey(key, v, home)
        expect(readRegister(home)[key]).toBe(v)
      }
    }
  })
})

describe('audience-mode.ts is a compatibility wrapper over the register file', () => {
  test('setAudienceMode writes audience= into ~/.prdt/register and never touches audience-mode', () => {
    setAudienceMode('developer', home)
    expect(fs.readFileSync(file(), 'utf8')).toBe('audience=developer\n')
    expect(fs.existsSync(path.join(home, '.prdt', 'audience-mode'))).toBe(false)
    expect(getAudienceMode(home)).toBe('developer')
    expect(DEFAULT_AUDIENCE_MODE).toBe('planner')
  })
})

describe('the hook is the SoT — the TS domain copy is pinned to `--list`', () => {
  test.skipIf(!hasJq())('keys, domains and defaults match prdt-audience-inject.sh --list exactly', () => {
    const list = JSON.parse(execFileSync('bash', [HOOK, '--list'], { input: '', encoding: 'utf8', env: { ...process.env, PRDT_HOME: path.join(home, '.prdt') } }))
    expect(list.keys.map((k: any) => k.key)).toEqual([...REGISTER_KEYS])
    for (const k of list.keys) {
      if (k.kind === 'enum') {
        expect(k.domain).toEqual([...REGISTER_DOMAIN[k.key as keyof typeof REGISTER_DOMAIN]])
        expect(k.default).toBe(REGISTER_DEFAULTS[k.key as keyof typeof REGISTER_DEFAULTS])
      } else {
        expect(k.key).toBe('address')
        expect(k.max_bytes).toBe(ADDRESS_MAX_BYTES)
        expect(k.default).toBeNull()
      }
    }
  })

  test.skipIf(!hasJq())('what this module writes, the hook resolves identically (including an address)', () => {
    writeRegisterKey('form', 'outline', home)
    writeRegisterKey('structure', 'planner-tables', home)
    writeRegisterKey('address', '션님', home)
    const r = JSON.parse(execFileSync('bash', [HOOK, '--resolve'], { input: '', encoding: 'utf8', env: { ...process.env, PRDT_HOME: path.join(home, '.prdt') } }))
    expect(r.values).toEqual(readRegister(home))
    expect(r.warnings).toEqual([])
  })
})
