/**
 * T-578 — agents/prdt-*.md are STUBS: one shared bootstrap paragraph (agent
 * name substituted) + one mirror-absent paragraph in two variants (worker / PO).
 * The self-load PROCEDURE lives in prdt-session-start.sh `--self-load`, and the
 * turn-economy rule (T-491) lives in the discipline tree — neither in these
 * files. This test pins the stubs' SHAPE (one text, name-substituted); `prdt
 * doctor` covers the directory itself since T-578 slice B — byte budget,
 * installed↔repo drift, duplicate sweep vs the discipline tree — see
 * test/scripts/prdt-doctor-agent-stubs.test.ts.
 */

import path from 'path'
import fs from 'fs'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..')
const AGENTS = path.join(CORE_ROOT, 'agents')
const DISC = path.join(CORE_ROOT, 'discipline')
const WORKERS = ['prdt-developer', 'prdt-qa', 'prdt-designer'] as const
const ALL = ['prdt-po', ...WORKERS] as const

// The budget doctor enforces — read from the CLI's CAPS (its basis is stated
// there), not restated here: two copies of one number is the T-445 drift class.
const STUB_CAP_BYTES = (() => {
  const m = fs.readFileSync(path.join(CORE_ROOT, 'scripts', 'prdt'), 'utf8').match(/"agent_stub_bytes":\s*(\d+)/)
  if (!m) throw new Error('CAPS["agent_stub_bytes"] not found in scripts/prdt')
  return Number(m[1])
})()

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
    // T-639: the contracts half was counted by its `(T-491)` TAG, exactly as
    // the per-persona half below was before T-613 — and `contracts.md` is an
    // injected file, so the T-611 sweep took that tag too. Same repair, same
    // reason: the pin holds the RULE. Exactly one line carries the kernel, and
    // that line states the budget unit, names the governor that counts it, and
    // defers the per-count behaviour to the persona habits (where the lines
    // pinned below state it). Stricter than the tag count was.
    const KERNEL_LINE = /\b(?:Turn|Dispatch) economy\b/
    const kernel = contracts.split('\n').filter((l) => KERNEL_LINE.test(l))
    expect(kernel.length, 'discipline/contracts.md: lines stating the turn-economy kernel (matched by rule text — a (T-491) tag is not required and not sufficient)').toBe(1)
    expect(kernel[0], 'discipline/contracts.md: the turn-economy kernel no longer states TURNS as the budget unit').toMatch(/TURNS are the budget, not bytes/)
    expect(kernel[0], 'discipline/contracts.md: the turn-economy kernel no longer names the governor that counts the turns').toMatch(/`prdt-call-governor\.sh`\) counts API turns per dispatch/)
    expect(kernel[0], 'discipline/contracts.md: the turn-economy kernel no longer defers the per-count behaviour to the persona habit').toMatch(/what it does at which count: that persona's habit/)
    // T-613: the per-persona half used to be counted by its `(T-491)` TAG.
    // T-611 slice 1 strips history tags out of injected files on purpose, so
    // qa/habit.md lost the tag while keeping the rule — restoring the tag is
    // not an option, and counting a tag was never the point. The pin now holds
    // the RULE: exactly one line per habit stating that persona's own terms,
    // and that line carrying the governor fact for it (prdt-call-governor.sh:
    // developer 40/60, qa+designer advisory, po not counted). This is stricter
    // than the tag count was — the governor fact must sit ON the rule line, not
    // merely somewhere in the file.
    const RULE_LINE = /^- (?:\*\*)?(?:Turn|Dispatch) economy\b/
    const TERMS: Record<string, RegExp> = {
      po: /You yourself are not counted\./,
      developer: /warns you at 40 API turns and denies every tool call at 60/,
      qa: /never denied a tool call/,
      designer: /never denied a tool call/,
    }
    for (const [p, terms] of Object.entries(TERMS)) {
      const habit = fs.readFileSync(path.join(DISC, p, 'habit.md'), 'utf8')
      const lines = habit.split('\n').filter((l) => RULE_LINE.test(l))
      expect(lines.length, `${p}/habit.md: lines stating this persona's turn/dispatch economy terms (matched by rule text — a (T-491) tag is not required and not sufficient)`).toBe(1)
      expect(lines[0], `${p}/habit.md: the turn-economy line no longer carries this persona's governor fact ${terms}`).toMatch(terms)
    }
  })
})
