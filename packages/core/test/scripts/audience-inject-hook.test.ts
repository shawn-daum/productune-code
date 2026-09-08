/**
 * prdt-audience-inject.sh — the REGISTER resolver (T-326 audience-mode →
 * T-586 register object). The filename is historical; the header says why.
 *
 * Contract under test:
 * - The register file `$PRDT_HOME/register` (key=value per line) is the only
 *   source; `$PRDT_HOME/audience-mode` is never read (one mechanism).
 * - The resolver is the SoT for the domain: `--list` prints it, an out-of-domain
 *   value resolves to the default and never reaches a reader, an illegal
 *   `address` is withheld (never spliced), and the block reports ignored lines
 *   as a COUNT, never as bytes.
 * - Default machine (no file) = today's behavior: the planner body injected for
 *   the PO, nothing else; `--binding` prints NOTHING.
 * - `audience=developer` with nothing else in force → zero stdout (byte-identical
 *   to T-326). Never an empty block.
 * - Bodies are spliced with their `governs:` frontmatter stripped.
 * - PO ONLY; same T-358 channel separation as before.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const AUDIENCE_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-audience-inject.sh')
const SESSION_START_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')
const REGISTER_DIR = path.join(CORE_ROOT, 'discipline', 'register')

// Sentences that exist verbatim in the three bodies — markers for "this body
// reached the context".
const PLANNER_MARKER = 'The person reading you is a product planner, not a developer.'
const OUTLINE_MARKER = 'Every line the user reads is written in outline form, not flowing prose'
const TABLES_MARKER = 'The shape of an explanation follows the KIND of thing being explained.'

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/** Minimal ~/.prdt mirror with the REAL register bodies. */
function makePrdtHome(opts: { register?: string; legacyMode?: string } = {}): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t586-'))
  const disc = path.join(home, 'discipline')
  fs.mkdirSync(path.join(disc, 'po', 'playbooks'), { recursive: true })
  fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(disc, 'contracts.md'), '# contracts\n')
  fs.writeFileSync(path.join(disc, 'po', 'habit.md'), '# po habit\n')
  fs.writeFileSync(path.join(disc, 'po', 'playbooks', '_index.md'), '# menu\n')
  fs.cpSync(REGISTER_DIR, path.join(disc, 'register'), { recursive: true })
  if (opts.register !== undefined) fs.writeFileSync(path.join(home, 'register'), opts.register)
  if (opts.legacyMode !== undefined) fs.writeFileSync(path.join(home, 'audience-mode'), opts.legacyMode)
  return home
}

function runHook(script: string, prdtHome: string, agentType: string): string {
  const event = { hook_event_name: 'SessionStart', agent_type: agentType, cwd: os.tmpdir() }
  return execFileSync('bash', [script], {
    input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, PRDT_HOME: prdtHome },
  })
}
function mode(prdtHome: string, flag: '--list' | '--resolve' | '--binding'): string {
  return execFileSync('bash', [AUDIENCE_HOOK, flag], {
    input: '', encoding: 'utf8', env: { ...process.env, PRDT_HOME: prdtHome },
  })
}
function additionalContextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  return JSON.parse(stdout).hookSpecificOutput.additionalContext as string
}

describe('default machine — no register file — behaves as before T-586', () => {
  test.skipIf(!hasJq())('PO gets the planner body (audience default) and only that body', () => {
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, makePrdtHome(), 'prdt-po'))
    expect(ctx).toContain('[prdt register — PO conversational register]')
    expect(ctx).toContain('audience=planner · form=prose · structure=default · address=none')
    expect(ctx).toContain(PLANNER_MARKER)
    expect(ctx).not.toContain(OUTLINE_MARKER)
    expect(ctx).not.toContain(TABLES_MARKER)
    expect(ctx).not.toContain('Address the user as')
    expect(ctx).not.toContain('were ignored')
  })

  test.skipIf(!hasJq())('--binding prints NOTHING (a default machine pays nothing per turn)', () => {
    expect(mode(makePrdtHome(), '--binding')).toBe('')
  })

  test.skipIf(!hasJq())('the legacy ~/.prdt/audience-mode file is NOT read — one mechanism', () => {
    const home = makePrdtHome({ legacyMode: 'developer\n' })
    expect(additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))).toContain(PLANNER_MARKER)
    expect(JSON.parse(mode(home, '--resolve')).values.audience).toBe('planner')
  })
})

describe('audience=developer with nothing else in force = zero stdout (T-326 byte-identical)', () => {
  test.skipIf(!hasJq())('hook emits nothing at all — never an empty block', () => {
    expect(runHook(AUDIENCE_HOOK, makePrdtHome({ register: 'audience=developer\n' }), 'prdt-po')).toBe('')
  })
  test.skipIf(!hasJq())('--binding still names the non-default key; tail never claims a body arrived (none exists)', () => {
    expect(mode(makePrdtHome({ register: 'audience=developer\n' }), '--binding'))
      .toBe('[prdt register] audience=developer — governs user-chat. No body is in force for these values — this line is the whole cost.\n')
  })
})

describe('the resolver is the single source of truth for what is legal', () => {
  test.skipIf(!hasJq())('--list prints the four keys, their domains, defaults and body presence', () => {
    const list = JSON.parse(mode(makePrdtHome(), '--list'))
    const byKey = Object.fromEntries(list.keys.map((k: any) => [k.key, k]))
    expect(Object.keys(byKey)).toEqual(['audience', 'form', 'structure', 'address'])
    expect(byKey.audience).toMatchObject({ domain: ['planner', 'developer'], default: 'planner', bodies: { planner: true, developer: false } })
    expect(byKey.form).toMatchObject({ domain: ['prose', 'outline'], default: 'prose', bodies: { prose: false, outline: true } })
    expect(byKey.structure).toMatchObject({ domain: ['default', 'planner-tables'], default: 'default', bodies: { default: false, 'planner-tables': true } })
    expect(byKey.address).toMatchObject({ kind: 'text', max_bytes: 32, default: null })
  })

  test.skipIf(!hasJq())('an out-of-domain value resolves to the default and is named in --resolve, never in the block', () => {
    const home = makePrdtHome({ register: 'form=fancy\naudience=expert\n' })
    const r = JSON.parse(mode(home, '--resolve'))
    expect(r.values).toEqual({ audience: 'planner', form: 'prose', structure: 'default', address: null })
    expect(r.warnings).toHaveLength(2)
    expect(r.warnings[0]).toContain('L1: form= is outside its domain (prose|outline)')
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('2 line(s) of the register file were ignored')
    expect(ctx).not.toContain('fancy')
    expect(ctx).not.toContain('expert')
    expect(ctx).toContain(PLANNER_MARKER) // the defaults still apply
  })

  test.skipIf(!hasJq())('unknown keys are ignored (forward-compatible), malformed lines too; last duplicate wins; comments and whitespace tolerated', () => {
    const home = makePrdtHome({ register: '# taste\n  audience = developer \nlang=ko\nnot a line\naudience=planner\n' })
    const r = JSON.parse(mode(home, '--resolve'))
    expect(r.values.audience).toBe('planner')
    expect(r.warnings).toEqual(['L3: unknown key `lang` — ignored', 'L4: not a key=value line — ignored'])
  })

  for (const [label, bad] of [
    ['33 bytes', 'a'.repeat(33)],
    ['a tab (C0 control)', 'ab\tcd'],
    ['NEL (U+0085)', 'ab\u0085cd'],
    ['LS (U+2028)', 'ab\u2028cd'],
    ['invalid UTF-8', Buffer.from([0x61, 0xff, 0x62]).toString('latin1')],
  ] as const) {
    test.skipIf(!hasJq())(`address that fails its shape (${label}) is withheld — never spliced anywhere`, () => {
      const home = makePrdtHome()
      fs.writeFileSync(path.join(home, 'register'), Buffer.concat([Buffer.from('address='), Buffer.from(bad, label === 'invalid UTF-8' ? 'latin1' : 'utf8'), Buffer.from('\n')]))
      const r = JSON.parse(mode(home, '--resolve'))
      expect(r.values.address).toBeNull()
      expect(r.warnings[0]).toContain('address= fails its shape')
      expect(mode(home, '--binding')).toBe('')
      expect(additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))).not.toContain('Address the user as')
    })
  }

  test.skipIf(!hasJq())('a legal address is emitted only inside the fixed sentence; a CRLF line still parses', () => {
    const home = makePrdtHome({ register: 'address=션님\r\n' })
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('Address the user as "션님" wherever the user is named or addressed in user-chat.')
    expect(JSON.parse(mode(home, '--resolve')).values.address).toBe('션님')
  })
})

describe('the operator register — every key in force (this machine after migration)', () => {
  const REG = 'audience=planner\nform=outline\nstructure=planner-tables\naddress=션님\n'

  test.skipIf(!hasJq())('block carries all three bodies, frontmatter stripped, address sentence, no ignored-count', () => {
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, makePrdtHome({ register: REG }), 'prdt-po'))
    expect(ctx).toContain('audience=planner · form=outline · structure=planner-tables · address="션님"')
    expect(ctx).toContain('governs: user-chat')
    for (const m of [PLANNER_MARKER, OUTLINE_MARKER, TABLES_MARKER]) expect(ctx).toContain(m)
    expect(ctx).toContain('----- BEGIN register form=outline (')
    expect(ctx).toContain('----- END register structure=planner-tables -----')
    expect(ctx).not.toMatch(/^governs: \[/m)       // frontmatter never reaches the context
    expect(ctx).not.toMatch(/^key: /m)
    expect(ctx).not.toContain('were ignored')
    expect(ctx.length).toBeLessThan(6000)           // far below the ~10KB persist threshold
  })

  test.skipIf(!hasJq())('--binding: one line, non-default keys only, under the proposal budget (measured 180 B)', () => {
    const line = mode(makePrdtHome({ register: REG }), '--binding')
    expect(line.split('\n').filter(Boolean)).toHaveLength(1)
    expect(line).toBe('[prdt register] form=outline · structure=planner-tables · address="션님" — governs user-chat. Binding only; any body arrived at session start.\n')
    expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(180)
  })

  test.skipIf(!hasJq())('stale mirror without a body file → that key emits nothing, the rest still arrives, no broken JSON', () => {
    const home = makePrdtHome({ register: REG })
    fs.rmSync(path.join(home, 'discipline', 'register', 'form-outline.md'))
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain(PLANNER_MARKER)
    expect(ctx).not.toContain(OUTLINE_MARKER)
  })
})

describe('PO-only scope (T-326: conversational output of the PO)', () => {
  for (const worker of ['prdt-designer', 'prdt-developer', 'prdt-qa', '']) {
    test.skipIf(!hasJq())(`${worker || 'plain session'} → nothing, even with a full register`, () => {
      const home = makePrdtHome({ register: 'form=outline\naddress=션님\n' })
      expect(runHook(AUDIENCE_HOOK, home, worker)).toBe('')
    })
  }
})

describe('T-358 channel separation', () => {
  test.skipIf(!hasJq())('main session-start payload does NOT carry a register body', () => {
    const home = makePrdtHome({ register: 'form=outline\n' })
    const mainCtx = additionalContextOf(runHook(SESSION_START_HOOK, home, 'prdt-po'))
    expect(mainCtx).not.toContain(PLANNER_MARKER)
    expect(mainCtx).not.toContain('BEGIN register')
  })
})

describe('register bodies — the object states its own scope', () => {
  const bodies = fs.readdirSync(REGISTER_DIR).filter((f) => f.endsWith('.md')).sort()

  test('exactly the three bodies exist, named <key>-<value>.md', () => {
    expect(bodies).toEqual(['audience-planner.md', 'form-outline.md', 'structure-planner-tables.md'])
  })

  for (const f of bodies) {
    test(`${f}: governs: frontmatter present and within the 2,000 B body budget`, () => {
      const text = fs.readFileSync(path.join(REGISTER_DIR, f), 'utf8')
      const [key, value] = f.replace(/\.md$/, '').split(/-(.+)/)
      expect(text.startsWith('---\n')).toBe(true)
      expect(text).toMatch(new RegExp(`^key: ${key}$`, 'm'))
      expect(text).toMatch(new RegExp(`^value: ${value}$`, 'm'))
      expect(text).toMatch(/^governs: \[user-chat\]$/m)
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2000)
    })
  }

  test('the short-sentences-vs-option-matrix line moved: in exactly one body, and that body is structure', () => {
    const hits = bodies.filter((f) => /prefer a few short sentences to a dense option matrix/i.test(fs.readFileSync(path.join(REGISTER_DIR, f), 'utf8')))
    expect(hits).toEqual(['structure-planner-tables.md'])
  })
})
