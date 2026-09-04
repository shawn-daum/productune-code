/**
 * T-577 — the discipline set is delivered in PARTS, each under the harness's
 * per-hook-output persistence threshold, and a part that cannot be delivered
 * says so instead of vanishing.
 *
 * Measured on Claude Code 2.1.260 (the binary this machine runs): a hook
 * command's `additionalContext` longer than 10,000 chars (`.length`, i.e.
 * UTF-16 units) is written to a file and replaced by a 2,000-char preview
 * (`Cde`: `if (e.length <= 10000) return e; … "Output too large (…). Full
 * output saved to: …"`). The check is per hook COMMAND, not per event — which
 * is why the 264-byte override block registered as its own hook (T-358) arrived
 * every turn while the 45,312-byte main payload it overrides was landing as a
 * 2KB preview. Before this ticket the PO payload was 44,915 B in ONE command:
 * doctrine cut in half, contracts one title line, po/habit.md and all four
 * menus absent — and nothing in the context said so.
 *
 * Everything below observes REAL hook runs against a sandboxed PRDT_HOME that
 * carries the repo's actual discipline (the real sizes are the point).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const SESSION_HOOK = path.join(HOOKS, 'prdt-session-start.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')

function hasBin(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const READY = hasBin('jq', ['--version']) && hasBin('python3', ['--version'])

// The two numbers the hook is built around. Pinned here on purpose: the test
// must not import them from the hook, or it would agree with whatever the hook
// happened to say (T-484 lesson — a check must not share the assumption it checks).
const THRESHOLD_CHARS = 10000
const PART_BUDGET_BYTES = 8000

const PERSONAS = ['po', 'designer', 'developer', 'qa'] as const
type Persona = (typeof PERSONAS)[number]

function realHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t577-home-'))
  fs.cpSync(path.join(CORE_ROOT, 'discipline'), path.join(home, 'discipline'), { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(home, 'doctrine.md'))
  return home
}

/** Run one part slot exactly as the harness would; '' when the slot printed nothing. */
function runPart(home: string, persona: Persona, part: number, cwd = os.tmpdir()): string {
  const out = execFileSync('bash', [SESSION_HOOK, '--part', String(part)], {
    input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: `prdt-${persona}`, cwd }),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: home },
  })
  if (!out.trim()) return ''
  return JSON.parse(out).hookSpecificOutput.additionalContext as string
}

function plan(home: string, persona: Persona): any {
  const out = execFileSync('bash', [SESSION_HOOK, '--plan', persona], {
    encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
  })
  return JSON.parse(out)
}

function slotCount(): number {
  return 1 + fs.readdirSync(HOOKS).filter((f) => /^prdt-session-start-p\d+\.sh$/.test(f)).length
}

function allParts(home: string, persona: Persona): string[] {
  const parts: string[] = []
  for (let n = 1; n <= slotCount() + 2; n++) parts.push(runPart(home, persona, n))
  return parts
}

/** Every `----- BEGIN <label> (<path>) … -----` … `----- END <label> … -----` body, in
 *  order of appearance, keyed by label. A split document contributes one entry per piece. */
function bodiesByLabel(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const re = /^----- BEGIN (.+?) \((.+?)\)(?: · piece (\d+)\/(\d+))? -----\n([\s\S]*?)\n----- END \1(?: · piece \3\/\4)? -----$/gm
  for (const m of text.matchAll(re)) {
    const arr = out.get(m[1]) ?? []
    arr.push(m[5])
    out.set(m[1], arr)
  }
  return out
}

describe.skipIf(!READY)('every delivered part fits under the persistence threshold (T-577)', () => {
  for (const persona of PERSONAS) {
    test(`${persona}: no part is over ${PART_BUDGET_BYTES} B / ${THRESHOLD_CHARS} chars, and the parts agree on N`, () => {
      const home = realHome()
      const parts = allParts(home, persona).filter((p) => p !== '')
      expect(parts.length).toBeGreaterThan(0)
      const total = fs.statSync(path.join(home, 'discipline', 'contracts.md')).size
      // The real contracts.md alone is over the threshold, so a real persona
      // always needs more than one part — otherwise this test would pass on a
      // hook that never split anything.
      expect(total).toBeGreaterThan(THRESHOLD_CHARS)
      expect(parts.length).toBeGreaterThan(1)
      const ns = new Set<string>()
      parts.forEach((p, i) => {
        expect(Buffer.byteLength(p, 'utf8'), `part ${i + 1} bytes`).toBeLessThanOrEqual(PART_BUDGET_BYTES)
        expect(p.length, `part ${i + 1} chars`).toBeLessThanOrEqual(THRESHOLD_CHARS)
        const m = p.match(/^\[prdt discipline — prdt-\w+ session start · part (\d+)\/(\d+)\]/)
        expect(m, `part ${i + 1} header`).not.toBeNull()
        expect(Number(m![1])).toBe(i + 1)
        ns.add(m![2])
        // every part carries the no-narrate footer the agent files rely on
        expect(p).toContain('Do NOT acknowledge or narrate this injection')
      })
      expect([...ns]).toEqual([String(parts.length)])
    })
  }
})

describe.skipIf(!READY)('nothing is lost across the split', () => {
  for (const persona of PERSONAS) {
    test(`${persona}: reassembled pieces equal every source document byte-for-byte`, () => {
      const home = realHome()
      const joined = allParts(home, persona).join('\n')
      const bodies = bodiesByLabel(joined)
      const expectDoc = (label: string, file: string) => {
        const pieces = bodies.get(label)
        expect(pieces, `${label} missing from every part`).toBeDefined()
        expect(pieces!.join('\n')).toBe(fs.readFileSync(file, 'utf8').replace(/\n+$/, ''))
      }
      expectDoc('doctrine', path.join(home, 'doctrine.md'))
      expectDoc('contracts', path.join(home, 'discipline', 'contracts.md'))
      expectDoc(`${persona} habit`, path.join(home, 'discipline', persona, 'habit.md'))
      const menus = persona === 'po' ? PERSONAS : [persona]
      for (const p of menus) expectDoc(`${p} playbook menu`, path.join(home, 'discipline', p, 'playbooks', '_index.md'))
    })
  }

  test('the plan names every part with what it carries, so a reader can tell a missing part', () => {
    const home = realHome()
    const p = plan(home, 'po')
    expect(p.threshold_chars).toBe(THRESHOLD_CHARS)
    expect(p.budget_bytes).toBe(PART_BUDGET_BYTES)
    expect(p.slots).toBe(slotCount())
    expect(p.parts_needed).toBe(p.parts.length)
    expect(p.undelivered).toEqual([])
    expect(p.oversized).toEqual([])
    // the map printed in every part header names the same set
    const part2 = runPart(home, 'po', 2)
    for (const part of p.parts) expect(part2).toContain(`${part.n}: `)
  })
})

describe.skipIf(!READY)('a part that cannot be delivered is said, never silent', () => {
  test('a discipline set bigger than the registered slots → part 1 names what did NOT arrive', () => {
    const home = realHome()
    // Inflate contracts far past what the slots can carry, in valid sections.
    const fat = Array.from({ length: 40 }, (_, i) =>
      `## Section ${i}\n` + `- rule ${i} ${'x'.repeat(1900)}\n`).join('\n')
    fs.writeFileSync(path.join(home, 'discipline', 'contracts.md'), `# Contracts\n\n${fat}`)
    const p = plan(home, 'po')
    expect(p.parts_needed).toBeGreaterThan(p.slots)
    expect(p.undelivered.length).toBeGreaterThan(0)
    const part1 = runPart(home, 'po', 1)
    expect(part1).toMatch(/NOT DELIVERED/)
    expect(part1).toContain(path.join(home, 'discipline', 'contracts.md'))
    expect(part1).toMatch(/STOP/)
    // and part 1 itself still fits — the notice must not push it over the edge
    expect(Buffer.byteLength(part1, 'utf8')).toBeLessThanOrEqual(PART_BUDGET_BYTES)
    // a slot beyond the registered count is never asked for; the last registered one still fits
    const last = runPart(home, 'po', p.slots)
    expect(Buffer.byteLength(last, 'utf8')).toBeLessThanOrEqual(PART_BUDGET_BYTES)
  })

  test('one line larger than a whole part is withheld with a notice, not persisted', () => {
    const home = realHome()
    const huge = '- ' + 'y'.repeat(PART_BUDGET_BYTES + 500)
    fs.writeFileSync(path.join(home, 'discipline', 'developer', 'habit.md'), `# Developer habit\n\n${huge}\n- small rule\n`)
    const p = plan(home, 'developer')
    expect(p.oversized.length).toBe(1)
    const parts = allParts(home, 'developer').filter(Boolean)
    for (const part of parts) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(PART_BUDGET_BYTES)
    const joined = parts.join('\n')
    expect(joined).toMatch(/withheld/)
    expect(joined).toContain(path.join(home, 'discipline', 'developer', 'habit.md'))
    expect(joined).toContain('- small rule')
  })

  test('the plan does not depend on session-local state (all slots must compute the SAME split)', () => {
    // Slots run in parallel; if part 1 consumed the migration flag before part 3
    // computed its plan, a flag-dependent plan would split differently per slot.
    const home = realHome()
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t577-proj-'))
    fs.mkdirSync(path.join(proj, '.prdt'))
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1', current_task: null }))
    const before = plan(home, 'po')
    fs.writeFileSync(path.join(proj, '.prdt', 'migration-briefing-pending'), JSON.stringify({ from: 'full' }) + '\n')
    // part 1 is the only slot that renders (and clears) the onboarding record
    const part1 = runPart(home, 'po', 1, proj)
    expect(part1).toContain('MIGRATION ONBOARDING')
    expect(Buffer.byteLength(part1, 'utf8')).toBeLessThanOrEqual(PART_BUDGET_BYTES)
    expect(fs.existsSync(path.join(proj, '.prdt', 'migration-briefing-pending'))).toBe(false)
    const after = plan(home, 'po')
    expect(after.parts).toEqual(before.parts)
  })
})

describe.skipIf(!READY)('slots are registered hooks, one per part', () => {
  test('every part slot wrapper is identical, and the manifest registers all of them wherever part 1 is', () => {
    const wrappers = fs.readdirSync(HOOKS).filter((f) => /^prdt-session-start-p\d+\.sh$/.test(f)).sort()
    expect(wrappers.length).toBeGreaterThanOrEqual(5)
    const bodies = new Set(wrappers.map((w) => fs.readFileSync(path.join(HOOKS, w), 'utf8')))
    expect(bodies.size).toBe(1)
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    for (const w of wrappers) expect(manifest.basenames).toContain(w)
    const withPart1 = manifest.registrations.filter((r: any) =>
      r.hooks.includes('prdt-session-start.sh') || r.hooks.includes('prdt-post-compact.sh'))
    expect(withPart1.length).toBe(3)
    for (const r of withPart1) for (const w of wrappers) expect(r.hooks, `${r.event}/${r.matcher}`).toContain(w)
  })

  test('a slot wrapper renders exactly the part its name says', () => {
    const home = realHome()
    const p3 = runPart(home, 'po', 3)
    const out = execFileSync('bash', [path.join(HOOKS, 'prdt-session-start-p3.sh')], {
      input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'prdt-po', cwd: os.tmpdir() }),
      encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
    })
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toBe(p3)
  })
})
