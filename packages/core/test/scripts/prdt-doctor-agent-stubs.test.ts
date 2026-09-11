/**
 * prdt doctor — agent stubs `agents/prdt-*.md` under the discipline machinery (T-578).
 *
 * Claude Code reads the INSTALLED copy at `~/.claude/agents/` as each
 * persona's base prompt; `install.sh` §3 copies the repo's `agents/prdt-*.md`
 * there with no content check. Three doctor checks cover the surface, each
 * in a declared severity class:
 *   - `agent stub mirror drift`         installed↔repo bytes     → VIOLATION (violations += 1)
 *   - `agent stub size budget`          bytes per stub > CAPS    → ADVISORY  (⚠ line, violations += 0)
 *   - `agent stub duplicates vs discipline`  sentence in both      → VIOLATION (violations += 1)
 *
 * Fixture shape follows prdt-doctor-hook-mirror-drift.test.ts: the REAL cli
 * is copied into a throwaway git checkout shaped `packages/core/{scripts/prdt,
 * agents/}` so `Path(__file__)`-relative repo discovery resolves there, never
 * to the real repo. CLAUDE_DIR / PRDT_HOME / PRDT_DISCIPLINE all point into
 * the sandbox — the developer's real ~/.claude and ~/.prdt are never read or
 * written. Built ONCE per file (T-557), copied per test.
 *
 * Every silent scenario has a positive sibling; severity is asserted as a
 * DELTA on the verdict line's `violations=` between the negative control and
 * the fixture, so no test depends on which other checks happen to run here.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REAL_PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REAL_AGENTS = path.join(CORE_ROOT, 'agents')
const REAL_DISCIPLINE = path.join(CORE_ROOT, 'discipline')
const REAL_DOCTRINE = path.join(CORE_ROOT, 'doctrine.md')
const STUBS = ['prdt-po.md', 'prdt-designer.md', 'prdt-developer.md', 'prdt-qa.md']

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const GIT = which('git')

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.example',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.example',
}

/** The cap as the CLI declares it — one SoT, read rather than restated. */
const CAP_BYTES = (() => {
  const m = fs.readFileSync(REAL_PRDT_CLI, 'utf8').match(/"agent_stub_bytes":\s*(\d+)/)
  if (!m) throw new Error('CAPS["agent_stub_bytes"] not found in scripts/prdt')
  return Number(m[1])
})()

let template: string
let sandbox: string
let repoAgents: string     // <sandbox>/repo/packages/core/agents
let cliCopy: string        // <sandbox>/repo/packages/core/scripts/prdt
let claudeDir: string      // CLAUDE_DIR — installed stubs live at <claudeDir>/agents
let machineHome: string    // PRDT_HOME
let disciplineDir: string  // PRDT_DISCIPLINE (copy of the real tree)
let projectDir: string

function git(args: string[], cwd: string) {
  execFileSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } })
}

const v1 = (name: string) => `---\nname: ${name}\n---\n\nv1 body of ${name}.\n`

/** Throwaway checkout with the REAL cli + REAL stubs; history = v1 bodies then
 *  the real bodies, so a BEHIND fixture has a real past commit to match. */
function buildTemplate(root: string) {
  const core = path.join(root, 'repo', 'packages', 'core')
  fs.mkdirSync(path.join(core, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(core, 'agents'), { recursive: true })
  fs.copyFileSync(REAL_PRDT_CLI, path.join(core, 'scripts', 'prdt'))
  fs.chmodSync(path.join(core, 'scripts', 'prdt'), 0o755)
  const repo = path.join(root, 'repo')
  git(['init', '-q'], repo)
  for (const s of STUBS) fs.writeFileSync(path.join(core, 'agents', s), v1(s.replace(/\.md$/, '')))
  git(['add', '-A'], repo); git(['commit', '-q', '-m', 'v1'], repo)
  for (const s of STUBS) fs.copyFileSync(path.join(REAL_AGENTS, s), path.join(core, 'agents', s))
  git(['add', '-A'], repo); git(['commit', '-q', '-m', 'v2 (real stubs)'], repo)
  // installed copies: synced to the repo (the clean state measured live on 2026-09-11)
  fs.mkdirSync(path.join(root, 'claude', 'agents'), { recursive: true })
  for (const s of STUBS) fs.copyFileSync(path.join(REAL_AGENTS, s), path.join(root, 'claude', 'agents', s))
  // discipline tree copy — the duplicate sweep's comparand
  fs.cpSync(REAL_DISCIPLINE, path.join(root, 'disc', 'discipline'), { recursive: true })
  fs.copyFileSync(REAL_DOCTRINE, path.join(root, 'disc', 'doctrine.md'))
  fs.mkdirSync(path.join(root, 'prdt-home', 'wiki'), { recursive: true })
  fs.mkdirSync(path.join(root, 'proj'), { recursive: true })
  execFileSync('python3', [path.join(core, 'scripts', 'prdt'), 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: path.join(root, 'proj'),
    env: { ...process.env, PRDT_HOME: path.join(root, 'prdt-home') },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
}

/** `prdt init` bakes the project's absolute path into `.prdt/meta.git/config` —
 *  retarget the copy so it does not point into the template (fixture hygiene,
 *  same note as the hook-drift test; no assertion here reaches the meta repo). */
function retargetMetaGit(root: string) {
  const cfg = path.join(root, 'proj', '.prdt', 'meta.git', 'config')
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf-8')
    .split(fs.realpathSync(template)).join(fs.realpathSync(root)))
}

type Run = { stubLines: string[]; violations: number; skipped: string[]; raw: string }

function doctor(): Run {
  const raw = execFileSync('python3', [cliCopy, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, CLAUDE_DIR: claudeDir, PRDT_DISCIPLINE: disciplineDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  const lines = raw.split('\n')
  const verdict = lines.find((l) => l.includes('[verdict='))
  const m = verdict?.match(/violations=(\d+)/)
  if (!m) throw new Error(`no verdict line in doctor output:\n${raw}`)
  return {
    raw,
    violations: Number(m[1]),
    stubLines: lines.filter((l) => l.startsWith('⚠ agent stub:')),
    skipped: lines.filter((l) => l.includes('could not look · agent stub')),
  }
}

const installed = (s: string) => path.join(claudeDir, 'agents', s)
const inRepo = (s: string) => path.join(repoAgents, s)
/** Same edit on both copies — drift stays silent, so the other two checks are isolated. */
function editBoth(s: string, fn: (text: string) => string) {
  for (const p of [installed(s), inRepo(s)]) fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')))
}

beforeAll(() => {
  if (!PYTHON3 || !GIT) return
  template = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-agent-stubs-seed-'))
  buildTemplate(template)
})
afterAll(() => { if (template) fs.rmSync(template, { recursive: true, force: true }) })

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-agent-stubs-'))
  fs.cpSync(template, sandbox, { recursive: true })
  retargetMetaGit(sandbox)
  repoAgents = path.join(sandbox, 'repo', 'packages', 'core', 'agents')
  cliCopy = path.join(sandbox, 'repo', 'packages', 'core', 'scripts', 'prdt')
  claudeDir = path.join(sandbox, 'claude')
  machineHome = path.join(sandbox, 'prdt-home')
  disciplineDir = path.join(sandbox, 'disc', 'discipline')
  projectDir = path.join(sandbox, 'proj')
})
afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3 || !GIT)('prdt doctor — agent stubs (T-578)', () => {
  test('negative control: real stubs, synced, under budget, no sentence shared with the discipline tree → all three silent and all three RAN', () => {
    const r = doctor()
    expect(r.stubLines).toEqual([])
    expect(r.skipped).toEqual([])
    for (const s of STUBS) expect(fs.statSync(installed(s)).size).toBeLessThanOrEqual(CAP_BYTES)
  })

  describe('size budget — ADVISORY (⚠ line, violations unchanged)', () => {
    test(`positive control: one stub grown past ${CAP_BYTES} B fires exactly one line and moves violations by 0`, () => {
      const base = doctor().violations
      const pad = '\n\nGrown: ' + 'x'.repeat(CAP_BYTES) + '\n'
      editBoth('prdt-qa.md', (t) => t + pad)
      expect(fs.statSync(installed('prdt-qa.md')).size).toBeGreaterThan(CAP_BYTES)
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toMatch(new RegExp(`agent stub: installed prdt-qa\\.md is [\\d,]+ B \\(budget ${CAP_BYTES.toLocaleString('en-US')} B\\)`))
      expect(r.violations).toBe(base)
    })

    test(`silent at exactly ${CAP_BYTES} B`, () => {
      editBoth('prdt-qa.md', (t) => {
        const cur = Buffer.byteLength(t, 'utf8')
        return t + 'y'.repeat(CAP_BYTES - cur)
      })
      expect(fs.statSync(installed('prdt-qa.md')).size).toBe(CAP_BYTES)
      expect(doctor().stubLines).toEqual([])
    })
  })

  describe('installed↔repo drift — VIOLATION (violations += 1)', () => {
    test('positive control: installed copy serving the committed v1 body → one BEHIND line', () => {
      const base = doctor().violations
      fs.writeFileSync(installed('prdt-developer.md'), v1('prdt-developer'))
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('agent stub: installed BEHIND repo — prdt-developer.md')
      // repo side is `.resolve()`d by _repo_root_candidates (macOS /var → /private/var)
      expect(r.stubLines[0]).toContain(`cp ${fs.realpathSync(repoAgents)}/prdt-*.md ${path.join(claudeDir, 'agents')}/`)
      expect(r.violations).toBe(base + 1)
    })

    test('a hand-edited installed copy matching no commit → one AHEAD line, not BEHIND', () => {
      const base = doctor().violations
      fs.appendFileSync(installed('prdt-po.md'), '\nHand-edited on the installed copy, never committed.\n')
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('AHEAD OF / HAND-EDITED')
      expect(r.stubLines[0]).toContain('prdt-po.md')
      expect(r.stubLines[0]).not.toContain('BEHIND')
      expect(r.violations).toBe(base + 1)
    })

    test('roster-as-a-set: a stub never installed → BEHIND; an orphan left installed → AHEAD with an rm repair', () => {
      fs.rmSync(installed('prdt-qa.md'))
      const behind = doctor()
      expect(behind.stubLines).toHaveLength(1)
      expect(behind.stubLines[0]).toContain('BEHIND repo — prdt-qa.md')
      fs.copyFileSync(inRepo('prdt-qa.md'), installed('prdt-qa.md'))
      fs.writeFileSync(installed('prdt-dropped.md'), '---\nname: prdt-dropped\n---\n\ngone from the repo.\n')
      const ahead = doctor()
      expect(ahead.stubLines).toHaveLength(1)
      expect(ahead.stubLines[0]).toContain('AHEAD OF / HAND-EDITED')
      expect(ahead.stubLines[0]).toContain(`rm ${installed('prdt-dropped.md')}`)
    })

    test('other tools’ agents and junk in the shared ~/.claude/agents dir are not stubs (install.sh §3 glob)', () => {
      fs.writeFileSync(installed('pdt-other-tool.md'), 'someone else’s agent')
      fs.writeFileSync(installed('.DS_Store'), 'finder junk')
      fs.writeFileSync(path.join(repoAgents, '.prdt-po.md.swp'), 'vim swap')
      expect(doctor().stubLines).toEqual([])
    })
  })

  describe('duplicate sweep vs the discipline tree — VIOLATION (violations += 1)', () => {
    test('positive control: one contracts sentence copied verbatim into a stub → exactly one line naming both homes', () => {
      const base = doctor().violations
      const contracts = fs.readFileSync(path.join(disciplineDir, 'contracts.md'), 'utf8')
      const line = contracts.split('\n').find((l) => l.startsWith('- Long-term memory is `memory_notes[]` ONLY.'))
      expect(line, 'anchor sentence still in contracts.md').toBeTruthy()
      const sentence = 'Long-term memory is `memory_notes[]` ONLY.'
      editBoth('prdt-designer.md', (t) => t + '\n' + sentence + '\n')
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('agent stub: installed prdt-designer.md and discipline/contracts.md carry the same sentence after normalization')
      expect(r.stubLines[0]).toContain('Long-term memory is')
      expect(r.violations).toBe(base + 1)
    })

    test('the same sentence reworded (emphasis, dash variant, case) still matches — the override key, not a byte compare', () => {
      editBoth('prdt-designer.md', (t) => t + '\n**LONG-TERM MEMORY** is memory_notes[] only\n')
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('discipline/contracts.md')
    })

    test('a sentence with no home in the tree is not a duplicate', () => {
      editBoth('prdt-designer.md', (t) => t + '\nA sentence that exists in no discipline document at all, T-578 fixture.\n')
      expect(doctor().stubLines).toEqual([])
    })

    /* QA F1 (2026-09-11): `is_rule_line`'s 8-char floor was tuned for whole
     * override LINES; at sentence grain the bound tree is a 20,533-key set whose
     * short band is design-reference token cells and fragments, so ANY ≥8-char
     * collision scored a VIOLATION on the verdict line — not a push gate, which
     * the comment used to claim: doctor prints "(non-blocking)" and exits 0, and
     * `violations=` is read by the Retro doctor step and the Definition of Done
     * (measured N-round). The fix's criterion and its declared tolerance — and
     * the misses it prices in — live at `AGENT_STUB_RULE_MIN_CHARS` in scripts/prdt. */
    test('QA F1 control: doctrine.md’s own preamble in a stub is a pointer and a fragment, not a duplicated rule → silent', () => {
      const base = doctor()
      const preamble = 'Beliefs, not rules. Rules live in `discipline/contracts.md`.'
      // the collision is real — both sentences DO live in the swept tree
      const doctrine = fs.readFileSync(path.join(sandbox, 'disc', 'doctrine.md'), 'utf8')
      expect(doctrine).toContain('Beliefs, not rules.')
      expect(doctrine).toContain('Rules live in `discipline/contracts.md`.')
      editBoth('prdt-developer.md', (t) => t + '\n' + preamble + '\n')
      const r = doctor()
      expect(r.stubLines).toEqual([])
      expect(r.violations).toBe(base.violations)
    })

    test('QA F1: the true positive is not sacrificed — the same rule shouted (F5: `!`) still fires exactly one line', () => {
      const base = doctor().violations
      editBoth('prdt-designer.md', (t) => t + '\nLong-term memory is `memory_notes[]` ONLY!\n')
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('discipline/contracts.md')
      expect(r.violations).toBe(base + 1)
    })

    test('QA F1: a Korean rule sentence with two homes still fires exactly one line (the floor weights CJK, not raw chars)', () => {
      const ko = '장기 기억은 `memory_notes[]` 뿐이며, 워커는 오버라이드 파일을 쓰지 않는다.'
      fs.appendFileSync(path.join(disciplineDir, 'contracts.md'), '\n- ' + ko + '\n')
      const base = doctor()                 // tree-side only: still silent
      expect(base.stubLines).toEqual([])
      editBoth('prdt-designer.md', (t) => t + '\n' + ko + '\n')
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('discipline/contracts.md')
      expect(r.violations).toBe(base.violations + 1)
    })
  })

  /* QA F2 (2026-09-11): every read in the three checks swallowed OSError and
   * `continue`d — the drift compare read that as "identical", the duplicate
   * sweep saw `parse_frontmatter`'s `({}, "")` as an empty stub, and the budget
   * still printed a size from `stat()`. All three counted as having RUN. */
  describe('QA F2 control: a stub doctor cannot read is reported, never spent as a clean 0', () => {
    test('installed prdt-qa.md at chmod 000, repo copy differing AND carrying a verbatim contracts sentence', () => {
      const base = doctor()
      expect(base.stubLines).toEqual([])
      fs.appendFileSync(inRepo('prdt-qa.md'), '\nLong-term memory is `memory_notes[]` ONLY.\n')
      fs.chmodSync(installed('prdt-qa.md'), 0o000)
      let readable = true
      try { fs.readFileSync(installed('prdt-qa.md')); } catch { readable = false }
      try {
        if (!readable) {
          const r = doctor()
          expect(r.stubLines.some((l) => l.includes('could not read the installed copy of prdt-qa.md'))).toBe(true)
          expect(r.stubLines.some((l) => l.includes('the duplicate sweep did not look at this stub'))).toBe(true)
          // "could not look" is the whole point: never silence, never a skip
          expect(r.skipped).toEqual([])
          expect(r.violations).toBeGreaterThan(base.violations)
        }
      } finally {
        fs.chmodSync(installed('prdt-qa.md'), 0o644)
      }
    })
  })

  /* QA N1/N2 (2026-09-11): the F2 repairs above sat behind a DISCOVERY filter
   * that dropped the very entries they describe. `_tree_files` kept only
   * `Path.is_file()`, which is False for a dangling symlink AND for a symlink
   * loop (ELOOP is one of the errors `is_file` swallows), so such an entry
   * reached none of the three checks — 0 agent-stub lines, violations=0, total
   * silence — while install.sh §3's glob copies the name and the harness loads
   * whatever is installed under it as a persona base prompt. The drift
   * message's own "fix the permissions (or the dangling link)" could never
   * fire. Repaired at the filter (`_agent_stub_files` walks with
   * `include_unreadable=True`), which is also what makes the budget's `stat()`
   * guard reachable: chmod 000 stats fine (F2 above), a path that does not
   * resolve does not. */
  describe('QA N1: an unreadable entry the directory listing HAS is discovered, never filtered away', () => {
    test('installed prdt-qa.md replaced by a dangling symlink → all three checks report it (N2: incl. the budget stat guard)', () => {
      const base = doctor()
      expect(base.stubLines).toEqual([])
      fs.rmSync(installed('prdt-qa.md'))
      fs.symlinkSync(path.join(claudeDir, 'agents', 'no-such-target.md'), installed('prdt-qa.md'))
      expect(fs.lstatSync(installed('prdt-qa.md')).isSymbolicLink()).toBe(true)
      expect(fs.existsSync(installed('prdt-qa.md'))).toBe(false)   // dangling: nothing to read
      const r = doctor()
      expect(r.stubLines).toHaveLength(3)
      // N2's trigger: `stat()` follows the link and raises where chmod 000 did not
      expect(r.stubLines.some((l) => l.includes('agent stub: installed prdt-qa.md could not be measured'))).toBe(true)
      expect(r.stubLines.some((l) => l.includes('could not read the installed copy of prdt-qa.md'))).toBe(true)
      expect(r.stubLines.some((l) => l.includes('the duplicate sweep did not look at this stub'))).toBe(true)
      expect(r.skipped).toEqual([])
      // drift + duplicates are VIOLATIONs, the budget line is advisory
      expect(r.violations).toBe(base.violations + 2)
    })

    test('a symlink loop named prdt-*.md is reported too, not dropped as "not a file"', () => {
      const base = doctor()
      fs.symlinkSync('prdt-loop.md', installed('prdt-loop.md'))   // points at itself
      const r = doctor()
      expect(r.stubLines).toHaveLength(3)
      expect(r.stubLines.some((l) => l.includes('agent stub: installed prdt-loop.md could not be measured'))).toBe(true)
      expect(r.stubLines.some((l) => l.includes('could not read installed prdt-loop.md'))).toBe(true)
      expect(r.stubLines.some((l) => l.includes('AHEAD OF / HAND-EDITED'))).toBe(true)
      expect(r.violations).toBe(base.violations + 2)
    })

    test('the broken copy can be the REPO one — the drift warning names that side, not the installed file', () => {
      const base = doctor()
      fs.rmSync(inRepo('prdt-po.md'))
      fs.symlinkSync(path.join(repoAgents, 'no-such-target.md'), inRepo('prdt-po.md'))
      const r = doctor()
      expect(r.stubLines).toHaveLength(1)
      expect(r.stubLines[0]).toContain('could not read the repo copy of prdt-po.md')
      expect(r.stubLines[0]).not.toContain('installed copy')
      expect(r.violations).toBe(base.violations + 1)
    })
  })

  /* QA F3 (2026-09-11): `AGENT_STUB_RE` was `prdt-[a-z][a-z0-9-]*\.md` while its
   * docstring called itself install.sh §3's glob (`cp agents/prdt-*.md`) — every
   * name with an underscore or a capital was copied by the installer and walked
   * by nothing. */
  test('QA F3 control: names install.sh copies but the old regex dropped (prdt-my_agent.md, prdt-QA2.md) are covered', () => {
    const base = doctor()
    const extras = ['prdt-my_agent.md', 'prdt-QA2.md']
    for (const n of extras) {
      fs.writeFileSync(path.join(repoAgents, n), `---\nname: ${n.replace(/\.md$/, '')}\n---\n\nnew stub, never installed.\n`)
    }
    const r = doctor()
    expect(r.stubLines).toHaveLength(1)
    expect(r.stubLines[0]).toContain('BEHIND repo')
    for (const n of extras) expect(r.stubLines[0]).toContain(n)
    expect(r.violations).toBe(base.violations + 1)
  })

  describe('skips are reported as "could not look", never spent as a clean 0', () => {
    test('no installed agents dir → drift skipped; budget + duplicates fall back to the repo copies and still run', () => {
      fs.rmSync(path.join(claudeDir, 'agents'), { recursive: true })
      expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(false)
      const r = doctor()
      expect(r.skipped).toHaveLength(1)
      expect(r.skipped[0]).toContain('agent stub mirror drift: no installed agents dir')
      // the fallback set is the repo: a repo stub grown past budget is reported as `repo`
      fs.appendFileSync(inRepo('prdt-po.md'), 'z'.repeat(CAP_BYTES))
      const grown = doctor()
      expect(grown.stubLines).toHaveLength(1)
      expect(grown.stubLines[0]).toContain('agent stub: repo prdt-po.md is')
    })

    test('no source tree nearby (repo agents/ absent) → drift skipped, the installed copies still get budget + sweep', () => {
      fs.rmSync(repoAgents, { recursive: true })
      const r = doctor()
      expect(r.skipped).toHaveLength(1)
      expect(r.skipped[0]).toContain('agent stub mirror drift: no source tree nearby')
      expect(r.stubLines).toEqual([])
    })
  })
})
