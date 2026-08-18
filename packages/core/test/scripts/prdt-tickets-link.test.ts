/**
 * prdt-tickets-link.test.ts — T-451 `prdt tickets --link`, black-box over the
 * REAL `prdt` CLI (mirrors prdt-doctor-build-entry.test.ts).
 *
 * Root cause (T-451): a ticket id in a PO reply reached the user as plain text
 * because `docs/tickets/<version>/T-NNN.md` is NOT derivable from the id —
 * <version> may be the current version, an older one, or `backlog/`, and
 * promotion `git mv`s the file between those dirs. A PO composing the path by
 * hand guesses, and a guess is a dead link.
 *
 * `--link` resolves ids through the derived index, which is rebuilt from the
 * filesystem on every invocation — so a ticket that moved dirs resolves to
 * where it is NOW, not where it was.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function writeTicket(version: string, id: string) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, 'type: impl',
    'status: open', 'assignee: developer', 'created: 2026-08-14', '---',
    '', '## Request', 'fixture', '', '## Acceptance', '1. fixture', '', '## Outcome', '',
  ].join('\n'))
  return path.join(dir, `${id}.md`)
}

/** The CLI resolves its root with Path.resolve() — /var vs /private/var on macOS. */
function realProjectDir(): string {
  return fs.realpathSync(projectDir)
}

/** Parses `[T-NNN](file:///abs/path)` lines into a map; non-link lines land under `raw`. */
function parseLinks(out: string): { links: Record<string, string>; lines: string[] } {
  const lines = out.trim().split('\n').filter(Boolean)
  const links: Record<string, string> = {}
  for (const l of lines) {
    const m = l.match(/^\[(T-\d+)\]\(file:\/\/(.+)\)$/)
    if (m) links[m[1]] = m[2]
  }
  return { links, lines }
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-tickets-link-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt tickets --link (T-451)', () => {
  test('resolves current version dir, an older version dir and backlog/ — one openable abs path each', () => {
    const res = runInit()
    writeTicket(res.version, 'T-901')
    writeTicket('v0.1', 'T-902')
    writeTicket('backlog', 'T-903')

    const { links, lines } = parseLinks(runPrdt(['tickets', '--link', 'T-901', 'T-902', 'T-903']))
    expect(lines).toHaveLength(3)

    expect(links['T-901']).toBe(path.join(realProjectDir(), 'docs', 'tickets', res.version, 'T-901.md'))
    expect(links['T-902']).toBe(path.join(realProjectDir(), 'docs', 'tickets', 'v0.1', 'T-902.md'))
    expect(links['T-903']).toBe(path.join(realProjectDir(), 'docs', 'tickets', 'backlog', 'T-903.md'))

    // "opening it lands on the right file" — every emitted target exists and is that ticket.
    for (const [id, p] of Object.entries(links)) {
      expect(path.isAbsolute(p)).toBe(true)
      expect(fs.existsSync(p)).toBe(true)
      expect(fs.readFileSync(p, 'utf-8')).toContain(`id: ${id}`)
    }
  })

  test('one line per requested id, in the order asked', () => {
    const res = runInit()
    writeTicket(res.version, 'T-911')
    writeTicket('backlog', 'T-910')

    const lines = runPrdt(['tickets', '--link', 'T-911', 'T-910']).trim().split('\n')
    expect(lines[0]).toContain('[T-911]')
    expect(lines[1]).toContain('[T-910]')
  })

  test('a ticket promoted between dirs resolves to where it is now', () => {
    const res = runInit()
    const before = writeTicket('backlog', 'T-904')
    expect(parseLinks(runPrdt(['tickets', '--link', 'T-904'])).links['T-904'])
      .toBe(path.join(realProjectDir(), 'docs', 'tickets', 'backlog', 'T-904.md'))

    // backlog promotion = `git mv` into the current version dir (contracts).
    const verDir = path.join(projectDir, 'docs', 'tickets', res.version)
    fs.mkdirSync(verDir, { recursive: true })
    fs.renameSync(before, path.join(verDir, 'T-904.md'))

    expect(parseLinks(runPrdt(['tickets', '--link', 'T-904'])).links['T-904'])
      .toBe(path.join(realProjectDir(), 'docs', 'tickets', res.version, 'T-904.md'))
  })

  test('an unknown id says so instead of emitting a guessed path', () => {
    runInit()
    const out = runPrdt(['tickets', '--link', 'T-999'])
    expect(out).toContain('T-999 (not found)')
    expect(out).not.toContain('file://')
  })

  test('found and unknown ids in one call: each keeps its own line', () => {
    const res = runInit()
    writeTicket(res.version, 'T-905')
    const lines = runPrdt(['tickets', '--link', 'T-905', 'T-999']).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(`docs/tickets/${res.version}/T-905.md`)
    expect(lines[1]).toBe('T-999 (not found)')
  })

  test('--link does not disturb the plain listing output', () => {
    const res = runInit()
    writeTicket(res.version, 'T-906')
    const out = runPrdt(['tickets'])
    expect(out).toContain('T-906')
    expect(out).not.toContain('file://')
  })
})
