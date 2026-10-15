/**
 * prdt-message-display-autolink.sh — on-screen ticket-id autolink at
 * MessageDisplay (T-1143; decision T-1140 = a script, not an LLM instruction).
 * Output contract: hookSpecificOutput.displayContent replaces the delta; NO
 * output = the original text (fail open).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-message-display-autolink.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

function makeProject(ids: string[], opts: { prdt?: boolean; viewerFor?: string[] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1143-')))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, 'docs', 'tickets', 'v1.14'), { recursive: true })
  if (opts.prdt !== false) {
    fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), '{}')
  }
  for (const id of ids) fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.14', `${id}.md`), `---\nid: ${id}\n---\n`)
  if (opts.viewerFor) {
    const at = path.join(proj, '.prdt', 'scratch', 'viewer', 'at')
    fs.mkdirSync(at, { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'scratch', 'viewer', 'viewer.html'), '<html>')
    for (const id of opts.viewerFor) fs.writeFileSync(path.join(at, `${id}.html`), '<meta>')
  }
  return { root, proj }
}

const env = (root: string) => ({ ...process.env, HOME: path.join(root, 'home'), PRDT_HOME: path.join(root, 'prdt-home') })

function display(p: { root: string; proj: string }, delta: string, extra: Record<string, unknown> = {}) {
  const ev = { session_id: 's', hook_event_name: 'MessageDisplay', cwd: p.proj, turn_id: 't', message_id: 'm-1', index: 0, final: false, delta, ...extra }
  const t0 = Date.now()
  const out = execFileSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env: env(p.root) })
  const ms = Date.now() - t0
  if (!out) return { text: delta, changed: false, ms }
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.hookEventName).toBe('MessageDisplay')
  return { text: j.hookSpecificOutput.displayContent as string, changed: true, ms }
}

const md = (p: { proj: string }, id: string) => path.join(p.proj, 'docs', 'tickets', 'v1.14', `${id}.md`)
const stub = (p: { proj: string }, id: string) => path.join(p.proj, '.prdt', 'scratch', 'viewer', 'at', `${id}.html`)
const L = (id: string, dest: string) => `[${id}](file://${dest})`

describe('rewrite', () => {
  test('a bare id becomes the viewer link when the jump stub and viewer exist', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    expect(display(p, 'see T-1111 now\n').text).toBe(`see ${L('T-1111', stub(p, 'T-1111'))} now\n`)
  })

  test('without a stub the link is the ticket md file, never a dead viewer path', () => {
    const p = makeProject(['T-1111'])
    expect(display(p, 'see T-1111\n').text).toBe(`see ${L('T-1111', md(p, 'T-1111'))}\n`)
    const q = makeProject(['T-1111'], { viewerFor: [] }) // viewer.html but no stub
    expect(display(q, 'T-1111\n').text).toBe(`${L('T-1111', md(q, 'T-1111'))}\n`)
  })

  test('every mention is linked, a pair run too, a sentence-final id too', () => {
    const p = makeProject(['T-1', 'T-2'], { viewerFor: ['T-1', 'T-2'] })
    expect(display(p, 'T-1/T-2 and T-1.\n').text)
      .toBe(`${L('T-1', stub(p, 'T-1'))}/${L('T-2', stub(p, 'T-2'))} and ${L('T-1', stub(p, 'T-1'))}.\n`)
  })

  test('already linked (label or destination) is left as is', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    const s = `[T-1111](file:///x/at/T-1111.html) and [docs](https://x/T-1111) and [T-1111](https://y)\n`
    expect(display(p, s)).toMatchObject({ changed: false, text: s })
  })

  test('inline code and fenced code are left as is; prose around them is linked', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    const s = 'run `prdt tickets --link T-1111` then T-1111\n```\nT-1111\n```\n~~~sh\nT-1111\n~~~\nT-1111\n'
    const l = L('T-1111', stub(p, 'T-1111'))
    expect(display(p, s).text).toBe(`run \`prdt tickets --link T-1111\` then ${l}\n\`\`\`\nT-1111\n\`\`\`\n~~~sh\nT-1111\n~~~\n${l}\n`)
  })

  test('a path, a file name and a longer token are left as is', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    const s = 'docs/tickets/v1.14/T-1111.md and T-1111.md and xT-1111 and T-11111x and T-1111-foo and ./T-1111\n'
    expect(display(p, s)).toMatchObject({ changed: false, text: s })
  })

  test('an id with no ticket file is left as is, a known one beside it is linked', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    expect(display(p, 'T-9999 vs T-1111\n').text).toBe(`T-9999 vs ${L('T-1111', stub(p, 'T-1111'))}\n`)
    expect(display(p, 'only T-9999\n').changed).toBe(false)
  })

  test('legacy T-PATCH ids link to the md file (the viewer has no page for them)', () => {
    const p = makeProject(['T-PATCH-7'], { viewerFor: [] })
    expect(display(p, 'T-PATCH-7\n').text).toBe(`${L('T-PATCH-7', md(p, 'T-PATCH-7'))}\n`)
  })
})

describe('batches', () => {
  test('the final batch may end mid-line: the id at its very end is linked', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    expect(display(p, 'tail T-1111', { index: 3, final: true }).text).toBe(`tail ${L('T-1111', stub(p, 'T-1111'))}`)
  })

  test('an empty final delta prints nothing', () => {
    const p = makeProject(['T-1111'])
    expect(display(p, '', { index: 2, final: true }).changed).toBe(false)
  })

  test('a fence opened in one batch still masks the next batch of the same message', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    expect(display(p, 'x\n```\nT-1111\n', { index: 0 }).changed).toBe(false)
    expect(display(p, 'T-1111 inside\n', { index: 1 }).changed).toBe(false)
    expect(display(p, '```\nT-1111\n', { index: 2 }).text).toBe(`\`\`\`\n${L('T-1111', stub(p, 'T-1111'))}\n`)
    // another message is not affected by the state of the first
    expect(display(p, 'T-1111\n', { index: 0, message_id: 'm-2' }).changed).toBe(true)
  })

  test('an empty-delta final batch still removes the message state', () => {
    const p = makeProject(['T-1111'])
    display(p, '```\ncode\n', { index: 0 })
    const dir = path.join(p.root, 'prdt-home', 'run', 'message-display')
    expect(fs.readdirSync(dir)).toEqual(['m-1'])
    expect(display(p, '', { index: 1, final: true }).changed).toBe(false)
    expect(fs.existsSync(path.join(dir, 'm-1'))).toBe(false)
  })

  test('the final batch removes the message state', () => {
    const p = makeProject(['T-1111'])
    display(p, '```\n', { index: 0 })
    const dir = path.join(p.root, 'prdt-home', 'run', 'message-display')
    expect(fs.readdirSync(dir)).toEqual(['m-1'])
    display(p, 'code\n', { index: 1, final: true })
    expect(fs.readdirSync(dir)).toEqual([])
  })

  test('a longer fence closes only on an equal-or-longer marker', () => {
    const p = makeProject(['T-1111'], { viewerFor: ['T-1111'] })
    const s = '````\n```\nT-1111\n````\nT-1111\n'
    expect(display(p, s).text).toBe(`\`\`\`\`\n\`\`\`\nT-1111\n\`\`\`\`\n${L('T-1111', stub(p, 'T-1111'))}\n`)
  })
})

describe('fail open', () => {
  test('outside a prdt project → original text', () => {
    const p = makeProject(['T-1111'], { prdt: false })
    expect(display(p, 'T-1111\n')).toMatchObject({ changed: false })
  })

  test('garbage stdin, a wrong event and a missing delta → no output, exit 0', () => {
    const p = makeProject(['T-1111'])
    const run = (input: string) => execFileSync('bash', [HOOK], { input, encoding: 'utf8', env: env(p.root) })
    expect(run('not json T-1')).toBe('')
    expect(run('')).toBe('')
    expect(run(JSON.stringify({ hook_event_name: 'Stop', cwd: p.proj, delta: 'T-1111' }))).toBe('')
    expect(run(JSON.stringify({ hook_event_name: 'MessageDisplay', cwd: p.proj, delta: 7 }))).toBe('')
  })

  test('an unreadable tickets dir → original text', () => {
    const p = makeProject(['T-1111'])
    const dir = path.join(p.proj, 'docs', 'tickets')
    fs.chmodSync(dir, 0o000)
    try {
      expect(display(p, 'T-1111\n').changed).toBe(false)
    } finally {
      fs.chmodSync(dir, 0o755)
    }
  })

  test('a reply with no id and no fence never reaches python (pre-filter)', () => {
    const p = makeProject(['T-1111'])
    expect(display(p, 'plain text\n').changed).toBe(false)
  })
})

describe('shape parity with `prdt tickets --link`', () => {
  test('the hook prints the exact link the CLI prints for the same id', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1143-cli-')))
    roots.push(root)
    const proj = path.join(root, 'proj')
    fs.mkdirSync(path.join(proj, 'docs', 'prd'), { recursive: true })
    const cenv = { ...env(root), PRDT_VIEWER_NO_INSTALL: '1' }
    fs.mkdirSync(cenv.HOME, { recursive: true })
    execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], { cwd: proj, env: cenv, stdio: 'ignore', timeout: 60_000 })
    fs.mkdirSync(path.join(proj, 'docs', 'tickets', 'v1.14'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.14', 'T-1111.md'),
      '---\nid: T-1111\nslug: x\ntype: impl\nstatus: open\nassignee: po\ncreated: 2026-10-15\n---\n\n## problem\n')
    const cli = execFileSync('python3', [PRDT_CLI, 'tickets', '--link', 'T-1111', '--no-open'], { cwd: proj, env: cenv, encoding: 'utf8', timeout: 120_000 }).trim()
    expect(cli).toMatch(/^\[T-1111\]\(file:\/\/.+\)$/)
    const out = display({ root, proj }, 'T-1111\n').text.trim()
    expect(out).toBe(cli)
  })
})

describe('roster', () => {
  test('the manifest registers it on MessageDisplay, matcher-less, once', () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    expect(m.basenames).toContain('prdt-message-display-autolink.sh')
    expect(m.registrations.filter((r: any) => r.event === 'MessageDisplay'))
      .toEqual([{ event: 'MessageDisplay', hooks: ['prdt-message-display-autolink.sh'] }])
  })
})
