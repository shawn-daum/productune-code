/**
 * Hot→cold split of the discipline (T-586 slice 1).
 *
 * contracts.md sat at 80/80 lines and po/habit.md at 64/64 with three
 * amendments queued against them. Instead of folding more text into at-cap
 * lines (the failure T-578 measured: a rule living where nothing checks it,
 * drifting into four texts), clauses a persona needs only once it is already
 * doing one specific thing moved VERBATIM into load-on-demand documents:
 *
 *   - `discipline/contracts/<name>.md` annexes — shared contracts text, the way
 *     playbook bodies already load (Bash cat, pointer in the hot text, never
 *     injected);
 *   - two PO playbooks (`define-entry`, `dispatch-failure`) — PO-only procedure,
 *     reached the way every PO playbook is reached: the habit names it.
 *
 * What this pins:
 *   1. every `contracts/<name>.md` pointer written into hot text resolves, and
 *      every annex is pointed at from contracts.md itself (an unreachable cold
 *      clause has lost its binding force — acceptance 3);
 *   2. each moved clause is verbatim in its cold home and GONE from the hot text
 *      (no dual text — acceptance 6);
 *   3. what a persona needs before it can act stayed hot;
 *   4. the delivery plan of THIS tree (the hook's own `--plan`, never a
 *      re-implementation of the split) fits the registered slots.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const DISC = path.join(CORE_ROOT, 'discipline')
const SESSION_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')
const read = (p: string) => fs.readFileSync(p, 'utf8')

const CONTRACTS = read(path.join(DISC, 'contracts.md'))
const HABITS = Object.fromEntries(
  (['po', 'developer', 'qa', 'designer'] as const).map((p) => [p, read(path.join(DISC, p, 'habit.md'))]),
) as Record<'po' | 'developer' | 'qa' | 'designer', string>
const ANNEX_DIR = path.join(DISC, 'contracts')
const ANNEXES = ['return-envelope', 'fixed-paths', 'tickets', 'definition-of-done', 'git'] as const
const annex = (n: string) => read(path.join(ANNEX_DIR, `${n}.md`))
const POINTER_RE = /`contracts\/([a-z-]+)\.md`/g

describe('contracts annexes — every pointer resolves, every annex is pointed at', () => {
  test('the annex dir holds exactly the five annexes and nothing else', () => {
    expect(fs.readdirSync(ANNEX_DIR).filter((f) => f.endsWith('.md')).sort()).toEqual([...ANNEXES].map((n) => `${n}.md`).sort())
  })

  test('every `contracts/<name>.md` pointer in contracts.md and the four habits resolves to a file', () => {
    const texts = [CONTRACTS, ...Object.values(HABITS)]
    const seen = new Set<string>()
    for (const t of texts) for (const m of t.matchAll(POINTER_RE)) seen.add(m[1])
    expect(seen.size).toBeGreaterThan(0)
    for (const n of seen) expect(fs.existsSync(path.join(ANNEX_DIR, `${n}.md`)), `dead pointer contracts/${n}.md`).toBe(true)
  })

  test('every annex is reachable from contracts.md itself — no orphan cold document', () => {
    for (const n of ANNEXES) expect(CONTRACTS, `contracts.md never points at contracts/${n}.md`).toContain(`\`contracts/${n}.md\``)
  })

  test('every annex declares name / section / when frontmatter, name matching the file', () => {
    for (const n of ANNEXES) {
      const a = annex(n)
      expect(a.startsWith('---\n')).toBe(true)
      expect(a).toMatch(new RegExp(`^name: ${n}$`, 'm'))
      expect(a).toMatch(/^section: .+$/m)
      expect(a).toMatch(/^when: ".+"$/m)
    }
  })
})

// Each row: [cold home, a load-bearing substring of the moved clause]. The
// substring must be in the cold document verbatim and absent from contracts.md —
// a copy left behind is the dual text this split exists to prevent.
const MOVED: ReadonlyArray<readonly [(typeof ANNEXES)[number], string]> = [
  ['return-envelope', '`variant_matrix[]{variant,verdict}` — the last returned whenever the verified change renders conditional variants'],
  ['fixed-paths', 'Never `[[…]]` here — `prdt wiki lint` covers `docs/wiki/` alone, so a wikilink out of that store is an unchecked dead link.'],
  ['fixed-paths', '`prdt doctor` watches the seam: orphan spec files · promotion candidates (done tickets in ≥2 version dirs, unjudged)'],
  ['fixed-paths', 'A design/token contract or build pipeline the code imports or builds from (e.g. `tokens.json` → a token build script) is code no matter the subject matter'],
  ['tickets', 'names its exact target — page, asset, API route, or field; a bare verb with no named target is not acceptance-complete.'],
  ['tickets', "Redeploys append to the version's single `ops` ticket, not new tickets."],
  ['definition-of-done', '`discipline_root()` prefers `~/.prdt/discipline` over the repo, so it binds no persona until that mirror is resynced'],
  ['git', "whether that merge lands locally or through a pull request is the REPOSITORY's policy"],
  ['git', 'The mechanical block is a per-clone pre-push hook that `prdt init` / `prdt doctor` writes into the code repo\'s own `.git/hooks`'],
  ['git', '**Remote default branch = `main`, always** (GitHub repo setting).'],
  ['git', 'Isolation (branch + worktree, Agent-native option) only on three triggers'],
]

describe('moved clauses are verbatim in the cold document and gone from the hot text', () => {
  for (const [home, literal] of MOVED) {
    test(`${home}: ${literal.slice(0, 48)}…`, () => {
      expect(annex(home)).toContain(literal)
      expect(CONTRACTS).not.toContain(literal)
    })
  }
})

describe('what a persona needs before it can act stayed hot in contracts.md', () => {
  const HOT = [
    // §Return: required keys + the pointer that replaces the QA-extras line
    'Required: `persona` · `task`(≤80) · `summary`(≤200, machine outcome) · `confidence`(0..1)',
    'QA live/smoke extras: `contracts/return-envelope.md`',
    // §Fixed paths: the read-FIRST duty and the validity-tag vocabulary a READER needs
    'read it FIRST, before touching that feature',
    '`(vX~vY, replaced-by …)`',
    'Meta/code split test = coupling, never "is it a doc"',
    // §Tickets: the enum and the body shape
    '`status` is the whole enum.',
    '- Body = `## Request` / `## Acceptance` / `## Outcome`.',
    // §DoD: the check itself
    '- Not done until: build green · lint clean · typecheck clean · relevant tests green · acceptance verified against the ticket.',
    // §Git: residence + hard rule + every-commit rules + the consent gate (floor)
    '`main` is the deploy branch, reached ONLY by promoting `dev → main`',
    '**Hard rules**: never push `main` directly',
    '- Stage explicitly — never `git add .` / `git add -A`.',
    '- No push / promote-to-main / PR / force-push / tag push / destructive git without explicit user instruction.',
  ]
  for (const h of HOT) test(h.slice(0, 60), () => expect(CONTRACTS).toContain(h))

  test('the floor did not move: Secrets, carve-outs, Overrides are whole sections in contracts.md', () => {
    expect(CONTRACTS).toContain('## Secrets — production credentials never enter agent context (EVERY persona, PO included)')
    expect(CONTRACTS).toContain('## Overrides — precedence and the non-overridable floor')
    expect(CONTRACTS).toContain('- Carve-out: `~/.prdt/plan-tier` is PO-writable')
    expect(CONTRACTS).toContain('- Carve-out: `~/.prdt/overrides/<persona>.md` and `~/.prdt/wiki/` are PO-writable.')
    for (const n of ANNEXES) expect(annex(n)).not.toMatch(/Secrets|Carve-out|non-overridable/)
  })

  test('line room was actually freed (contracts 80 → 74, po habit 64 → 60) and the caps still hold', () => {
    const lines = (s: string) => s.replace(/\n$/, '').split('\n').length
    expect(lines(CONTRACTS)).toBe(74)
    expect(lines(HABITS.po)).toBe(60)
    expect(lines(HABITS.developer)).toBeLessThanOrEqual(40)
    expect(lines(HABITS.qa)).toBeLessThanOrEqual(40)
    expect(lines(HABITS.designer)).toBeLessThanOrEqual(40)
  })
})

describe('po habit — Define entry and dispatch failure live in playbooks the habit names', () => {
  const pb = (n: string) => read(path.join(DISC, 'po', 'playbooks', `${n}.md`))
  const menu = read(path.join(DISC, 'po', 'playbooks', '_index.md'))

  test('the habit names both playbooks (PO playbooks load only when the habit calls them by name)', () => {
    expect(HABITS.po).toContain('Define entry loads the `define-entry` playbook — the direction fork there comes BEFORE any `prd-clarity` dispatch')
    expect(HABITS.po).toContain('the `dispatch-failure` playbook')
    expect(menu).toMatch(/^\| define-entry \| /m)
    expect(menu).toMatch(/^\| dispatch-failure \| /m)
  })

  test('define-entry carries the fork, the backlog sweep and the fable session line verbatim; the habit no longer does', () => {
    const p = pb('define-entry')
    for (const s of [
      '- **Define entry on a net-new version section — always, however complete the PRD/wiki/tickets already look**',
      'the direction fork comes BEFORE any `prd-clarity` dispatch — 2–3 named options, max 3',
      '- On next Define entry: unobserved outcome in the last retro → ask the user once; backlog sweep (`prdt tickets --backlog`) once',
      '- **Fable session guidance**: at Define entry (plan gate passed), recommend once, in conversation',
    ]) {
      expect(p).toContain(s)
      expect(HABITS.po).not.toContain(s)
    }
  })

  test('dispatch-failure carries the re-route + quota-kill procedure; the before-dispatch probe stayed hot', () => {
    const p = pb('dispatch-failure')
    for (const s of [
      're-dispatch the SAME `[ctx]` one tier down at **max**',
      '**the walk stops at `sonnet`**',
      '**A quota kill is none of that and never lowers a tier by itself**',
      'A kill can land mid-work, so read the tree before re-dispatching',
    ]) {
      expect(p).toContain(s)
      expect(HABITS.po).not.toContain(s)
    }
    expect(HABITS.po).toMatch(/[Pp]robe with `prdt preflight <model>` before spawning at any floor above sonnet\./)
    // recognition stays hot: the habit still says what a failed dispatch looks like
    expect(HABITS.po).toContain('no valid envelope back (empty stdout · first char not `{` · tool-invocation error) or a safety refusal in place of the work — is PO-detected and PO-initiated')
  })

  test('the release-notes rule moved to the retro playbook; patch-cycle points there, not at the habit', () => {
    const rule = 'Release notes on any `v*` tag cut (version close OR patch close): in the SAME change that cuts the tag, add a `## <version>` section to `<codeRoot>/docs/RELEASES.md`'
    expect(pb('retro')).toContain(rule)
    expect(HABITS.po).not.toContain(rule)
    expect(pb('patch-cycle')).toContain('the release-notes rule applies — `retro` playbook, Rules:')
    expect(pb('patch-cycle')).not.toContain("PO habit's release-notes rule")
  })

  test('recognition-teaching rules stayed in the resident layer (fact--discipline-editing)', () => {
    expect(HABITS.po).toContain('- Stage regression = a decision-reversal event, not a lifecycle path.')
    expect(HABITS.po).toContain('- **Deploy IS ship.**')
    expect(HABITS.po).toContain('- The starting `version` is fixed at project init — preserve it.')
    expect(HABITS.po).toContain('- Ship patch loop (in-ship, pre-close)')
  })
})

describe('worker habits point at the annex where their own act needs it', () => {
  test('qa habit: live-verification extras pointer', () => {
    expect(HABITS.qa).toContain('Full list incl. `variant_matrix[]`: `contracts/return-envelope.md`.')
  })
  test('designer habit: spec-authoring pointer', () => {
    expect(HABITS.designer).toContain('Frontmatter edges, wikilinks and the doctor seam: `contracts/fixed-paths.md`.')
  })
  test('po habit: isolation triggers pointer', () => {
    expect(HABITS.po).toContain('Worktree isolation only on the three contract triggers (`contracts/git.md`)')
  })
})

function hasBin(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const READY = hasBin('jq', ['--version']) && hasBin('python3', ['--version'])

describe.skipIf(!READY)('delivery — the hook plan of THIS tree', () => {
  // Same shape as session-start-parts.test.ts: a temp home carrying this repo's
  // discipline tree, so the plan describes the split being shipped, not the mirror.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t586-home-'))
  fs.cpSync(DISC, path.join(home, 'discipline'), { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(home, 'doctrine.md'))
  const plan = (persona: string) => JSON.parse(execFileSync('bash', [SESSION_HOOK, '--plan', persona], {
    encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
  }))

  test('part 1 names the annexes as load-on-demand next to playbook bodies', () => {
    const out = execFileSync('bash', [SESSION_HOOK, '--part', '1'], {
      input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'prdt-developer', cwd: os.tmpdir() }),
      encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
    })
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain('Playbook bodies and `contracts/*.md` annexes load on demand via Bash cat under')
  })

  for (const persona of ['po', 'developer', 'qa', 'designer']) {
    test(`${persona}: every part under budget, set fits the registered slots, annexes are not in the injected set`, () => {
      const p = plan(persona)
      expect(p.parts_needed).toBeLessThanOrEqual(p.slots)
      for (const part of p.parts) expect(part.bytes).toBeLessThanOrEqual(p.budget_bytes)
      expect(JSON.stringify(p)).not.toContain('discipline/contracts/')
    })
  }
})
