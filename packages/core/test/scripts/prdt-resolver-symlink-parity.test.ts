/**
 * prdt-resolver-symlink-parity.test.ts — T-493 item 3/4.
 *
 * The projectRoot contract has FIVE shell/python implementations, and until this
 * ticket they did not agree. `scripts/prdt` resolves PHYSICALLY (`Path.resolve()`);
 * the four hooks and `statusline-prdt.sh` walked the cwd LEXICALLY, and the
 * statusline additionally kept nearest-wins after T-484 moved everything else to
 * outermost-wins. Put one symlink component on the cwd and the chains fork:
 * measured 2026-08-18, from `<decoy>/link` (a symlink to `<real>/code`) the CLI
 * resolved <real> while all five others resolved <decoy> — so the statusline
 * displayed one project's stage/version while `prdt` read and WROTE the other
 * project's `po-state.json`. No attacker required; a symlinked checkout is enough.
 *
 * HOW THIS CHECKS ITSELF (T-493 asks explicitly): the expected answer is never
 * computed by walking a path, because a walk is the thing under test. It comes
 * from the fixture's own ground truth — two roots seeded with DIFFERENT content —
 * and each resolver is read from an OBSERVED OUTCOME: which project's override
 * body came out, which project's stage/version rendered, which project's
 * `sessions.json` got written, which project's slug the statusline printed. The
 * two resolvers that do print a path are compared against the raw string, never
 * a realpath-normalized one (the pre-existing parity test normalized the hook's
 * answer with `fs.realpathSync`, which is precisely why it never saw this bug).
 *
 * Every case also runs against a PRE-FIX copy of the same script — one mechanical
 * substitution that puts the lexical walk back — so the divergence this closes is
 * visible in the same run rather than asserted from memory.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const SESSION_HOOK = path.join(HOOKS, 'prdt-session-start.sh')
const PROJECT_OVERRIDES_HOOK = path.join(HOOKS, 'prdt-project-overrides-inject.sh')
const USER_PROMPT_HOOK = path.join(HOOKS, 'prdt-user-prompt.sh')
const POST_DISPATCH_HOOK = path.join(HOOKS, 'prdt-post-dispatch.sh')
const STATUSLINE = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')

function hasBin(bin: string): boolean {
  try { execFileSync('command', ['-v', bin], { stdio: 'ignore', shell: '/bin/bash' }); return true } catch { return false }
}
const READY = hasBin('jq') && hasBin('python3')

/** The one substitution that restores each resolver's pre-T-493 lexical walk. */
const PRE_FIX: Record<string, [string, string]> = {
  [SESSION_HOOK]: ['phys="$(cd -P -- "$1" 2>/dev/null && pwd -P)"', 'phys=""'],
  [PROJECT_OVERRIDES_HOOK]: ['phys="$(cd -P -- "$1" 2>/dev/null && pwd -P)"', 'phys=""'],
  [STATUSLINE]: ['PHYS="$(cd -P -- "$CWD" 2>/dev/null && pwd -P)"', 'PHYS=""'],
  [USER_PROMPT_HOOK]: ['os.path.realpath(ev.get("cwd") or os.getcwd())', '(ev.get("cwd") or os.getcwd())'],
  [POST_DISPATCH_HOOK]: ['os.path.realpath(ev.get("cwd") or os.getcwd())', '(ev.get("cwd") or os.getcwd())'],
}

/** A copy of `script` with its physical resolve removed — the pre-fix behavior. */
function lexicalCopyOf(script: string): string {
  const [from, to] = PRE_FIX[script]
  const src = fs.readFileSync(script, 'utf8')
  expect(src, `the physical resolve must be present in ${path.basename(script)} to be undone`).toContain(from)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t493-prefix-'))
  const p = path.join(dir, path.basename(script))
  fs.writeFileSync(p, src.replace(from, to), { mode: 0o755 })
  return p
}

interface Fixture {
  real: string
  decoy: string
  /** cwds that carry a symlink component, plus one that does not (control) */
  cwds: { name: string; cwd: string; symlinked: boolean }[]
  home: string
}

/** Two complete projects with DIFFERENT identities, and symlinks that make a
 *  lexical walk land on the wrong one. `<decoy>/link -> <real>/code` is the shape
 *  a symlinked checkout produces; `<rlink> -> <real>` is the same project reached
 *  by another name, where a lexical walk answers a path string nothing else uses. */
function makeFixture(): Fixture {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t493-')))
  const seed = (root: string, id: string, version: string, stage: string, ticket: string) => {
    fs.mkdirSync(path.join(root, '.prdt', 'overrides'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
      schema_version: 1, stage, version,
      current_task: { ticket_id: ticket, slug: `${id.toLowerCase()}-task`, assignee: 'developer' },
    }))
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: id, code: { dir: 'code' } }))
    fs.writeFileSync(path.join(root, '.prdt', 'overrides', 'developer.md'), `- ${id}-OVERRIDE-RULE\n`)
  }
  const real = path.join(base, 'real')
  const decoy = path.join(base, 'decoy')
  fs.mkdirSync(path.join(real, 'code', 'src', 'deep'), { recursive: true })
  seed(real, 'REALPROJ', 'v1.6', 'build', 'T-493')
  seed(decoy, 'DECOYPROJ', 'v9.9', 'ship', 'T-001')
  fs.symlinkSync(path.join(real, 'code'), path.join(decoy, 'link'))
  fs.symlinkSync(real, path.join(base, 'rlink'))

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t493-home-'))
  for (const p of ['po', 'designer', 'developer', 'qa']) {
    fs.mkdirSync(path.join(home, 'discipline', p, 'playbooks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'discipline', p, 'habit.md'), `# ${p}\n`)
    fs.writeFileSync(path.join(home, 'discipline', p, 'playbooks', '_index.md'), '| menu |\n')
  }
  fs.mkdirSync(path.join(home, 'overrides'), { recursive: true })
  fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(home, 'discipline', 'contracts.md'), '# contracts\n')

  return {
    real,
    decoy,
    home,
    cwds: [
      { name: 'symlink to the code root', cwd: path.join(decoy, 'link'), symlinked: true },
      { name: 'deep inside that symlink', cwd: path.join(decoy, 'link', 'src', 'deep'), symlinked: true },
      { name: 'symlink to the project root', cwd: path.join(base, 'rlink'), symlinked: true },
      { name: 'no symlink at all (control)', cwd: path.join(real, 'code'), symlinked: false },
    ],
  }
}

const run = (script: string, event: unknown, env: NodeJS.ProcessEnv = {}) =>
  execFileSync('bash', [script], {
    input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, ...env },
  })
const ctxOf = (out: string) =>
  out.trim() ? (JSON.parse(out).hookSpecificOutput.additionalContext as string) : ''

/**
 * Every resolver's answer, as `REALPROJ` | `DECOYPROJ` | `none`, read from what
 * the resolver DID rather than from any path arithmetic of our own.
 */
function answers(f: Fixture, cwd: string, prefix = false): Record<string, string> {
  const pick = (s: string) =>
    s.includes('REALPROJ') || s.includes('/real') || s.includes('v1.6') ? 'REALPROJ'
      : s.includes('DECOYPROJ') || s.includes('/decoy') || s.includes('v9.9') ? 'DECOYPROJ'
        : `none(${s.slice(0, 40)})`
  const script = (s: string) => (prefix ? lexicalCopyOf(s) : s)

  // 1. the CLI — the reference implementation, and the only one already physical
  const cli = execFileSync('python3', ['-c', `
import importlib.machinery, importlib.util, sys
l = importlib.machinery.SourceFileLoader("m", ${JSON.stringify(PRDT_CLI)})
s = importlib.util.spec_from_loader("m", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
r = m.find_project_root(${JSON.stringify(cwd)}); print(r or "")
`], { encoding: 'utf8' }).trim()

  // 2. prdt-session-start.sh — its persona-unspecified branch names the root
  const ss = ctxOf(run(script(SESSION_HOOK), { hook_event_name: 'SessionStart', cwd }, { PRDT_HOME: f.home }))

  // 3. prdt-project-overrides-inject.sh — WHICH project's override body came out
  const po = ctxOf(run(script(PROJECT_OVERRIDES_HOOK),
    { agent_type: 'prdt-developer', hook_event_name: 'SubagentStart', cwd }, { PRDT_HOME: f.home }))
  const poBody = po.match(/[A-Z]+PROJ-OVERRIDE-RULE/)?.[0] ?? ''

  // 4. prdt-user-prompt.sh — WHICH project's stage/version rendered
  const up = ctxOf(run(script(USER_PROMPT_HOOK), { hook_event_name: 'UserPromptSubmit', cwd, prompt: 'hi' }))

  // 5. prdt-post-dispatch.sh — WHICH project's .prdt/sessions.json got written
  for (const r of [f.real, f.decoy]) fs.rmSync(path.join(r, '.prdt', 'sessions.json'), { force: true })
  run(script(POST_DISPATCH_HOOK), {
    hook_event_name: 'PostToolUse', tool_name: 'Agent',
    tool_input: { subagent_type: 'prdt-developer' }, cwd,
  })
  const wrote = [
    fs.existsSync(path.join(f.real, '.prdt', 'sessions.json')) ? 'REALPROJ' : '',
    fs.existsSync(path.join(f.decoy, '.prdt', 'sessions.json')) ? 'DECOYPROJ' : '',
  ].filter(Boolean).join('+') || 'none'

  // 6. statusline-prdt.sh — WHICH project's slug it printed
  const sl = run(script(STATUSLINE), { workspace: { current_dir: cwd } })

  return {
    'scripts/prdt': pick(cli),
    'prdt-session-start.sh': pick(ss),
    'prdt-project-overrides-inject.sh': pick(poBody),
    'prdt-user-prompt.sh': pick(up),
    'prdt-post-dispatch.sh': wrote,
    'statusline-prdt.sh': pick(sl),
    _cliPath: cli,
    _ssPath: ss.match(/prdt project \(([^)]*)\)/)?.[1] ?? '',
  }
}

let f: Fixture
beforeEach(() => { f = makeFixture() })

const CASES = [
  'symlink to the code root',
  'deep inside that symlink',
  'symlink to the project root',
  'no symlink at all (control)',
] as const

describe.skipIf(!READY)('all five resolvers answer identically, symlinks included (T-493)', () => {
  for (const name of CASES) {
    test(name, () => {
      const here = f.cwds.find((x) => x.name === name)!.cwd
      const got = answers(f, here)

      for (const [who, ans] of Object.entries(got)) {
        if (who.startsWith('_')) continue
        expect(ans, `${who} resolved the wrong project from ${here}`).toBe('REALPROJ')
      }
      // the two resolvers that print a path print the SAME path — compared raw,
      // never realpath-normalized, or a lexical answer would slip through
      expect(got._ssPath).toBe(got._cliPath)
      expect(got._cliPath).toBe(f.real)
    })
  }
})

describe.skipIf(!READY)('pre-fix control: the lexical walk really did diverge', () => {
  test('from a symlinked cwd, every pre-fix resolver answers a DIFFERENT project than the CLI', () => {
    const here = f.cwds[0].cwd            // <decoy>/link -> <real>/code
    const got = answers(f, here, true)

    // the CLI was always physical, so it is the one that does NOT move
    expect(got['scripts/prdt']).toBe('REALPROJ')
    // …and every lexical resolver landed on the decoy: the data-corruption case
    for (const who of ['prdt-session-start.sh', 'prdt-project-overrides-inject.sh',
      'prdt-user-prompt.sh', 'prdt-post-dispatch.sh', 'statusline-prdt.sh']) {
      expect(got[who], `${who} was expected to diverge before the fix`).toBe('DECOYPROJ')
    }
    // the sharpest reading of it: the statusline showed one project's state while
    // the CLI wrote the other's po-state, in one terminal
    expect(got['statusline-prdt.sh']).not.toBe(got['scripts/prdt'])
  })

  test('reached by another name, the pre-fix walk answered a path string nothing else used', () => {
    const here = f.cwds[2].cwd            // <rlink> -> <real>
    const before = answers(f, here, true)
    const after = answers(f, here)
    expect(before._ssPath).not.toBe(before._cliPath)   // <rlink> vs <real>
    expect(after._ssPath).toBe(after._cliPath)
  })

  test('with no symlink on the cwd, pre-fix and post-fix are identical (no behavior traded away)', () => {
    const here = f.cwds[3].cwd
    const before = answers(f, here, true)
    const after = answers(f, here)
    for (const who of Object.keys(after)) expect(after[who]).toBe(before[who])
  })
})
