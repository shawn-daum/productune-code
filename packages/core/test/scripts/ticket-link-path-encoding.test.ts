/**
 * T-1219 — a ticket link always points at exactly that ticket file.
 *
 * The three link-building sites (message-display autolink hook, `prdt tickets
 * new` file-link line, `prdt tickets --link`) put the path into
 * `[label](file://<path>)` raw: a `)` in a folder name ended the link early and
 * the rest read as a second link. Each now percent-encodes the path
 * (`quote(path, safe='/')`), so `)` `(` `[` `]` space and Hangul never appear raw.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-message-display-autolink.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

const tmps: string[] = []
afterEach(() => {
  while (tmps.length) fs.rmSync(tmps.pop() as string, { recursive: true, force: true })
})

/** What python `quote(p, safe='/')` yields: only A-Za-z0-9 _ . - ~ and / stay. */
const quoted = (p: string) =>
  p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/')

const NASTY = 'x) [y](https:evil.example) 한글'
const TICKET = (id: string) => `---\nid: ${id}\nslug: s\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-10-23\n---\n\n## problem\n\nx\n`

function base(): string {
  const b = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1219-')))
  tmps.push(b)
  return b
}
function env(b: string) {
  return { ...process.env, HOME: path.join(b, 'home'), PRDT_HOME: path.join(b, 'prdt-home') }
}

describe('autolink hook', () => {
  test('ticket in a folder named with ) [ space and Hangul links as one encoded file:// target', () => {
    const b = base()
    const proj = path.join(b, 'proj')
    const dir = path.join(proj, 'docs', 'tickets', NASTY)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), '{}')
    fs.writeFileSync(path.join(dir, 'T-5.md'), TICKET('T-5'))
    const ev = { session_id: 's', hook_event_name: 'MessageDisplay', cwd: proj, turn_id: 't', message_id: 'm', index: 0, final: false, delta: 'see T-5 now' }
    const out = execFileSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env: env(b) })
    const text = JSON.parse(out).hookSpecificOutput.displayContent as string
    expect(text).toBe(`see [T-5](file://${quoted(path.join(dir, 'T-5.md'))}) now`)
  })
})

describe('prdt tickets', () => {
  function project(): string {
    const b = base()
    const proj = path.join(b, 'proj ' + NASTY)
    fs.mkdirSync(path.join(proj, 'docs', 'prd'), { recursive: true })
    const run = (args: string[]) =>
      execFileSync('python3', [PRDT_CLI, ...args], { cwd: proj, encoding: 'utf8', env: env(b), stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    run(['init', '--json', '--slug', 'proj', '--yes'])
    return proj
  }
  const runIn = (proj: string, args: string[]) =>
    execFileSync('python3', [PRDT_CLI, ...args], { cwd: proj, encoding: 'utf8', env: env(path.dirname(proj)), stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })

  function expectSafeLink(line: string) {
    const m = line.trim().match(/^\[([^\]]+)\]\(file:\/\/([^()[\] ]+)\)$/)
    expect(m, line).not.toBeNull()
    expect(fs.existsSync(decodeURIComponent((m as RegExpMatchArray)[2]))).toBe(true)
  }

  test('--link line in a project path with ) [ space and Hangul is one encoded target', () => {
    const proj = project()
    runIn(proj, ['tickets', 'new', '--type', 'impl', '--slug', 'probe'])
    const id = fs.readdirSync(path.join(proj, 'docs', 'tickets'), { recursive: true } as any).map(String).find((f) => /T-\d+\.md$/.test(f)) as string
    const tid = path.basename(id, '.md')
    expectSafeLink(runIn(proj, ['tickets', '--link', tid]))
  })

  test('tickets new prints an encoded link', () => {
    const proj = project()
    const out = runIn(proj, ['tickets', 'new', '--type', 'impl', '--slug', 'probe2'])
    const line = out.trim().split('\n').filter((l) => l.startsWith('[T-')).pop() as string
    expectSafeLink(line)
  })
})
