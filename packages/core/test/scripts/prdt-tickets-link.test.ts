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
import { subprocessTimeout } from '../helpers/subprocess-timeout'

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
    timeout: subprocessTimeout('cli'),
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

/** The `<script id="detail-data" type="application/json">` blob a generated
 *  viewer.html embeds — `anchors[id].g` is the sidebar group (bucket) it
 *  placed a ticket under (render.mjs `buildAnchors`). */
function readViewerAnchors(root: string): Record<string, { s: string; g: string }> {
  const html = fs.readFileSync(path.join(fs.realpathSync(root), '.prdt', 'scratch', 'viewer', 'viewer.html'), 'utf-8')
  const m = html.match(/<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error('viewer.html: no detail-data blob')
  return JSON.parse(m[1]).anchors
}

/**
 * T-746/T-781: `--link`'s target moved from a bare md path to a viewer
 * forwarding page — this asserts the underlying claim T-451 exists to prove
 * either way: `id` resolves to `dir` (its actual `docs/tickets/<dir>/`),
 * never a guessed path.
 *
 * When the viewer could be generated, `dest` is the forwarding page under
 * `.prdt/scratch/viewer/at/<id>.html`; it redirects to `viewer.html#<id>`,
 * and viewer.html's own anchor table (`buildAnchors`, keyed off each
 * ticket's real bucket on disk) says which group — dir — it filed `id`
 * under. When there is no viewer (no node / no generator in this
 * environment), `viewer_links` falls back to the plain md path, which is
 * then the direct, still-legible proof.
 */
function expectResolvesToDir(root: string, id: string, dir: string, dest: string) {
  const jump = path.join(fs.realpathSync(root), '.prdt', 'scratch', 'viewer', 'at', `${id}.html`)
  expect(fs.existsSync(dest)).toBe(true)
  if (dest === jump) {
    expect(fs.readFileSync(dest, 'utf-8')).toContain(`url=../viewer.html#${id}`)
    // T-792: a current-version ticket opens inside Home; any other keeps its ticket-store group.
    const current = JSON.parse(fs.readFileSync(path.join(root, '.prdt', 'po-state.json'), 'utf-8')).version
    expect(readViewerAnchors(root)[id]).toMatchObject(dir === current ? { s: 'home', g: 'ticket' } : { s: 'ticket', g: dir })
  } else {
    expect(dest).toBe(path.join(fs.realpathSync(root), 'docs', 'tickets', dir, `${id}.md`))
    expect(fs.readFileSync(dest, 'utf-8')).toContain(`id: ${id}`)
  }
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

    // "opening it lands on the right file" — every emitted target is an abs
    // path that exists and resolves to that ticket's actual dir (T-746: a
    // viewer forwarding page grouped by bucket, or — no viewer — the md path).
    for (const p of Object.values(links)) expect(path.isAbsolute(p)).toBe(true)
    expectResolvesToDir(projectDir, 'T-901', res.version, links['T-901'])
    expectResolvesToDir(projectDir, 'T-902', 'v0.1', links['T-902'])
    expectResolvesToDir(projectDir, 'T-903', 'backlog', links['T-903'])
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
    expectResolvesToDir(projectDir, 'T-904', 'backlog',
      parseLinks(runPrdt(['tickets', '--link', 'T-904'])).links['T-904'])

    // backlog promotion = `git mv` into the current version dir (contracts).
    const verDir = path.join(projectDir, 'docs', 'tickets', res.version)
    fs.mkdirSync(verDir, { recursive: true })
    fs.renameSync(before, path.join(verDir, 'T-904.md'))

    expectResolvesToDir(projectDir, 'T-904', res.version,
      parseLinks(runPrdt(['tickets', '--link', 'T-904'])).links['T-904'])
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
    const { links, lines } = parseLinks(runPrdt(['tickets', '--link', 'T-905', 'T-999']))
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('T-999 (not found)')
    expectResolvesToDir(projectDir, 'T-905', res.version, links['T-905'])
  })

  test('--link does not disturb the plain listing output', () => {
    const res = runInit()
    writeTicket(res.version, 'T-906')
    const out = runPrdt(['tickets'])
    expect(out).toContain('T-906')
    expect(out).not.toContain('file://')
  })
})
