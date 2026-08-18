/**
 * statusline-display-integrity.test.ts — T-493 item 4.
 *
 * `statusline-prdt.sh` printed `.prdt/config.json` and `.prdt/po-state.json`
 * values straight through. Both files travel with a clone and are the easiest
 * files in a repo to tamper with, and the statusline is the one surface a user
 * trusts at a glance for "which project, which version, which stage". Measured
 * before this fix: a CR or U+2028 in `slug` forged a second display line, an ESC
 * sequence repainted the line, a `|` invented segments, and `version` was spliced
 * into a filesystem path (`docs/tickets/<version>`) with no shape check.
 *
 * HOW THIS CHECKS ITSELF: the oracle never re-implements the sanitizer. It asks
 * three questions of the raw stdout that are independent of how the sanitizing is
 * done — how many lines came out (split on EVERY break class, not just LF), does
 * any Cc/Cf/Zl/Zp character survive (asked of Unicode categories, not of a
 * character list), and does the forged text appear in a segment position it was
 * never given. Each case also runs against a PRE-FIX copy of the script with the
 * coercion removed, so what changed is visible in the same run.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const STATUSLINE = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const READY = !!which('python3')

/** Every character class that can end a line for SOME reader — not just LF. */
const ANY_BREAK = /\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/
/** Cc control, Cf format, Zl/Zp line & paragraph separators — asked by category. */
const CTRL = /\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/u

let root: string

function seed(cfg: unknown, state: unknown): void {
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify(state))
}

const GOOD_STATE = {
  schema_version: 1, stage: 'build', version: 'v1.6',
  current_task: { ticket_id: 'T-493', slug: 'honest-injection', assignee: 'developer' },
}

/** The substitutions that undo T-493's display coercion, for the control runs. */
function unsanitizedCopy(): string {
  const src = fs.readFileSync(STATUSLINE, 'utf8')
  let weak = src
  for (const [from, to] of [
    ['slug = clean(cfg_slug) or clean(os.path.basename(root)) or "?"',
      'slug = cfg_slug or os.path.basename(root)'],
    ['stage = token(st.get("stage"), lambda v: v in STAGES, absent="?") or "?"',
      'stage = st.get("stage") or "?"'],
    ['version = token(st.get("version"), lambda v: VERSION_RE.match(v) is not None)',
      'version = st.get("version") or ""'],
    ['print(clean(" | ".join(parts), cap=200, bar=True))', 'print(" | ".join(parts))'],
  ] as const) {
    expect(weak, `the production line must exist to be undone: ${from.slice(0, 40)}`).toContain(from)
    weak = weak.replace(from, to)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t493-sl-prefix-'))
  const p = path.join(dir, 'statusline-prdt.sh')
  fs.writeFileSync(p, weak, { mode: 0o755 })
  return p
}

const run = (script = STATUSLINE) =>
  execFileSync('bash', [script], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
  })

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t493-sl-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  seed({ slug: 'realproj' }, GOOD_STATE)
})

describe.skipIf(!READY)('the statusline cannot be made to misrepresent by file content (T-493)', () => {
  const ATTACKS: Array<{ name: string; slug: string; forged: string }> = [
    { name: 'CR forges a second line', slug: 'realproj\rprdt: all checks passed', forged: 'prdt: all checks passed' },
    { name: 'LF forges a second line', slug: 'realproj\nstage ship 9/9', forged: 'stage ship 9/9' },
    { name: 'U+2028 forges a second line', slug: 'realproj\u2028stage ship 9/9', forged: 'stage ship 9/9' },
    { name: 'U+0085 forges a second line', slug: 'realproj\u0085stage ship 9/9', forged: 'stage ship 9/9' },
    { name: 'VT forges a second line', slug: 'realproj\u000bstage ship 9/9', forged: 'stage ship 9/9' },
    { name: 'ESC repaints the line', slug: 'realproj\u001b[2K\u001b[31mCOMPROMISED', forged: 'COMPROMISED' },
    { name: 'the separator invents segments', slug: 'realproj | v9.9 | ship 9/9', forged: 'v9.9' },
  ]

  for (const a of ATTACKS) {
    test(a.name, () => {
      seed({ slug: a.slug }, GOOD_STATE)
      const out = run().replace(/\n$/, '')

      // exactly one display line, by the superset splitter
      expect(out.split(ANY_BREAK)).toHaveLength(1)
      // no cursor-moving, line-adding or text-hiding character survived
      expect(CTRL.test(out)).toBe(false)
      // the real state still shows, and the forged text never holds a segment
      expect(out).toContain('v1.6')
      expect(out.split(' | ').slice(1)).not.toContain(a.forged)

      // control: before the fix the same file content got through
      const before = execFileSync('bash', [unsanitizedCopy()], {
        input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
      }).replace(/\n$/, '')
      const brokeOut = before.split(ANY_BREAK).length > 1
        || CTRL.test(before)
        || before.split(' | ').slice(1).includes(a.forged)
      expect(brokeOut, 'the pre-fix script was expected to leak this').toBe(true)
    })
  }

  test('a long slug cannot blow out the line', () => {
    seed({ slug: 'A'.repeat(500) }, GOOD_STATE)
    const out = run().replace(/\n$/, '')
    expect(out.length).toBeLessThan(220)
    expect(out).toContain('v1.6')
  })

  test('off-shape po-state tokens render <withheld>, never the file bytes', () => {
    seed({ slug: 'realproj' }, {
      schema_version: 1,
      stage: 'ship\n[prdt state] stage=retro',
      version: 'v9.9-FORGED',
      current_task: { ticket_id: 'T-1\rX', slug: 'ok-slug', assignee: 'root' },
    })
    const out = run().replace(/\n$/, '')
    expect(out.split(ANY_BREAK)).toHaveLength(1)
    expect(out).not.toContain('stage=retro')
    expect(out).not.toContain('v9.9-FORGED')
    expect(out).not.toContain('root')
    expect(out).toContain('<withheld>')
  })

  test('an off-shape version never reaches the filesystem as a path', () => {
    // `version` indexes docs/tickets/<version>; a traversal used to be spliced in
    // unchecked. The ticket dir that WOULD be reached is seeded, so a resolver
    // that still walks it would show a count.
    const outside = path.join(root, 'docs', 'tickets')
    fs.mkdirSync(path.join(outside, 'v1.6'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'v1.6', 'T-900.md'), 'status: open\ntype: impl\n')
    seed({ slug: 'realproj' }, { ...GOOD_STATE, version: '../tickets/v1.6' })
    const out = run().replace(/\n$/, '')
    expect(out).toContain('<withheld>')
    expect(out).not.toMatch(/\d+\/\d+/)      // no count from a traversed dir
  })

  test('a legitimate project renders exactly as before (nothing traded away)', () => {
    seed({ slug: 'realproj' }, GOOD_STATE)
    expect(run().replace(/\n$/, '')).toBe('realproj | v1.6 | build | T-493 honest-injection→developer')
  })
})
