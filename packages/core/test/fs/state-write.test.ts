/**
 * state-write.test.ts — T-848 S4: stateWriteFileSync refuses a link planted at
 * every path component, keeps an existing file's mode, and never leaves a temp
 * file or touches the victim.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { stateWriteFileSync, StateWriteRefused } from '../../src/fs/state-write'

let root: string
let outside: string
const VICTIM = 'precious\n'
const PAST = new Date('2020-01-02T03:04:05Z')
const MODES: Array<{ name: string; opts: Parameters<typeof stateWriteFileSync>[3] }> = [
  { name: 'atomic', opts: {} },
  { name: 'in-place', opts: { atomic: false } },
  { name: 'append', opts: { append: true } },
]

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-root-')))
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-out-')))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

function victim(name = 'victim'): string {
  const v = path.join(outside, name)
  fs.writeFileSync(v, VICTIM)
  fs.utimesSync(v, PAST, PAST)
  return v
}
function expectVictimIntact(v: string): void {
  expect(fs.readFileSync(v, 'utf-8')).toBe(VICTIM)
  expect(fs.statSync(v).mtimeMs).toBe(PAST.getTime())
}
function expectNoStrays(): void {
  expect(fs.readdirSync(outside).sort()).toEqual(['victim'].filter((n) => fs.existsSync(path.join(outside, n))).sort())
}

describe.each(MODES)('$name', ({ opts }) => {
  test('file path is a link to a victim → refused, victim byte-identical', () => {
    const v = victim()
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.symlinkSync(v, path.join(root, '.prdt', 'f.json'))
    expect(() => stateWriteFileSync(root, '.prdt/f.json', 'X', opts)).toThrow(StateWriteRefused)
    expectVictimIntact(v)
    expect(fs.lstatSync(path.join(root, '.prdt', 'f.json')).isSymbolicLink()).toBe(true)
    expect(fs.readdirSync(path.join(root, '.prdt'))).toEqual(['f.json'])
  })

  test('file path is a dangling link → refused, nothing created at the target', () => {
    const missing = path.join(outside, 'missing')
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.symlinkSync(missing, path.join(root, '.prdt', 'f.json'))
    expect(() => stateWriteFileSync(root, '.prdt/f.json', 'X', opts)).toThrow(StateWriteRefused)
    expect(fs.existsSync(missing)).toBe(false)
    expect(fs.readdirSync(outside)).toEqual([])
  })

  test('first component (.prdt) is a link to a directory → refused, nothing written outside', () => {
    const v = victim()
    fs.symlinkSync(outside, path.join(root, '.prdt'))
    expect(() => stateWriteFileSync(root, '.prdt/victim', 'X', opts)).toThrow(StateWriteRefused)
    expectVictimIntact(v)
    expectNoStrays()
  })

  test('middle component is a link → refused', () => {
    const v = victim()
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.symlinkSync(outside, path.join(root, '.prdt', 'meta.git'))
    expect(() => stateWriteFileSync(root, '.prdt/meta.git/info/victim', 'X', opts)).toThrow(StateWriteRefused)
    expectVictimIntact(v)
    expectNoStrays()
  })

  test('parent is a dangling link to a missing directory → refused, nothing created there', () => {
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.symlinkSync(path.join(outside, 'nodir'), path.join(root, '.prdt', 'sub'))
    expect(() => stateWriteFileSync(root, '.prdt/sub/f', 'X', opts)).toThrow(StateWriteRefused)
    expect(fs.readdirSync(outside)).toEqual([])
  })

  test('hard link to a victim → refused', () => {
    const v = victim()
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.linkSync(v, path.join(root, '.prdt', 'f'))
    expect(() => stateWriteFileSync(root, '.prdt/f', 'X', opts)).toThrow(StateWriteRefused)
    expectVictimIntact(v)
  })

  test('target is a directory → refused', () => {
    fs.mkdirSync(path.join(root, '.prdt', 'f'), { recursive: true })
    expect(() => stateWriteFileSync(root, '.prdt/f', 'X', opts)).toThrow(StateWriteRefused)
  })

  test('path escaping the root → refused', () => {
    expect(() => stateWriteFileSync(root, path.join(outside, 'x'), 'X', opts)).toThrow(StateWriteRefused)
    expect(() => stateWriteFileSync(root, '../x', 'X', opts)).toThrow(StateWriteRefused)
    expect(fs.readdirSync(outside)).toEqual([])
  })

  test('happy path: creates missing dirs, writes, leaves no temp file', () => {
    stateWriteFileSync(root, '.prdt/a/b.txt', 'hello\n', opts)
    expect(fs.readFileSync(path.join(root, '.prdt/a/b.txt'), 'utf-8')).toBe('hello\n')
    expect(fs.readdirSync(path.join(root, '.prdt/a'))).toEqual(['b.txt'])
  })

  test('existing file mode is kept (0600 and 0755), whatever the umask', () => {
    const old = process.umask(0o077)
    try {
      for (const mode of [0o600, 0o755]) {
        const f = path.join(root, `m${mode.toString(8)}`)
        fs.writeFileSync(f, 'old\n')
        fs.chmodSync(f, mode)
        stateWriteFileSync(root, f, 'new\n', { ...opts, mode: 0o644 })
        expect(fs.statSync(f).mode & 0o7777).toBe(mode)
        expect(fs.readFileSync(f, 'utf-8')).toBe(opts?.append ? 'old\nnew\n' : 'new\n')
      }
    } finally {
      process.umask(old)
    }
  })

  test('no explicit mode: a NEW file is 0666 & ~umask (umask 077 → 0600, 022 → 0644)', () => {
    for (const [um, want] of [[0o077, 0o600], [0o022, 0o644]] as const) {
      const old = process.umask(um)
      try {
        const f = `d${um.toString(8)}/n.txt`
        stateWriteFileSync(root, f, 'x', opts)
        expect(fs.statSync(path.join(root, f)).mode & 0o7777).toBe(want)
      } finally {
        process.umask(old)
      }
    }
  })

  test('no explicit mode: a NEW file is 0666 & ~umask (umask 077 → 0600, 022 → 0644)', () => {
    for (const [um, want] of [[0o077, 0o600], [0o022, 0o644]] as const) {
      const old = process.umask(um)
      try {
        const f = `d${um.toString(8)}/n.txt`
        stateWriteFileSync(root, f, 'x', opts)
        expect(fs.statSync(path.join(root, f)).mode & 0o7777).toBe(want)
      } finally {
        process.umask(old)
      }
    }
  })

  test('a new file gets opts.mode (umask applies)', () => {
    const old = process.umask(0o022)
    try {
      stateWriteFileSync(root, 'n.txt', 'x', { ...opts, mode: 0o600 })
      expect(fs.statSync(path.join(root, 'n.txt')).mode & 0o7777).toBe(0o600)
    } finally {
      process.umask(old)
    }
  })

  test('root itself may be a link (only components below it are checked)', () => {
    const linkRoot = path.join(outside, 'rootlink')
    fs.symlinkSync(root, linkRoot)
    stateWriteFileSync(linkRoot, '.prdt/f', 'ok', opts)
    expect(fs.readFileSync(path.join(root, '.prdt/f'), 'utf-8')).toBe('ok')
  })
})

test('read-only (0444) existing file: in-place refuses, atomic replaces and keeps 0444', () => {
  const f = path.join(root, 'ro')
  fs.writeFileSync(f, 'old\n')
  fs.chmodSync(f, 0o444)
  stateWriteFileSync(root, f, 'new\n')
  expect(fs.readFileSync(f, 'utf-8')).toBe('new\n')
  expect(fs.statSync(f).mode & 0o7777).toBe(0o444)
  if (process.getuid?.() !== 0) {
    expect(() => stateWriteFileSync(root, f, 'again\n', { atomic: false })).toThrow(StateWriteRefused)
    expect(fs.readFileSync(f, 'utf-8')).toBe('new\n')
  }
})

test('append appends to an existing regular file', () => {
  stateWriteFileSync(root, 'l.jsonl', 'a\n', { append: true })
  stateWriteFileSync(root, 'l.jsonl', 'b\n', { append: true })
  expect(fs.readFileSync(path.join(root, 'l.jsonl'), 'utf-8')).toBe('a\nb\n')
})

// T-1076: fs.writeSync may return fewer bytes than asked; every mode loops until all are out.
describe('short writes', () => {
  for (const m of MODES) {
    test(`${m.name}: a writeSync that writes at most 3 bytes per call still lands every byte`, () => {
      const real = fs.writeSync.bind(fs) as (...a: unknown[]) => number
      const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, buf: Uint8Array, off: number, len: number, pos: number | null) =>
        real(fd, buf, off, Math.min(len, 3), pos)) as typeof fs.writeSync)
      try {
        const f = path.join(root, '.prdt', 'state.txt')
        fs.mkdirSync(path.dirname(f), { recursive: true })
        fs.writeFileSync(f, m.opts?.append ? 'head\n' : 'an older, longer body that must not survive\n')
        const body = 'short-write body — 한글 포함\n'.repeat(5)
        stateWriteFileSync(root, f, body, m.opts)
        expect(fs.readFileSync(f, 'utf8')).toBe(m.opts?.append ? 'head\n' + body : body)
        expect(spy.mock.calls.length).toBeGreaterThan(1)
      } finally {
        spy.mockRestore()
      }
    })
  }
})
