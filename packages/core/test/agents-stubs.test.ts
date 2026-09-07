/**
 * T-578 — agents/prdt-*.md are STUBS: one shared bootstrap paragraph (agent
 * name substituted) + one mirror-absent paragraph in two variants (worker / PO).
 * The self-load PROCEDURE lives in prdt-session-start.sh `--self-load`, and the
 * turn-economy rule (T-491) lives in the discipline tree — neither in these
 * files. This test is the drift pin until `prdt doctor` covers the directory
 * (T-578 slice B): an edit to one stub that does not reach the others fails here.
 */

import path from 'path'
import fs from 'fs'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..')
const AGENTS = path.join(CORE_ROOT, 'agents')
const DISC = path.join(CORE_ROOT, 'discipline')
const WORKERS = ['prdt-developer', 'prdt-qa', 'prdt-designer'] as const
const ALL = ['prdt-po', ...WORKERS] as const

// Generous ceiling for a stub; the pre-T-578 files were 3,358–3,962 B each.
const STUB_CAP_BYTES = 2000

function read(agent: string): string {
  return fs.readFileSync(path.join(AGENTS, `${agent}.md`), 'utf8')
}
/** frontmatter, bootstrap paragraph, mirror-absent paragraph */
function split(agent: string): { fm: string; boot: string; absent: string } {
  const text = read(agent)
  const m = text.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*?)\n\n([\s\S]*?)\n?$/)
  if (!m) throw new Error(`${agent}: not frontmatter + two paragraphs`)
  return { fm: m[1], boot: m[2], absent: m[3] }
}
const neutral = (s: string, agent: string) => s.split(agent).join('prdt-<agent>')

describe('agents/prdt-*.md are stubs over one hook-carried bootstrap (T-578)', () => {
  test('exactly the four persona stubs exist and each names itself', () => {
    const files = fs.readdirSync(AGENTS).filter((f) => f.endsWith('.md')).sort()
    expect(files).toEqual([...ALL].map((a) => `${a}.md`).sort())
    for (const a of ALL) expect(split(a).fm).toMatch(new RegExp(`^name: ${a}$`, 'm'))
  })

  test('the bootstrap paragraph is ONE text: identical across all four once the agent name is substituted', () => {
    const texts = ALL.map((a) => neutral(split(a).boot, a))
    for (const t of texts.slice(1)) expect(t).toBe(texts[0])
    expect(texts[0]).toContain('prdt-<agent>')   // the name really is substituted, not dropped
  })

  test('each stub points at the hook self-load with its OWN agent type and carries no procedure of its own', () => {
    for (const a of ALL) {
      const { boot } = split(a)
      expect(boot).toContain(`bash ~/.prdt/hooks/prdt-session-start.sh --self-load ${a}`)
      // the old inline procedure and its duplicated prose are gone
      expect(boot).not.toMatch(/cat ~\/\.prdt\/doctrine\.md/)
      expect(boot).not.toContain('prdt-overrides-inject.sh')
      expect(boot).not.toMatch(/T-469|T-483|T-493|gutter|non-overridable floor/)
      // the two rules a stub still owns: silence, and "an injected block IS the discipline"
      expect(boot).toMatch(/never narrate/)
      expect(boot).toMatch(/IS your discipline — do not re-verify or re-load it/)
    }
  })

  test('the mirror-absent paragraph has exactly two variants: one worker text, one PO text', () => {
    const w = WORKERS.map((a) => split(a).absent)
    for (const t of w.slice(1)) expect(t).toBe(w[0])
    expect(w[0]).toContain('`needs_info: true`')
    expect(w[0]).toContain('Never hand anyone a command to run')
    const po = split('prdt-po').absent
    expect(po).not.toBe(w[0])
    expect(po).toContain('run it yourself')
    expect(po).not.toContain('needs_info')
  })

  test(`every stub is under ${STUB_CAP_BYTES} B`, () => {
    for (const a of ALL) expect(Buffer.byteLength(read(a), 'utf8'), a).toBeLessThanOrEqual(STUB_CAP_BYTES)
  })

  test('T-491 lives in the discipline tree, not in the stubs: contracts kernel once + one per-persona line in each habit', () => {
    for (const a of ALL) expect(read(a)).not.toMatch(/T-491|Turn economy|Dispatch economy/)
    const contracts = fs.readFileSync(path.join(DISC, 'contracts.md'), 'utf8')
    expect(contracts.match(/T-491/g)?.length).toBe(1)
    expect(contracts).toMatch(/Turn economy \(T-491\)/)
    for (const p of ['po', 'developer', 'qa', 'designer']) {
      const habit = fs.readFileSync(path.join(DISC, p, 'habit.md'), 'utf8')
      const lines = habit.split('\n').filter((l) => l.includes('T-491'))
      expect(lines.length, `${p}/habit.md T-491 lines`).toBe(1)
    }
    // the per-persona facts match the governor's scope (prdt-call-governor.sh: developer 40/60, qa+designer advisory, po not counted)
    expect(fs.readFileSync(path.join(DISC, 'developer', 'habit.md'), 'utf8')).toMatch(/warns you at 40 API turns and denies every tool call at 60/)
    expect(fs.readFileSync(path.join(DISC, 'qa', 'habit.md'), 'utf8')).toMatch(/never denied a tool call/)
    expect(fs.readFileSync(path.join(DISC, 'designer', 'habit.md'), 'utf8')).toMatch(/never denied a tool call/)
    expect(fs.readFileSync(path.join(DISC, 'po', 'habit.md'), 'utf8')).toMatch(/Dispatch economy\*\* \(T-491\)/)
  })
})
