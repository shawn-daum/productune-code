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
import { pin, pinAbsent } from '../helpers/pin'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const DISC = path.join(CORE_ROOT, 'discipline')
const SESSION_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')
const read = (p: string) => fs.readFileSync(p, 'utf8')

const CONTRACTS = read(path.join(DISC, 'contracts.md'))
const HABITS = Object.fromEntries(
  (['po', 'developer', 'qa', 'designer'] as const).map((p) => [p, read(path.join(DISC, p, 'habit.md'))]),
) as Record<'po' | 'developer' | 'qa' | 'designer', string>
const ANNEX_DIR = path.join(DISC, 'contracts')
// T-613: this list used to be five hardcoded names and read "exactly the five
// annexes" while the tree carried seven — a pin that fails on a LEGAL addition
// says nothing about what to fix. The list is read from disk instead, and the
// property that hardcoding was protecting (no annex the hot text never names,
// no name the hot text points at without a file) is asserted as a set equality
// below. Adding an annex without registering it in contracts.md still fails.
const ANNEXES: readonly string[] = fs
  .readdirSync(ANNEX_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()
const annex = (n: string) => read(path.join(ANNEX_DIR, `${n}.md`))
const POINTER_RE = /`contracts\/([a-z-]+)\.md`/g

describe('contracts annexes — every pointer resolves, every annex is pointed at', () => {
  test('the annex dir and contracts.md name the same set — no orphan file, no unregistered annex', () => {
    expect(ANNEXES.length).toBeGreaterThan(0)
    const registered = [...new Set([...CONTRACTS.matchAll(POINTER_RE)].map((m) => m[1]))].sort()
    expect(registered, 'annex files on disk vs `contracts/<name>.md` pointers in contracts.md').toEqual([...ANNEXES])
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
      pin(annex(home), literal, {
        file: `discipline/contracts/${home}.md`,
        protects: 'a clause moved out of contracts.md by the hot→cold split must survive verbatim in its cold home',
      })
      pinAbsent(CONTRACTS, literal, {
        file: 'discipline/contracts.md',
        protects: 'no dual text — the hot copy was deleted when the clause moved',
      })
    })
  }
})

describe('what a persona needs before it can act stayed hot in contracts.md', () => {
  const HOT = [
    // §Return: the QA pointer that replaces the extras line (the required keys
    // get their own line-scoped test below — T-613)
    'QA live/smoke extras: `contracts/return-envelope.md`',
    // §Fixed paths: the read-FIRST duty
    // (the validity-tag vocabulary is NOT here any more — see the designer-habit
    // test below: it is spec-AUTHORING vocabulary and moved with the rest of it)
    'read it FIRST, before touching that feature',
    'Meta/code split test = coupling, never "is it a doc"',
    // §Tickets: the enum and the body shape
    '`status` is the whole enum.',
    '- Body = `## Request` / `## Acceptance` / `## Outcome`.',
    // restored from the annex by T-586 slice 2A — slice 1's own audit named it the weakest-reachability move
    '- An access-control Acceptance line (gate / hide / restrict / limit) names its exact target — page, asset, API route, or field; a bare verb with no named target is not acceptance-complete.',
    // §DoD: the check itself
    '- Not done until: build green · lint clean · typecheck clean · relevant tests green · acceptance verified against the ticket.',
    // §Git: residence + hard rule + every-commit rules + the consent gate (floor)
    '`main` is the deploy branch, reached ONLY by promoting `dev → main`',
    '**Hard rules**: never push `main` directly',
    '- Stage explicitly — never `git add .` / `git add -A`.',
    '- No push / promote-to-main / PR / force-push / tag push / destructive git without explicit user instruction.',
  ]
  for (const h of HOT)
    test(h.slice(0, 60), () =>
      pin(CONTRACTS, h, {
        file: 'discipline/contracts.md',
        protects: 'a persona needs this clause BEFORE it can act, so it stays in the injected hot text — moving it to an annex is the regression',
      }),
    )

  // T-613: pinned as four key literals scoped to the `- Required:` LINE, not as
  // one long sentence. The property is "all four keys with their caps are still
  // required, in the hot text"; the old whole-sentence pin broke the moment
  // `persona`'s enum and `confidence`'s "a JSON number — never a word" were
  // added INSIDE it — a wording addition that strengthened the very rule the
  // pin existed to protect.
  test('§Return envelope: the Required line still names all four keys with their caps', () => {
    const line = CONTRACTS.split('\n').find((l) => l.startsWith('- Required:'))
    expect(line, 'contracts.md §Return envelope no longer opens with a `- Required:` line').toBeDefined()
    for (const key of ['`persona`', '`task`(≤80)', '`summary`(≤200, machine outcome)', '`confidence`(0..1'])
      pin(line!, key, {
        file: 'discipline/contracts.md (the `- Required:` line)',
        protects: 'the four envelope keys and their caps are machine-enforced at SubagentStop — dropping one from the hot text unbinds it',
      })
  })

  test('the floor did not move: Secrets, carve-outs, Overrides are whole sections in contracts.md', () => {
    expect(CONTRACTS).toContain('## Secrets — production credentials never enter agent context (EVERY persona, PO included)')
    expect(CONTRACTS).toContain('## Overrides — precedence and the non-overridable floor')
    expect(CONTRACTS).toContain('- Carve-out: `~/.prdt/plan-tier` is PO-writable')
    // T-613: re-pinned to the current wording. T-586 added the playbook-scoped
    // override path to this carve-out; the carve-out clause is floor text, so
    // the test follows contracts.md, never the reverse. Every path the line
    // names is pinned separately — a path silently DROPPED from a carve-out is
    // the regression this guards, and a single long literal hides which one.
    for (const p of [
      '- Carve-out: `~/.prdt/overrides/<persona>.md`',
      '`~/.prdt/overrides/playbooks/<name>.md`',
      '`~/.prdt/wiki/`',
      '`~/.prdt/register` are PO-writable',
    ])
      pin(CONTRACTS, p, {
        file: 'discipline/contracts.md',
        protects: 'the PO-writable carve-out enumerates every writable path under the read-only runtime root; a path added or dropped changes the floor',
      })
    for (const n of ANNEXES) expect(annex(n)).not.toMatch(/Secrets|Carve-out|non-overridable/)
  })

  // This test's job is the compression gain from T-586/T-611, not the hard cap
  // — the caps themselves are guarded elsewhere and do not depend on this test
  // (contracts ≤80: prdt-doctor-promotion-path.test.ts, prdt-doctor-feature-seam.test.ts;
  // po habit ≤64: prdt-doctor-po-habit-cap.test.ts, where doctor itself warns).
  // A `toBe(76)`/`toBe(58)` exact pin fired on every legal line-count-preserving
  // edit and had already been re-bumped three rounds running (T-586, T-611,
  // T-631) — QA named that class each time. Ceilings at what the tree now holds
  // instead: 77, not 76, because T-630 moved a voice kernel out of po/habit.md
  // into contracts §Language today, costing po habit 2 lines (58→56) and
  // contracts 1 (76→77).
  test('line room stays within what T-586/T-611/T-630 compressed it to (contracts ≤77, po habit ≤56) — hard caps enforced elsewhere', () => {
    const lines = (s: string) => s.replace(/\n$/, '').split('\n').length
    expect(lines(CONTRACTS)).toBeLessThanOrEqual(77)
    expect(lines(HABITS.po)).toBeLessThanOrEqual(56)
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

  // T-613: `(vX~vY, replaced-by …)` was pinned as hot contracts text. It is not
  // hot any more and should not be: tagging a fact is something only the AUTHOR
  // of a spec file does, so the vocabulary sits where that act happens — the
  // designer habit (author) and the fixed-paths annex (the spec-authoring
  // rules). The pin moved with the rule rather than being deleted, and the
  // no-dual-text half is asserted on the contracts row it left.
  test('designer habit + fixed-paths annex carry the validity-tag vocabulary (it left the contracts row)', () => {
    for (const [where, text] of [
      ['discipline/designer/habit.md', HABITS.designer],
      ['discipline/contracts/fixed-paths.md', annex('fixed-paths')],
    ] as const)
      for (const tag of ['`(vX~)`', '`(vX~vY, replaced-by …)`'])
        pin(text, tag, {
          file: where,
          protects: 'the validity-window tag vocabulary — without it a spec file states a contract with no idea when it was true, and an invalidated fact gets deleted instead of annotated',
        })
    const row = CONTRACTS.split('\n').find((l) => l.startsWith('|') && l.includes('`docs/features/<feature>.md`'))!
    pinAbsent(row, '`(vX~', { file: 'discipline/contracts.md (the Fixed paths feature-spec row)', protects: 'no dual text — authoring vocabulary lives at the authoring site only' })
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
